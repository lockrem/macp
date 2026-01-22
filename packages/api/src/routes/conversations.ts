import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ulid } from 'ulid';
import {
  createClaudeAdapter,
  createOpenAIAdapter,
  createGeminiAdapter,
  createGroqAdapter,
  type AgentAdapter,
} from '@macp/core';
import { connectionManager } from '../services/connection-manager.js';
import { deliveryCoordinator } from '../services/push-service.js';
import { conversationStore, type StoredConversation } from '../services/redis-store.js';
import {
  extractFactsFromConversation,
  generateLLMSummary,
} from '../services/fact-extraction.js';

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const createConversationSchema = z.object({
  topic: z.string().min(1).max(500),
  goal: z.string().max(500).optional(),
  mode: z.enum(['bts', 'campfire', 'solo']).default('campfire'),
  maxTurns: z.number().min(1).max(50).default(20),
  inviteeUserId: z.string().optional(),
  inviteeEmail: z.string().email().optional(),
  // Solo mode options
  memoryCategories: z.array(z.string()).optional(), // Categories to inject into context
  extractFacts: z.boolean().default(true), // Whether to extract facts after conversation
});

const startConversationSchema = z.object({
  participantAgentIds: z.array(z.string()).min(2).max(2), // P2P = exactly 2 agents
});

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export function registerConversationRoutes(app: FastifyInstance): void {
  // Create a new conversation (send invitation)
  app.post('/conversations', async (req, reply) => {
    const userId = req.user?.userId || 'demo-user';
    const body = createConversationSchema.parse(req.body);

    const now = new Date().toISOString();
    const conversation: StoredConversation = {
      id: ulid(),
      topic: body.topic,
      goal: body.goal,
      mode: body.mode,
      maxTurns: body.maxTurns,
      status: 'pending',
      currentTurn: 0,
      initiatorId: userId,
      participants: [],
      messages: [],
      createdAt: now,
    };

    await conversationStore.set(conversation);

    // TODO: If inviteeUserId or inviteeEmail provided, create invitation

    reply.code(201);
    return {
      id: conversation.id,
      topic: conversation.topic,
      goal: conversation.goal || null,
      mode: conversation.mode,
      maxTurns: conversation.maxTurns,
      status: conversation.status,
      currentTurn: conversation.currentTurn,
      createdAt: conversation.createdAt,
    };
  });

  // Get conversation details
  app.get('/conversations/:conversationId', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };
    const conversation = await conversationStore.get(conversationId);

    if (!conversation) {
      reply.code(404);
      return { error: 'Conversation not found' };
    }

    return conversation;
  });

  // Join a conversation (add your agent)
  app.post('/conversations/:conversationId/join', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };
    const userId = req.user?.userId || 'demo-user';
    const body = z.object({
      agentId: z.string(),
      apiKey: z.string().min(1), // Required: client's API key for their provider
      agentConfig: z.object({
        displayName: z.string(),
        provider: z.enum(['anthropic', 'openai', 'gemini', 'groq']),
        modelId: z.string(),
        systemPrompt: z.string().optional(),
        personality: z.string().optional(),
      }),
    }).parse(req.body);

    const conversation = await conversationStore.get(conversationId);
    if (!conversation) {
      reply.code(404);
      return { error: 'Conversation not found' };
    }

    if (conversation.participants.length >= 2) {
      reply.code(400);
      return { error: 'Conversation already has maximum participants' };
    }

    const participant = {
      id: ulid(),
      userId,
      agentId: body.agentId,
      apiKey: body.apiKey, // Store the client's API key
      agentConfig: body.agentConfig,
    };

    conversation.participants.push(participant);
    await conversationStore.set(conversation);
    await conversationStore.addUserToConversation(userId, conversationId);

    // Subscribe user to WebSocket updates
    connectionManager.subscribeToConversation(userId, conversationId);

    return {
      participantId: participant.id,
      conversationId,
      participantCount: conversation.participants.length,
    };
  });

  // Start the conversation (begin agent-to-agent dialogue)
  app.post('/conversations/:conversationId/start', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };

    const conversation = await conversationStore.get(conversationId);
    if (!conversation) {
      reply.code(404);
      return { error: 'Conversation not found' };
    }

    if (conversation.participants.length < 1) {
      reply.code(400);
      return { error: 'Need at least 1 participant to start' };
    }

    if (conversation.status !== 'pending') {
      reply.code(400);
      return { error: 'Conversation already started' };
    }

    conversation.status = 'active';
    await conversationStore.set(conversation);

    // Start the conversation asynchronously
    runConversation(conversation, conversationStore).catch(err => {
      app.log.error('Conversation error:', err);
    });

    return {
      conversationId,
      status: 'active',
      message: 'Conversation started',
    };
  });

  // Get conversation messages
  app.get('/conversations/:conversationId/messages', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };
    const conversation = await conversationStore.get(conversationId);

    if (!conversation) {
      reply.code(404);
      return { error: 'Conversation not found' };
    }

    return {
      conversationId,
      messages: conversation.messages,
      currentTurn: conversation.currentTurn,
      status: conversation.status,
    };
  });

  // List user's conversations
  app.get('/conversations', async (req) => {
    const userId = req.user?.userId || 'demo-user';

    const userConversations = await conversationStore.getByUser(userId);
    // Filter out archived conversations
    const activeConversations = userConversations.filter(c => !c.isArchived);
    const mapped = activeConversations.map(c => ({
      id: c.id,
      topic: c.topic,
      goal: c.goal || null,
      mode: c.mode,
      maxTurns: c.maxTurns,
      status: c.status,
      currentTurn: c.currentTurn,
      createdAt: c.createdAt,
      participants: c.participants.map(p => ({
        id: p.id,
        agentName: p.agentConfig.displayName,
        provider: p.agentConfig.provider,
      })),
    }));

    return { conversations: mapped };
  });

  // Stop/pause a conversation
  app.post('/conversations/:conversationId/stop', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };

    const conversation = await conversationStore.get(conversationId);
    if (!conversation) {
      reply.code(404);
      return { error: 'Conversation not found' };
    }

    if (conversation.status !== 'active') {
      reply.code(400);
      return { error: 'Conversation is not active' };
    }

    // Mark as paused - the runConversation loop will check this
    conversation.status = 'paused';
    await conversationStore.set(conversation);

    // Notify all participants
    broadcastToConversation(conversationId, {
      type: 'conversation_paused',
      turnNumber: conversation.currentTurn,
      status: 'paused',
    });

    console.log(`[Conversation] Stopped conversation ${conversationId} at turn ${conversation.currentTurn}`);

    return {
      conversationId,
      status: 'paused',
      stoppedAtTurn: conversation.currentTurn,
      message: 'Conversation stopped',
    };
  });

  // Generate a shareable invitation link for a conversation
  app.post('/conversations/:conversationId/invite', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };

    const conversation = await conversationStore.get(conversationId);
    if (!conversation) {
      reply.code(404);
      return { error: 'Conversation not found' };
    }

    // Generate the shareable deep link
    const inviteLink = `macp://join/${conversationId}`;

    // Log for debugging
    console.log(`[Invite] Generated invite link for conversation ${conversationId}: ${inviteLink}`);

    return {
      success: true,
      inviteLink,
      conversationId,
      topic: conversation.topic,
    };
  });

  // -------------------------------------------------------------------------
  // Solo Mode Routes - Human ↔ Agent Conversation with Memory
  // -------------------------------------------------------------------------

  // Create a solo conversation (user talking to their own agent)
  app.post('/conversations/solo', async (req, reply) => {
    const userId = req.user?.userId || 'demo-user';

    const body = z.object({
      agentId: z.string(),
      apiKey: z.string().min(1),
      agentConfig: z.object({
        displayName: z.string(),
        provider: z.enum(['anthropic', 'openai', 'gemini', 'groq']),
        modelId: z.string(),
        systemPrompt: z.string().optional(),
        personality: z.string().optional(),
      }),
      topic: z.string().optional(),
      memoryCategories: z.array(z.string()).optional(),
      extractFacts: z.boolean().default(true),
    }).parse(req.body);

    const now = new Date().toISOString();
    const conversationId = ulid();

    // Load memory context if categories specified
    let memoryContext = '';
    if (body.memoryCategories && body.memoryCategories.length > 0) {
      memoryContext = await loadMemoryContext(userId, body.memoryCategories, body.apiKey);
    }

    const participant = {
      id: ulid(),
      userId,
      agentId: body.agentId,
      apiKey: body.apiKey,
      agentConfig: body.agentConfig,
    };

    const conversation: StoredConversation = {
      id: conversationId,
      topic: body.topic || 'Personal conversation',
      mode: 'solo',
      maxTurns: 100, // Solo mode allows longer conversations
      status: 'active',
      currentTurn: 0,
      initiatorId: userId,
      memoryCategories: body.memoryCategories,
      extractFacts: body.extractFacts,
      memoryContext,
      participants: [participant],
      messages: [],
      createdAt: now,
    };

    await conversationStore.set(conversation);
    await conversationStore.addUserToConversation(userId, conversationId);

    // Subscribe user to WebSocket updates
    connectionManager.subscribeToConversation(userId, conversationId);

    reply.code(201);
    return {
      id: conversation.id,
      topic: conversation.topic,
      mode: 'solo',
      status: 'active',
      agentName: body.agentConfig.displayName,
      memoryLoaded: !!memoryContext,
      createdAt: now,
    };
  });

  // Send a human message in solo mode and get agent response
  app.post('/conversations/:conversationId/message', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };
    const userId = req.user?.userId || 'demo-user';

    const body = z.object({
      content: z.string().min(1).max(10000),
    }).parse(req.body);

    const conversation = await conversationStore.get(conversationId);
    if (!conversation) {
      reply.code(404);
      return { error: 'Conversation not found' };
    }

    if (conversation.mode !== 'solo') {
      reply.code(400);
      return { error: 'This endpoint is only for solo conversations' };
    }

    if (conversation.status !== 'active') {
      reply.code(400);
      return { error: 'Conversation is not active' };
    }

    const participant = conversation.participants[0];
    if (!participant) {
      reply.code(400);
      return { error: 'No agent configured for this conversation' };
    }

    // Add human message
    const humanMessageId = ulid();
    const humanMessage = {
      id: humanMessageId,
      turnNumber: conversation.currentTurn + 1,
      agentId: 'human',
      agentName: 'You',
      content: body.content,
      isHuman: true,
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(humanMessage);
    conversation.currentTurn++;

    // Broadcast human message
    broadcastToConversation(conversationId, {
      type: 'message',
      messageId: humanMessageId,
      turnNumber: conversation.currentTurn,
      agentName: 'You',
      isHuman: true,
      content: body.content,
    });

    // Generate agent response
    try {
      const adapter = createAgentAdapter(participant);
      const systemPrompt = buildSoloSystemPromptWithMemory(
        participant.agentConfig,
        conversation.memoryContext
      );

      // Build conversation history for context
      const recentMessages = conversation.messages.slice(-20); // Last 20 messages
      const historyText = recentMessages
        .map(m => `${m.isHuman ? 'User' : participant.agentConfig.displayName}: ${m.content}`)
        .join('\n\n');

      const response = await adapter.generate({
        messages: [{ role: 'user', content: historyText }],
        systemPrompt,
        maxTokens: 1000, // Longer responses for solo mode
        temperature: 0.7,
      });

      // Add agent response
      const agentMessageId = ulid();
      const agentMessage = {
        id: agentMessageId,
        turnNumber: conversation.currentTurn + 1,
        agentId: participant.agentId,
        agentName: participant.agentConfig.displayName,
        content: response.content,
        isHuman: false,
        createdAt: new Date().toISOString(),
      };
      conversation.messages.push(agentMessage);
      conversation.currentTurn++;

      await conversationStore.set(conversation);

      // Broadcast agent response
      broadcastToConversation(conversationId, {
        type: 'message',
        messageId: agentMessageId,
        turnNumber: conversation.currentTurn,
        agentName: participant.agentConfig.displayName,
        isHuman: false,
        content: response.content,
        tokens: response.tokensUsed,
      });

      return {
        humanMessage: {
          id: humanMessageId,
          content: body.content,
        },
        agentMessage: {
          id: agentMessageId,
          content: response.content,
          agentName: participant.agentConfig.displayName,
          tokens: response.tokensUsed,
        },
      };
    } catch (error) {
      console.error(`[Solo] Error generating response:`, error);
      reply.code(500);
      return { error: 'Failed to generate agent response' };
    }
  });

  // End a solo conversation and extract facts
  app.post('/conversations/:conversationId/end', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };
    const userId = req.user?.userId || 'demo-user';

    const conversation = await conversationStore.get(conversationId);
    if (!conversation) {
      reply.code(404);
      return { error: 'Conversation not found' };
    }

    if (conversation.status !== 'active') {
      reply.code(400);
      return { error: 'Conversation is not active' };
    }

    conversation.status = 'completed';
    await conversationStore.set(conversation);

    // Broadcast completion
    broadcastToConversation(conversationId, {
      type: 'conversation_end',
      totalTurns: conversation.currentTurn,
      status: 'completed',
    });

    // Extract facts if enabled
    let extractedFacts = null;
    if (conversation.extractFacts && conversation.messages.length > 0) {
      const participant = conversation.participants[0];
      const apiKey = participant?.apiKey;

      // Format messages for extraction
      const messagesForExtraction = conversation.messages.map(m => ({
        role: (m.isHuman ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      }));

      try {
        const extractionResult = await extractFactsFromConversation(
          conversationId,
          messagesForExtraction,
          apiKey
        );

        if (Object.keys(extractionResult.factsByCategory).length > 0) {
          // Store facts via memory service
          extractedFacts = await storeExtractedFacts(
            userId,
            conversationId,
            extractionResult,
            apiKey
          );
        }
      } catch (error) {
        console.error('[Solo] Fact extraction failed:', error);
      }
    }

    return {
      conversationId,
      status: 'completed',
      totalTurns: conversation.currentTurn,
      totalMessages: conversation.messages.length,
      factsExtracted: extractedFacts,
    };
  });
}

// -----------------------------------------------------------------------------
// Conversation Runner
// -----------------------------------------------------------------------------

async function runConversation(
  conversation: StoredConversation,
  store: typeof conversationStore
): Promise<void> {
  const { id: conversationId, topic, goal, maxTurns, participants, mode } = conversation;

  // Create adapters for each participant using their client-provided API keys
  const adapters = participants.map(p => {
    const config = p.agentConfig;
    let adapter: AgentAdapter;

    switch (config.provider) {
      case 'openai':
        adapter = createOpenAIAdapter(p.apiKey, config.modelId);
        break;
      case 'gemini':
        adapter = createGeminiAdapter(p.apiKey, config.modelId);
        break;
      case 'groq':
        adapter = createGroqAdapter(p.apiKey, config.modelId);
        break;
      case 'anthropic':
      default:
        adapter = createClaudeAdapter(p.apiKey, config.modelId);
        break;
    }

    return { participant: p, adapter };
  });

  // Build conversation history for context
  let conversationHistory = '';

  // Notify participants that conversation is starting
  broadcastToConversation(conversationId, {
    type: 'conversation_start',
    topic,
    goal,
    participants: participants.map(p => ({
      agentName: p.agentConfig.displayName,
      provider: p.agentConfig.provider,
    })),
  });

  const isSoloMode = adapters.length === 1;

  // Run conversation turns
  for (let turn = 0; turn < maxTurns; turn++) {
    // Check if conversation was stopped
    const freshConversation = await store.get(conversationId);
    if (freshConversation?.status === 'paused' || freshConversation?.status === 'cancelled') {
      console.log(`[Conversation] ${conversationId} was stopped externally`);
      return;
    }

    const current = adapters[turn % adapters.length];
    const other = adapters.length > 1 ? adapters[(turn + 1) % adapters.length] : null;

    conversation.currentTurn = turn + 1;

    // Notify turn start
    broadcastToConversation(conversationId, {
      type: 'turn_start',
      turnNumber: turn + 1,
      agentName: current.participant.agentConfig.displayName,
    });

    // Build prompt based on solo vs multi-agent mode
    let systemPrompt: string;
    let userPrompt: string;

    if (isSoloMode) {
      systemPrompt = buildSoloSystemPrompt(current.participant.agentConfig);
      if (turn === 0) {
        userPrompt = `Explore and provide insights on: "${topic}"${goal ? `\n\nGoal: ${goal}` : ''}\n\nShare your initial thoughts and analysis.`;
      } else {
        userPrompt = `Your exploration so far:\n${conversationHistory}\n\nContinue exploring this topic. Go deeper, consider different angles, or develop your previous points further.`;
      }
    } else {
      systemPrompt = buildSystemPrompt(current.participant.agentConfig, other!.participant.agentConfig);
      userPrompt = turn === 0
        ? `Start a conversation about: "${topic}"${goal ? `\n\nGoal: ${goal}` : ''}\n\nIntroduce your perspective.`
        : `Conversation so far:\n${conversationHistory}\n\n${other!.participant.agentConfig.displayName} just spoke. Respond thoughtfully.`;
    }

    try {
      const response = await current.adapter.generate({
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt,
        maxTokens: 100, // ~50 words
        temperature: 0.8,
      });

      const messageId = ulid();
      const message = {
        id: messageId,
        turnNumber: turn + 1,
        agentId: current.participant.agentId,
        agentName: current.participant.agentConfig.displayName,
        content: response.content,
        createdAt: new Date().toISOString(),
      };

      conversation.messages.push(message);
      conversationHistory += `${current.participant.agentConfig.displayName}: ${response.content}\n\n`;

      // Persist to Redis after each message
      await store.set(conversation);

      // Broadcast message to all participants
      broadcastToConversation(conversationId, {
        type: 'message',
        messageId,
        turnNumber: turn + 1,
        agentName: current.participant.agentConfig.displayName,
        provider: current.participant.agentConfig.provider,
        content: response.content,
        tokens: response.tokensUsed,
      });

      // Deliver to participants (WebSocket + Push)
      await deliveryCoordinator.deliverToParticipants(
        conversationId,
        participants.map(p => ({ userId: p.userId, apnsToken: null })), // TODO: Get tokens from DB
        {
          type: 'message',
          content: response.content,
          agentName: current.participant.agentConfig.displayName,
          turnNumber: turn + 1,
          messageId,
        }
      );

      // Delay between turns for "campfire" mode
      if (mode === 'campfire') {
        await sleep(2000); // 2 second delay between turns
      }

      // Check for natural ending
      const lower = response.content.toLowerCase();
      if (
        lower.includes('great conversation') ||
        lower.includes('enjoyed this discussion') ||
        lower.includes('nice chatting') ||
        lower.includes('to conclude')
      ) {
        break;
      }
    } catch (error) {
      console.error(`Error on turn ${turn + 1}:`, error);
      broadcastToConversation(conversationId, {
        type: 'error',
        turnNumber: turn + 1,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      break;
    }
  }

  // Mark conversation as completed
  conversation.status = 'completed';
  await store.set(conversation);

  broadcastToConversation(conversationId, {
    type: 'conversation_end',
    totalTurns: conversation.currentTurn,
    status: 'completed',
  });
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getProviderDisplayName(provider: string): string {
  switch (provider) {
    case 'anthropic': return 'Anthropic';
    case 'openai': return 'OpenAI';
    case 'gemini': return 'Google';
    case 'groq': return 'Groq';
    default: return provider;
  }
}

function buildSoloSystemPrompt(
  agent: { displayName: string; provider: string; personality?: string; systemPrompt?: string }
): string {
  if (agent.systemPrompt) {
    return agent.systemPrompt;
  }

  const providerName = getProviderDisplayName(agent.provider);

  return `You are ${agent.displayName}, an AI assistant made by ${providerName}. You are exploring a topic to provide insights and analysis.

${agent.personality ? `Your personality: ${agent.personality}` : ''}

Guidelines:
- Keep responses under 50 words
- Be concise and insightful
- Build on previous points each turn
- Be honest about uncertainties`;
}

function buildSystemPrompt(
  agent: { displayName: string; provider: string; personality?: string; systemPrompt?: string },
  otherAgent: { displayName: string; provider: string }
): string {
  if (agent.systemPrompt) {
    return agent.systemPrompt;
  }

  const providerName = getProviderDisplayName(agent.provider);
  const otherProviderName = getProviderDisplayName(otherAgent.provider);

  return `You are ${agent.displayName}, an AI assistant made by ${providerName}. You are having a conversation with ${otherAgent.displayName}, an AI made by ${otherProviderName}.

${agent.personality ? `Your personality: ${agent.personality}` : ''}

Guidelines:
- Keep responses under 50 words
- Engage genuinely with what the other AI says
- Feel free to respectfully disagree`;
}

function broadcastToConversation(conversationId: string, payload: unknown): void {
  connectionManager.broadcastToConversation(conversationId, {
    type: 'conversation_update',
    conversationId,
    payload,
    timestamp: new Date(),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// -----------------------------------------------------------------------------
// Solo Mode Helpers
// -----------------------------------------------------------------------------

function createAgentAdapter(participant: {
  apiKey: string;
  agentConfig: {
    provider: 'anthropic' | 'openai' | 'gemini' | 'groq';
    modelId: string;
  };
}): AgentAdapter {
  const { apiKey, agentConfig } = participant;

  switch (agentConfig.provider) {
    case 'openai':
      return createOpenAIAdapter(apiKey, agentConfig.modelId);
    case 'gemini':
      return createGeminiAdapter(apiKey, agentConfig.modelId);
    case 'groq':
      return createGroqAdapter(apiKey, agentConfig.modelId);
    case 'anthropic':
    default:
      return createClaudeAdapter(apiKey, agentConfig.modelId);
  }
}

function buildSoloSystemPromptWithMemory(
  agent: { displayName: string; provider: string; personality?: string; systemPrompt?: string },
  memoryContext?: string
): string {
  const providerName = getProviderDisplayName(agent.provider);

  let basePrompt: string;
  if (agent.systemPrompt) {
    basePrompt = agent.systemPrompt;
  } else {
    basePrompt = `You are ${agent.displayName}, a personal AI assistant powered by ${providerName}. You are having a conversation with your user.

${agent.personality ? `Your personality: ${agent.personality}` : ''}

Guidelines:
- Be helpful, accurate, and personable
- Remember what the user tells you during this conversation
- If you're unsure about something, ask for clarification
- Keep responses focused and relevant`;
  }

  // Inject memory context if available
  if (memoryContext) {
    return `${basePrompt}

## What You Know About Your User

The following information has been learned from previous conversations. Use this context to personalize your responses, but don't explicitly reference that you "remember" things unless relevant.

${memoryContext}

---

Continue the conversation naturally, using this context when helpful.`;
  }

  return basePrompt;
}

/**
 * Loads memory context from specified categories
 */
async function loadMemoryContext(
  userId: string,
  categories: string[],
  apiKey?: string
): Promise<string> {
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');

  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
  });
  const bucket = process.env.MEMORY_BUCKET || 'macp-dev-memories';

  const summaries: string[] = [];

  for (const category of categories) {
    try {
      const key = `memories/${userId}/${category}.json`;
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }));

      const body = await response.Body?.transformToString();
      if (body) {
        const memoryCategory = JSON.parse(body);
        if (memoryCategory.summary) {
          summaries.push(`### ${memoryCategory.displayName}\n${memoryCategory.summary}`);
        }
      }
    } catch (error: any) {
      // Category doesn't exist, skip
      if (error.name !== 'NoSuchKey' && error.$metadata?.httpStatusCode !== 404) {
        console.error(`[Memory] Failed to load category ${category}:`, error);
      }
    }
  }

  return summaries.join('\n\n');
}

/**
 * Stores extracted facts to the memory system
 */
async function storeExtractedFacts(
  userId: string,
  conversationId: string,
  extractionResult: { factsByCategory: Record<string, Array<{ category: string; categoryDisplayName: string; key: string; value: unknown; confidence: 'high' | 'medium' | 'low' }>> },
  apiKey?: string
): Promise<{ categoriesUpdated: string[]; totalFacts: number }> {
  const { S3Client, GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { ulid: generateId } = await import('ulid');

  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
  });
  const bucket = process.env.MEMORY_BUCKET || 'macp-dev-memories';
  const now = new Date().toISOString();

  const categoriesUpdated: string[] = [];
  let totalFacts = 0;

  for (const [categoryName, facts] of Object.entries(extractionResult.factsByCategory)) {
    if (facts.length === 0) continue;

    const key = `memories/${userId}/${categoryName}.json`;

    // Try to load existing category
    let memoryCategory: any;
    try {
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }));
      const body = await response.Body?.transformToString();
      if (body) {
        memoryCategory = JSON.parse(body);
      }
    } catch (error: any) {
      // Create new category
      memoryCategory = null;
    }

    if (!memoryCategory) {
      const displayName = facts[0]?.categoryDisplayName || formatCategoryName(categoryName);
      memoryCategory = {
        category: categoryName,
        displayName,
        userId,
        lastUpdated: now,
        summary: '',
        facts: [],
      };
    }

    // Convert extracted facts to memory facts with proper typing
    const memoryFacts = facts.map(fact => ({
      id: generateId(),
      key: fact.key,
      value: fact.value as string | number | string[] | Record<string, unknown>,
      confidence: fact.confidence,
      learnedFrom: conversationId,
      learnedAt: now,
      supersedes: undefined as string | undefined,
    }));

    // Merge facts (update existing by key, add new)
    for (const newFact of memoryFacts) {
      const existingIndex = memoryCategory.facts.findIndex((f: any) => f.key === newFact.key);
      if (existingIndex !== -1) {
        // Update existing - new fact supersedes old
        newFact.supersedes = memoryCategory.facts[existingIndex].id;
        memoryCategory.facts[existingIndex] = newFact;
      } else {
        memoryCategory.facts.push(newFact);
      }
    }

    memoryCategory.lastUpdated = now;

    // Generate new summary
    if (apiKey) {
      try {
        const summary = await generateLLMSummary(
          categoryName,
          memoryCategory.displayName,
          memoryCategory.facts.map((f: any) => ({ key: f.key, value: f.value })),
          apiKey
        );
        memoryCategory.summary = summary;
      } catch {
        // Fall back to simple summary
        memoryCategory.summary = memoryCategory.facts
          .map((f: any) => `${f.key}: ${JSON.stringify(f.value)}`)
          .join('. ');
      }
    }

    // Save category
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(memoryCategory, null, 2),
      ContentType: 'application/json',
      ServerSideEncryption: 'AES256',
    }));

    categoriesUpdated.push(categoryName);
    totalFacts += memoryFacts.length;
  }

  // Update index
  await updateMemoryIndex(userId, categoriesUpdated, s3Client, bucket);

  console.log(`[Memory] Stored ${totalFacts} facts in ${categoriesUpdated.length} categories for user ${userId}`);

  return { categoriesUpdated, totalFacts };
}

async function updateMemoryIndex(
  userId: string,
  updatedCategories: string[],
  s3Client: any,
  bucket: string
): Promise<void> {
  const { GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const indexKey = `memories/${userId}/_index.json`;
  const now = new Date().toISOString();

  let index: any;
  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: indexKey,
    }));
    const body = await response.Body?.transformToString();
    if (body) {
      index = JSON.parse(body);
    }
  } catch {
    index = null;
  }

  if (!index) {
    index = {
      userId,
      categories: [],
      totalFacts: 0,
      lastUpdated: now,
    };
  }

  // Update categories in index
  for (const categoryName of updatedCategories) {
    const catKey = `memories/${userId}/${categoryName}.json`;
    try {
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: catKey,
      }));
      const body = await response.Body?.transformToString();
      if (body) {
        const category = JSON.parse(body);
        const catIndex = index.categories.findIndex((c: any) => c.name === categoryName);
        const catMeta = {
          name: categoryName,
          displayName: category.displayName,
          factCount: category.facts.length,
          lastUpdated: now,
        };

        if (catIndex !== -1) {
          index.categories[catIndex] = catMeta;
        } else {
          index.categories.push(catMeta);
        }
      }
    } catch {
      // Skip
    }
  }

  index.totalFacts = index.categories.reduce((sum: number, c: any) => sum + c.factCount, 0);
  index.lastUpdated = now;

  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: indexKey,
    Body: JSON.stringify(index, null, 2),
    ContentType: 'application/json',
    ServerSideEncryption: 'AES256',
  }));
}

function formatCategoryName(category: string): string {
  return category
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
