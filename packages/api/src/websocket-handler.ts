/**
 * WebSocket handler for real-time autonomous agent conversations
 *
 * Handles: $connect, $disconnect, and message routing
 * Uses Redis for connection and conversation state management
 */

import {
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import Redis from 'ioredis';
import { createDatabase } from '@macp/core';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import {
  getPublishedAgent,
  createAgentAdapter,
  getModelIdForProvider,
  buildAutonomousHostPrompt,
  buildAutonomousVisitorPrompt,
} from './services/public-agent-service.js';
import { getFormFieldsForAgent, submitForm, getFormAgent, type FormField } from './services/form-service.js';

// Secrets Manager client for database URL
const secretsClient = new SecretsManagerClient({});

// Initialize database connection
let dbInitialized = false;
let dbInitializing = false;

async function ensureDatabase(): Promise<void> {
  if (dbInitialized) return;
  if (dbInitializing) {
    // Wait for initialization to complete
    while (dbInitializing) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return;
  }

  dbInitializing = true;

  try {
    let databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      // Load from Secrets Manager
      const prefix = process.env.PREFIX || 'macp-dev';
      console.log(`[WebSocket] Fetching database secret: ${prefix}/database`);

      const response = await secretsClient.send(new GetSecretValueCommand({
        SecretId: `${prefix}/database`,
      }));

      if (response.SecretString) {
        const secret = JSON.parse(response.SecretString);
        if (secret.host && secret.username && secret.password) {
          databaseUrl = `postgresql://${secret.username}:${encodeURIComponent(secret.password)}@${secret.host}:${secret.port || 5432}/${secret.dbname || 'macp'}`;
          console.log(`[WebSocket] Database URL loaded from secrets: ${secret.username}@${secret.host}`);
        }
      }
    }

    if (databaseUrl) {
      createDatabase({ connectionString: databaseUrl });
      dbInitialized = true;
      console.log('[WebSocket] Database initialized successfully');
    } else {
      console.error('[WebSocket] No database URL found!');
    }
  } catch (error) {
    console.error('[WebSocket] Failed to initialize database:', error);
  } finally {
    dbInitializing = false;
  }
}
import {
  collectBids,
  evaluateBids,
  generateAgentResponse,
  quickKeywordBid,
  type AgentForBidding,
  type ConversationContext,
} from './services/bidding-engine.js';
import {
  getVisitorMemory,
  updateVisitorMemoryFromSession,
  formatVisitorMemoryAsContext,
  distributeMemoriesToAgents,
} from './services/visitor-memory-service.js';
import {
  saveFactsToUserMemory,
} from './services/user-memory-service.js';
import {
  completeTask as completeTaskInDb,
} from './services/task-service.js';
import {
  findContactByAgentId,
  appendToContactNotes,
  updateContactFromTaskCompletion,
} from './services/contacts-service.js';
import {
  startConversationAudit,
  logUserMessage,
  logBiddingResults,
  logAgentResponse,
  logHostResponse,
  logOrchestrationDecision,
  logTaskMatch,
  logMemorySaved,
  endConversationAudit,
  flushAuditBuffer,
  type BiddingResultAudit,
} from './services/audit-service.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface WebSocketMessage {
  action: 'startAutonomous' | 'startOrchestrated' | 'sendMessage' | 'interject' | 'stop';
  payload?: StartAutonomousPayload | StartOrchestratedPayload | SendMessagePayload | InterjectPayload;
}

interface StartAutonomousPayload {
  hostAgentId: string;
  visitorAgentId: string;
  visitorAgentName: string;
  visitorAgentEmoji: string;
  visitorAgentPersonality: string;
  visitorAgentQuestions: string[];
  visitorApiKey: string;
  visitorProvider: 'anthropic' | 'openai' | 'gemini' | 'groq';
  visitorContext?: string;
  maxTurns?: number;
}

interface InterjectPayload {
  message: string;
}

interface AgentTaskPayload {
  id: string;
  description: string;
  keywords: string[];
  category: string;  // 'restaurant' | 'health' | 'real_estate' | etc.
}

interface StartOrchestratedPayload {
  hostAgentId: string;
  visitorId?: string;  // For visitor memory tracking (device ID for anonymous)
  visitorUserId?: string;  // For user memory storage (authenticated user ID)
  userAgents: Array<{
    id: string;
    name: string;
    emoji: string;
    personality: string;
    description?: string;
    intents: string[];
    memories?: string[]; // Recent relevant memories about the user
    tasks?: AgentTaskPayload[];  // Pending tasks looking for opportunities
  }>;
  apiKey: string;
  provider: 'anthropic' | 'openai' | 'gemini' | 'groq';
}

interface SendMessagePayload {
  message: string;
}

interface ConversationState {
  connectionId: string;
  hostAgentId: string;
  status: 'active' | 'stopped' | 'completed';
  interjectMessage?: string;
  currentTurn: number;
  maxTurns: number;
}

interface OrchestratedConversationState {
  connectionId: string;
  hostAgentId: string;
  visitorId?: string;  // For visitor memory tracking (device ID)
  visitorUserId?: string;  // For user memory tracking (authenticated user ID)
  status: 'active' | 'stopped' | 'completed';
  currentTurn: number;
  maxTurns: number;
  userAgents: AgentForBidding[];
  participationHistory: Record<string, number>; // agentId -> turns since last spoke
  activeAgents: string[]; // Agent IDs currently participating
  messages: Array<{
    role: 'host' | 'user' | 'agent';
    agentId?: string;
    agentName?: string;
    agentEmoji?: string;
    content: string;
    timestamp: string;
  }>;
  extractedFacts: string[];  // Facts learned about the user during conversation
  apiKey: string;
  provider: 'anthropic' | 'openai' | 'gemini' | 'groq';
  // Form agent support
  formFields?: Array<{ label: string; required: boolean }>;  // Lightweight field info
}

interface AutonomousTurn {
  turnNumber: number;
  role: 'host' | 'visitor' | 'user';
  agentName: string;
  emoji: string;
  content: string;
  timestamp: string;
}

// -----------------------------------------------------------------------------
// Redis Client
// -----------------------------------------------------------------------------

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);

    redisClient = new Redis({
      host,
      port,
      maxRetriesPerRequest: 3,
    });

    redisClient.on('error', (err) => console.error('[WebSocket] Redis error:', err));
    redisClient.on('connect', () => console.log('[WebSocket] Redis connected'));
  }
  return redisClient;
}

// -----------------------------------------------------------------------------
// API Gateway Management Client
// -----------------------------------------------------------------------------

function getApiGatewayClient(event: APIGatewayProxyWebsocketEventV2): ApiGatewayManagementApiClient {
  const domain = event.requestContext.domainName;
  const stage = event.requestContext.stage;

  return new ApiGatewayManagementApiClient({
    endpoint: `https://${domain}/${stage}`,
  });
}

async function sendToConnection(
  client: ApiGatewayManagementApiClient,
  connectionId: string,
  data: unknown
): Promise<boolean> {
  try {
    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(data)),
    }));
    return true;
  } catch (error: any) {
    if (error.statusCode === 410) {
      console.log(`[WebSocket] Connection ${connectionId} is gone`);
      return false;
    }
    console.error(`[WebSocket] Error sending to ${connectionId}:`, error);
    return false;
  }
}

// -----------------------------------------------------------------------------
// Connection Management
// -----------------------------------------------------------------------------

async function handleConnect(connectionId: string): Promise<void> {
  const redis = getRedis();
  await redis.set(`ws:conn:${connectionId}`, JSON.stringify({
    connectedAt: new Date().toISOString(),
  }), 'EX', 3600); // 1 hour TTL
  console.log(`[WebSocket] Connected: ${connectionId}`);
}

async function handleDisconnect(connectionId: string): Promise<void> {
  const redis = getRedis();

  // Check if there's an active autonomous conversation
  const convKey = await redis.get(`ws:conn:${connectionId}:conv`);
  if (convKey) {
    const convState = await redis.get(convKey);
    if (convState) {
      const state = JSON.parse(convState) as ConversationState;
      state.status = 'stopped';
      await redis.set(convKey, JSON.stringify(state), 'EX', 300);
    }
  }

  // Check for orchestrated conversation and save memories
  const orchKey = await redis.get(`ws:conn:${connectionId}:orch`);
  if (orchKey) {
    const stateJson = await redis.get(orchKey);
    if (stateJson) {
      const state = JSON.parse(stateJson) as OrchestratedConversationState;
      if (state.status === 'active') {
        state.status = 'stopped';
        await redis.set(orchKey, JSON.stringify(state), 'EX', 300);

        // Save visitor memories on disconnect
        console.log(`[WebSocket] Saving memories on disconnect for conversation`);
        await saveOrchestratedConversationMemories(state);

        // Audit: End conversation audit and persist to S3
        const conversationId = orchKey.replace('ws:orch:', '');
        await endConversationAudit(conversationId);
      }
    }
  }

  await redis.del(`ws:conn:${connectionId}`);
  await redis.del(`ws:conn:${connectionId}:conv`);
  await redis.del(`ws:conn:${connectionId}:orch`);
  console.log(`[WebSocket] Disconnected: ${connectionId}`);
}

// -----------------------------------------------------------------------------
// Autonomous Conversation
// -----------------------------------------------------------------------------

async function handleStartAutonomous(
  event: APIGatewayProxyWebsocketEventV2,
  payload: StartAutonomousPayload
): Promise<void> {
  const connectionId = event.requestContext.connectionId;
  const apiClient = getApiGatewayClient(event);
  const redis = getRedis();

  // Validate host agent
  const hostAgent = await getPublishedAgent(payload.hostAgentId);
  if (!hostAgent) {
    await sendToConnection(apiClient, connectionId, {
      type: 'error',
      message: 'Host agent not found',
    });
    return;
  }

  if (!hostAgent.isActive || !hostAgent.allowAgentToAgent) {
    await sendToConnection(apiClient, connectionId, {
      type: 'error',
      message: 'Agent-to-agent mode is not available for this agent',
    });
    return;
  }

  // Initialize conversation state
  const conversationId = `conv:${connectionId}:${Date.now()}`;
  const convState: ConversationState = {
    connectionId,
    hostAgentId: payload.hostAgentId,
    status: 'active',
    currentTurn: 0,
    maxTurns: payload.maxTurns || 10,
  };

  await redis.set(`ws:conv:${conversationId}`, JSON.stringify(convState), 'EX', 600);
  await redis.set(`ws:conn:${connectionId}:conv`, `ws:conv:${conversationId}`, 'EX', 600);

  // Send started event
  await sendToConnection(apiClient, connectionId, {
    type: 'started',
    conversationId,
    hostAgent: {
      name: hostAgent.name,
      emoji: hostAgent.emoji,
    },
    visitorAgent: {
      name: payload.visitorAgentName,
      emoji: payload.visitorAgentEmoji,
    },
    maxTurns: convState.maxTurns,
  });

  // Create adapters
  console.log(`[WebSocket] Creating adapters - provider: ${payload.visitorProvider}, apiKeyPrefix: ${payload.visitorApiKey?.substring(0, 12)}...`);
  const modelId = getModelIdForProvider(payload.visitorProvider);
  console.log(`[WebSocket] Model ID resolved: ${modelId}`);
  const hostAdapter = createAgentAdapter(payload.visitorApiKey, payload.visitorProvider, modelId);
  const visitorAdapter = createAgentAdapter(payload.visitorApiKey, payload.visitorProvider, modelId);

  // Build prompts
  const hostPrompt = buildAutonomousHostPrompt(hostAgent, payload.visitorAgentName, payload.visitorContext);
  const visitorPrompt = buildAutonomousVisitorPrompt(
    payload.visitorAgentName,
    payload.visitorAgentPersonality,
    payload.visitorAgentQuestions,
    hostAgent.name,
    payload.visitorContext
  );

  // Conversation state
  const turns: AutonomousTurn[] = [];
  let conversationHistory = '';
  let turnNumber = 0;

  try {
    // Host greeting
    await sendToConnection(apiClient, connectionId, { type: 'thinking', agent: 'host' });

    const hostGreeting = await hostAdapter.generate({
      messages: [{
        role: 'user',
        content: `Start the conversation. A visitor's agent named ${payload.visitorAgentName} (${payload.visitorAgentEmoji}) has arrived. Introduce yourself warmly.`,
      }],
      systemPrompt: hostPrompt,
      maxTokens: 300,
      temperature: 0.7,
    });

    turnNumber++;
    const hostTurn: AutonomousTurn = {
      turnNumber,
      role: 'host',
      agentName: hostAgent.name,
      emoji: hostAgent.emoji,
      content: hostGreeting.content,
      timestamp: new Date().toISOString(),
    };
    turns.push(hostTurn);
    conversationHistory += `${hostAgent.name}: ${hostGreeting.content}\n\n`;

    await sendToConnection(apiClient, connectionId, { type: 'turn', turn: hostTurn });

    // Conversation loop
    while (turnNumber < convState.maxTurns) {
      // Check for stop/interject
      const stateJson = await redis.get(`ws:conv:${conversationId}`);
      if (!stateJson) break;

      const state = JSON.parse(stateJson) as ConversationState;
      if (state.status === 'stopped') {
        await sendToConnection(apiClient, connectionId, { type: 'stopped', reason: 'User stopped' });
        return;
      }

      // Handle interjection
      if (state.interjectMessage) {
        turnNumber++;
        const userTurn: AutonomousTurn = {
          turnNumber,
          role: 'user',
          agentName: 'You',
          emoji: '👤',
          content: state.interjectMessage,
          timestamp: new Date().toISOString(),
        };
        turns.push(userTurn);
        conversationHistory += `User interjection: ${state.interjectMessage}\n\n`;

        await sendToConnection(apiClient, connectionId, { type: 'turn', turn: userTurn });

        // Clear the interjection
        state.interjectMessage = undefined;
        state.currentTurn = turnNumber;
        await redis.set(`ws:conv:${conversationId}`, JSON.stringify(state), 'EX', 600);
      }

      // Visitor turn
      await sendToConnection(apiClient, connectionId, { type: 'thinking', agent: 'visitor' });

      const visitorResponse = await visitorAdapter.generate({
        messages: [{
          role: 'user',
          content: `Conversation so far:\n${conversationHistory}\n\nRespond naturally. Keep it concise (2-3 sentences).`,
        }],
        systemPrompt: visitorPrompt,
        maxTokens: 300,
        temperature: 0.7,
      });

      turnNumber++;
      const visitorTurn: AutonomousTurn = {
        turnNumber,
        role: 'visitor',
        agentName: payload.visitorAgentName,
        emoji: payload.visitorAgentEmoji,
        content: visitorResponse.content,
        timestamp: new Date().toISOString(),
      };
      turns.push(visitorTurn);
      conversationHistory += `${payload.visitorAgentName}: ${visitorResponse.content}\n\n`;

      await sendToConnection(apiClient, connectionId, { type: 'turn', turn: visitorTurn });

      // Check for natural ending
      const visitorLower = visitorResponse.content.toLowerCase();
      if (visitorLower.includes('goodbye') || visitorLower.includes('thank you for your time')) {
        break;
      }

      // Check stop again before host turn
      const stateJson2 = await redis.get(`ws:conv:${conversationId}`);
      if (!stateJson2) break;
      const state2 = JSON.parse(stateJson2) as ConversationState;
      if (state2.status === 'stopped') {
        await sendToConnection(apiClient, connectionId, { type: 'stopped', reason: 'User stopped' });
        return;
      }

      if (turnNumber >= convState.maxTurns) break;

      // Host turn
      await sendToConnection(apiClient, connectionId, { type: 'thinking', agent: 'host' });

      const hostResponse = await hostAdapter.generate({
        messages: [{
          role: 'user',
          content: `Conversation so far:\n${conversationHistory}\n\nRespond naturally. Keep it concise (2-3 sentences).`,
        }],
        systemPrompt: hostPrompt,
        maxTokens: 300,
        temperature: 0.7,
      });

      turnNumber++;
      const nextHostTurn: AutonomousTurn = {
        turnNumber,
        role: 'host',
        agentName: hostAgent.name,
        emoji: hostAgent.emoji,
        content: hostResponse.content,
        timestamp: new Date().toISOString(),
      };
      turns.push(nextHostTurn);
      conversationHistory += `${hostAgent.name}: ${hostResponse.content}\n\n`;

      await sendToConnection(apiClient, connectionId, { type: 'turn', turn: nextHostTurn });

      // Check for host ending
      const hostLower = hostResponse.content.toLowerCase();
      if (hostLower.includes('goodbye') || hostLower.includes('take care')) {
        break;
      }
    }

    // Generate summary
    await sendToConnection(apiClient, connectionId, { type: 'summarizing' });

    const summaryResponse = await visitorAdapter.generate({
      messages: [{
        role: 'user',
        content: `Summarize this conversation:\n\n${conversationHistory}\n\nProvide JSON:\n{"summary": "...", "factsLearned": ["..."], "questionsAnswered": ["..."]}`,
      }],
      systemPrompt: 'You summarize conversations. Return only valid JSON.',
      maxTokens: 500,
      temperature: 0.3,
    });

    let completion = {
      summary: 'Conversation completed.',
      factsLearned: [] as string[],
      questionsAnswered: [] as string[],
      totalTurns: turns.length,
    };

    try {
      const jsonMatch = summaryResponse.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        completion = {
          summary: parsed.summary || completion.summary,
          factsLearned: parsed.factsLearned || [],
          questionsAnswered: parsed.questionsAnswered || [],
          totalTurns: turns.length,
        };
      }
    } catch (e) {
      console.warn('[WebSocket] Failed to parse summary JSON');
    }

    await sendToConnection(apiClient, connectionId, { type: 'complete', ...completion });

    // Mark conversation complete
    const finalState = await redis.get(`ws:conv:${conversationId}`);
    if (finalState) {
      const state = JSON.parse(finalState) as ConversationState;
      state.status = 'completed';
      await redis.set(`ws:conv:${conversationId}`, JSON.stringify(state), 'EX', 300);
    }

  } catch (error: any) {
    console.error('[WebSocket] Conversation error:', error);
    await sendToConnection(apiClient, connectionId, {
      type: 'error',
      message: error.message || 'An error occurred during the conversation',
    });
  }
}

async function handleInterject(
  event: APIGatewayProxyWebsocketEventV2,
  payload: InterjectPayload
): Promise<void> {
  const connectionId = event.requestContext.connectionId;
  const redis = getRedis();

  const convKey = await redis.get(`ws:conn:${connectionId}:conv`);
  if (!convKey) {
    console.log('[WebSocket] No active conversation for interject');
    return;
  }

  const stateJson = await redis.get(convKey);
  if (!stateJson) return;

  const state = JSON.parse(stateJson) as ConversationState;
  state.interjectMessage = payload.message;
  await redis.set(convKey, JSON.stringify(state), 'EX', 600);

  console.log(`[WebSocket] Interjection queued: ${payload.message}`);
}

async function handleStop(event: APIGatewayProxyWebsocketEventV2): Promise<void> {
  const connectionId = event.requestContext.connectionId;
  const apiClient = getApiGatewayClient(event);
  const redis = getRedis();

  // Check for autonomous conversation
  const convKey = await redis.get(`ws:conn:${connectionId}:conv`);
  if (convKey) {
    const stateJson = await redis.get(convKey);
    if (stateJson) {
      const state = JSON.parse(stateJson) as ConversationState;
      state.status = 'stopped';
      await redis.set(convKey, JSON.stringify(state), 'EX', 300);
      console.log(`[WebSocket] Autonomous conversation stopped by user`);
    }
    return;
  }

  // Check for orchestrated conversation
  const orchKey = await redis.get(`ws:conn:${connectionId}:orch`);
  if (orchKey) {
    const stateJson = await redis.get(orchKey);
    if (stateJson) {
      const state = JSON.parse(stateJson) as OrchestratedConversationState;
      state.status = 'stopped';
      await redis.set(orchKey, JSON.stringify(state), 'EX', 300);

      // Save visitor memories and distribute to user agents (send to client before disconnect)
      await saveOrchestratedConversationMemories(state, apiClient);

      // Audit: End conversation audit and persist to S3
      const conversationId = orchKey.replace('ws:orch:', '');
      await endConversationAudit(conversationId);

      console.log(`[WebSocket] Orchestrated conversation stopped by user`);
    }
    return;
  }

  console.log('[WebSocket] No active conversation to stop');
}

/**
 * Extracts and saves memories from an orchestrated conversation
 * - Saves visitor memories to the public agent (for VIP experience)
 * - Distributes relevant facts to user's personal agents
 * - Returns the distributions so they can be sent to the client
 */
async function saveOrchestratedConversationMemories(
  state: OrchestratedConversationState,
  apiClient?: ApiGatewayManagementApiClient
): Promise<void> {
  if (state.messages.length < 2) {
    console.log('[WebSocket] Conversation too short for memory extraction');
    return;
  }

  // If this is a form agent conversation, save form responses
  if (state.formFields && state.formFields.length > 0) {
    try {
      await saveFormResponses(state);
    } catch (error) {
      console.error('[WebSocket] Failed to save form responses:', error);
    }
  }

  try {
    // Extract facts from conversation using LLM
    const facts = await extractFactsFromConversation(state);
    console.log(`[WebSocket] Extracted ${facts.length} facts from conversation`);

    if (facts.length === 0) return;

    // Save visitor memories to the public agent (restaurant remembers you)
    let visitorMemoriesSaved = 0;
    if (state.visitorId) {
      const conversationId = `orch_${Date.now()}`;
      const visitorMemory = await updateVisitorMemoryFromSession(
        state.hostAgentId,
        state.visitorId,
        conversationId,
        facts,
        {}, // Could extract preferences too
        undefined
      );
      visitorMemoriesSaved = visitorMemory.memories.length;
      console.log(`[WebSocket] Saved visitor memory with ${visitorMemoriesSaved} total memories`);
    }

    // Save facts to user's global memory (persists across devices)
    let userMemoriesSaved = 0;
    let contactUpdated = false;
    if (state.visitorUserId) {
      const hostAgentName = state.messages.find(m => m.role === 'host')?.agentName || state.hostAgentId;
      userMemoriesSaved = await saveFactsToUserMemory(
        state.visitorUserId,
        facts,
        `conversation with ${hostAgentName}`
      );
      console.log(`[WebSocket] Saved ${userMemoriesSaved} facts to user memory`);

      // Audit: Log memories saved
      const conversationId = `orch_${Date.now()}`;
      for (const fact of facts) {
        logMemorySaved(conversationId, fact, 'user-global');
      }

      // Update contact record if the host agent belongs to a contact
      console.log(`[WebSocket] Looking for contact with host agent: ${state.hostAgentId}`);
      try {
        const contact = await findContactByAgentId(state.visitorUserId, state.hostAgentId);
        console.log(`[WebSocket] Contact lookup result: ${contact ? contact.name : 'NOT FOUND'}`);
        if (contact) {
          // Append learned facts to the contact's notes
          const factsForContact = facts.filter(f =>
            // Only include facts that are about the contact or relevant outcomes
            f.toLowerCase().includes('confirmed') ||
            f.toLowerCase().includes('reservation') ||
            f.toLowerCase().includes('appointment') ||
            f.toLowerCase().includes('scheduled') ||
            f.toLowerCase().includes(contact.name.toLowerCase().split(' ')[0])
          );
          console.log(`[WebSocket] Facts filtered for contact: ${factsForContact.length} of ${facts.length}`);

          if (factsForContact.length > 0) {
            await appendToContactNotes(
              state.visitorUserId,
              contact.id,
              factsForContact.join('; '),
              hostAgentName
            );
            contactUpdated = true;
            console.log(`[WebSocket] Updated contact "${contact.name}" with ${factsForContact.length} facts`);
          } else {
            console.log(`[WebSocket] No relevant facts to add to contact`);
          }
        } else {
          console.log(`[WebSocket] No contact found associated with host agent ${state.hostAgentId}`);
        }
      } catch (contactError) {
        console.error('[WebSocket] Failed to update contact record:', contactError);
      }
    }

    // Distribute facts to user's personal agents (your agents learn about you)
    let agentDistributions: Array<{agentId: string; agentName: string; fact: string; category: string}> = [];
    if (state.userAgents.length > 0) {
      const distributions = await distributeMemoriesToAgents(
        facts,
        state.userAgents.map(a => ({
          id: a.id,
          name: a.name,
          description: a.description,
          intents: a.intents,
          memoryCategories: a.memoryCategories,
        })),
        state.apiKey
      );

      agentDistributions = distributions.map(d => ({
        agentId: d.agentId,
        agentName: d.agentName,
        fact: d.fact,
        category: d.category,
      }));

      console.log(`[WebSocket] Distributed ${distributions.length} facts to ${new Set(distributions.map(d => d.agentId)).size} user agents`);
    }

    // Send memory distributions to the client so it can save them locally
    if (apiClient && (agentDistributions.length > 0 || visitorMemoriesSaved > 0 || contactUpdated)) {
      try {
        await sendToConnection(apiClient, state.connectionId, {
          type: 'memoriesSaved',
          hostAgentMemories: visitorMemoriesSaved,
          agentDistributions: agentDistributions,
          extractedFacts: facts,
          contactUpdated,
        });
        console.log(`[WebSocket] Sent memoriesSaved event to client`);
      } catch (e) {
        // Connection might be closed, that's OK
        console.log(`[WebSocket] Could not send memoriesSaved (connection may be closed)`);
      }
    }
  } catch (error) {
    console.error('[WebSocket] Failed to save memories:', error);
  }
}

/**
 * Saves form responses collected during a conversational form-filling session
 * Extracts answers from the conversation and saves them as a form submission
 */
async function saveFormResponses(state: OrchestratedConversationState): Promise<void> {
  if (!state.formFields || state.formFields.length === 0) {
    return;
  }

  // Get the full form agent with field IDs
  const formAgent = await getFormAgent(state.hostAgentId);
  if (!formAgent || !formAgent.fields || formAgent.fields.length === 0) {
    console.log(`[WebSocket] Form agent ${state.hostAgentId} has no fields`);
    return;
  }

  // Build conversation transcript for extraction
  const transcript = state.messages
    .map(m => {
      const speaker = m.role === 'user' ? 'USER' : (m.role === 'host' ? 'HOST' : `AGENT (${m.agentName})`);
      return `${speaker}: ${m.content}`;
    })
    .join('\n');

  // Build field mapping for LLM
  const fieldsList = formAgent.fields.map(f =>
    `- ID: "${f.id}" | Label: "${f.label}" | Type: ${f.fieldType}${f.required ? ' (required)' : ''}`
  ).join('\n');

  const prompt = `Extract form field values from this conversation.

FORM FIELDS:
${fieldsList}

CONVERSATION:
${transcript}

For each field where the USER provided an answer, extract the value.
Look for USER messages that contain answers to the HOST's questions.

Return JSON array of responses:
[
  {"fieldId": "exact-field-id", "value": "the user's answer"},
  ...
]

Rules:
- Only include fields where USER actually provided an answer
- Use exact fieldId from the list above
- Extract clean values (e.g., "john@example.com" not "my email is john@example.com")
- Return empty array [] if no answers found

JSON only:`;

  try {
    const adapter = createAgentAdapter(state.apiKey, state.provider, getModelIdForProvider(state.provider));

    const response = await adapter.generate({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You extract structured form responses from conversations. Return only valid JSON.',
      maxTokens: 500,
      temperature: 0.1,
    });

    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log('[WebSocket] No JSON array found in form extraction response');
      return;
    }

    const extractedResponses = JSON.parse(jsonMatch[0]) as Array<{ fieldId: string; value: string }>;

    if (extractedResponses.length === 0) {
      console.log('[WebSocket] No form responses extracted from conversation');
      return;
    }

    // Validate field IDs exist in the form
    const validFieldIds = new Set(formAgent.fields.map(f => f.id));
    const validResponses = extractedResponses.filter(r => {
      if (!validFieldIds.has(r.fieldId)) {
        console.warn(`[WebSocket] Unknown field ID: ${r.fieldId}`);
        return false;
      }
      return r.value && r.value.trim().length > 0;
    });

    if (validResponses.length === 0) {
      console.log('[WebSocket] No valid form responses after filtering');
      return;
    }

    // Submit the form
    const submission = await submitForm(
      state.hostAgentId,
      state.visitorUserId || null,
      {
        responses: validResponses.map(r => ({
          fieldId: r.fieldId,
          value: r.value.trim(),
          source: 'agent' as const,  // Collected via agent conversation
        })),
      }
    );

    console.log(`[WebSocket] Saved form submission ${submission.id} with ${validResponses.length} responses`);
  } catch (error) {
    console.error('[WebSocket] Failed to save form responses:', error);
  }
}

/**
 * Extracts facts about the user from an orchestrated conversation
 */
async function extractFactsFromConversation(
  state: OrchestratedConversationState
): Promise<string[]> {
  const adapter = createAgentAdapter(state.apiKey, state.provider, getModelIdForProvider(state.provider));

  // IMPORTANT: Only include USER messages and HOST confirmations
  // Exclude agent messages entirely to prevent hallucinated facts from being recorded
  const userAndHostMessages = state.messages
    .filter(m => m.role === 'user' || m.role === 'host')
    .map(m => {
      const speaker = m.role === 'user' ? 'USER' : `HOST (${m.agentName || 'Host'})`;
      return `${speaker}: ${m.content}`;
    })
    .join('\n\n');

  const prompt = `Extract facts from this conversation.

EXTRACT ONLY:
1. CONFIRMED OUTCOMES from HOST messages (reservations, appointments, bookings):
   - "Reservation confirmed for 4 at 5:30 PM"
   - "Appointment booked with Dr. Smith"

2. FACTS THE USER STATED in USER messages:
   - Personal info the user typed themselves
   - Preferences the user explicitly stated

Return a JSON array of fact strings. If no facts, return [].

Conversation:
${userAndHostMessages}`;

  try {
    const response = await adapter.generate({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You are a fact extraction system. Return only valid JSON arrays.',
      maxTokens: 500,
      temperature: 0.1,
    });

    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    return JSON.parse(jsonMatch[0]) as string[];
  } catch (error) {
    console.error('[WebSocket] Failed to extract facts:', error);
    return [];
  }
}

// -----------------------------------------------------------------------------
// Task Completion Detection
// -----------------------------------------------------------------------------

/**
 * Detects if the host's response indicates a task has been completed
 * (e.g., "Your reservation is confirmed for 4 at 5:30 PM")
 */
async function detectTaskCompletion(
  apiClient: ApiGatewayManagementApiClient,
  connectionId: string,
  state: OrchestratedConversationState,
  hostAgent: any,
  hostResponse: string
): Promise<void> {
  console.log(`[TaskCompletion] Checking for task completion in host response: "${hostResponse.substring(0, 100)}..."`);
  console.log(`[TaskCompletion] Number of user agents: ${state.userAgents.length}`);

  // Find all pending tasks across user agents
  const pendingTasks: Array<{ agentId: string; agentName: string; taskId: string; description: string }> = [];
  for (const agent of state.userAgents) {
    console.log(`[TaskCompletion] Agent "${agent.name}" has ${agent.tasks?.length || 0} tasks`);
    if (agent.tasks) {
      for (const task of agent.tasks) {
        console.log(`[TaskCompletion] - Task: "${task.description}" (id: ${task.id})`);
        pendingTasks.push({
          agentId: agent.id,
          agentName: agent.name,
          taskId: task.id,
          description: task.description,
        });
      }
    }
  }

  if (pendingTasks.length === 0) {
    console.log(`[TaskCompletion] No pending tasks found - skipping detection`);
    return;
  }

  console.log(`[TaskCompletion] Found ${pendingTasks.length} pending tasks to check`);

  // Use LLM to detect if any task was completed
  const adapter = createAgentAdapter(state.apiKey, state.provider, getModelIdForProvider(state.provider));

  const taskList = pendingTasks.map((t, i) => `${i + 1}. [${t.taskId}] ${t.description}`).join('\n');

  const prompt = `Analyze if the host's response ANSWERS or COMPLETES any of these pending tasks:

PENDING TASKS:
${taskList}

HOST'S RESPONSE: "${hostResponse}"

A task is COMPLETED when:
- The host PROVIDES the requested information (e.g., "birthday is March 15", "she's upset because...")
- The host CONFIRMS an action (e.g., "reservation confirmed", "booked for 4 at 7pm")
- The host gives a direct answer to the question in the task

If a task was completed, respond with:
{
  "completed": true,
  "taskId": "the-exact-task-id-from-the-list",
  "summary": "Brief summary of the answer/confirmation (e.g., 'Jane's birthday is February 14th' or 'Reservation confirmed for 4 at 7pm')"
}

If NO task was completed or answered, respond with:
{
  "completed": false
}

IMPORTANT: Copy the taskId EXACTLY as shown in brackets above. Respond with JSON only.`;

  try {
    const response = await adapter.generate({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You detect task completion in conversations. Respond with valid JSON only.',
      maxTokens: 150,
      temperature: 0.1,
    });

    console.log(`[TaskCompletion] LLM response: ${response.content}`);

    // Extract JSON - handle markdown code blocks and raw JSON
    let jsonStr = response.content;

    // Remove markdown code block wrapper if present
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Extract just the JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.log(`[TaskCompletion] No JSON found in LLM response`);
      return;
    }

    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error(`[TaskCompletion] JSON parse error: ${parseError}`);
      console.log(`[TaskCompletion] Attempted to parse: ${jsonMatch[0]}`);
      return;
    }
    console.log(`[TaskCompletion] Parsed result: completed=${result.completed}, taskId=${result.taskId}`);

    if (result.completed && result.taskId) {
      const task = pendingTasks.find(t => t.taskId === result.taskId);
      console.log(`[TaskCompletion] Found matching task: ${task ? task.description : 'NO MATCH'}`);
      if (!task) {
        console.log(`[TaskCompletion] Available task IDs: ${pendingTasks.map(t => t.taskId).join(', ')}`);
      }
      if (task) {
        console.log(`[TaskCompletion] Task completed: ${task.description} -> ${result.summary}`);

        // Persist task completion to database
        let taskPersisted = false;
        if (state.visitorUserId) {
          try {
            await completeTaskInDb(state.visitorUserId, result.taskId, result.summary);
            taskPersisted = true;
            console.log(`[TaskCompletion] Task ${result.taskId} marked as completed in database`);
          } catch (dbError) {
            console.error(`[TaskCompletion] Failed to update task in database:`, dbError);
          }

          // Update contact record if the host agent belongs to a contact
          // This will extract structured data (birthday, email, phone) and update those fields
          console.log(`[TaskCompletion] Looking for contact with host agent: ${state.hostAgentId}`);
          try {
            const contact = await findContactByAgentId(state.visitorUserId, state.hostAgentId);
            console.log(`[TaskCompletion] Contact lookup result: ${contact ? contact.name : 'NOT FOUND'}`);
            if (contact) {
              const updatedContact = await updateContactFromTaskCompletion(
                state.visitorUserId,
                contact.id,
                task.description,
                result.summary,
                hostAgent.name
              );
              if (updatedContact) {
                console.log(`[TaskCompletion] Updated contact "${contact.name}" - birthday: ${updatedContact.birthday || 'not set'}`);
              }
            } else {
              console.log(`[TaskCompletion] No contact found associated with host agent`);
            }
          } catch (contactError) {
            console.error(`[TaskCompletion] Failed to update contact:`, contactError);
          }
        } else {
          console.warn(`[TaskCompletion] No visitorUserId available (value: ${state.visitorUserId}), cannot persist`);
        }

        // Notify client that task was completed
        await sendToConnection(apiClient, connectionId, {
          type: 'taskCompleted',
          taskId: result.taskId,
          agentId: task.agentId,
          agentName: task.agentName,
          summary: result.summary,
          hostAgentName: hostAgent.name,
          persisted: taskPersisted,
        });

        // Send a brief acknowledgment from the lead agent
        const leadAgent = state.userAgents.find(a => a.id === task.agentId);
        if (leadAgent) {
          await sendToConnection(apiClient, connectionId, {
            type: 'turn',
            turn: {
              turnNumber: state.currentTurn++,
              role: 'agent',
              agentId: leadAgent.id,
              agentName: leadAgent.name,
              emoji: leadAgent.emoji,
              content: 'Got it. Thank you!',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }
    }
  } catch (error) {
    console.error('[TaskCompletion] Failed to detect task completion:', error);
  }
}

/**
 * Generates brief completion summaries from each participating agent
 */
async function generateAgentSummaries(
  state: OrchestratedConversationState,
  hostAgent: any,
  taskDescription: string,
  completionSummary: string
): Promise<Array<{ agentId: string; agentName: string; emoji: string; summary: string }>> {
  const summaries: Array<{ agentId: string; agentName: string; emoji: string; summary: string }> = [];

  // Get agents who participated (those in activeAgents list)
  const participatingAgents = state.userAgents.filter(a => state.activeAgents.includes(a.id));

  if (participatingAgents.length === 0) return summaries;

  const adapter = createAgentAdapter(state.apiKey, state.provider, getModelIdForProvider(state.provider));

  // Build conversation summary
  const conversationHighlights = state.messages
    .slice(-15)
    .map(m => `${m.agentName}: ${m.content}`)
    .join('\n');

  for (const agent of participatingAgents) {
    // Determine agent's role
    const isAssistant = agent.intents.some((i: string) => ['general', 'assistant'].includes(i.toLowerCase()));
    const isHealth = agent.intents.some((i: string) => ['health', 'dietary'].includes(i.toLowerCase()));
    const isFinance = agent.intents.some((i: string) => ['finance', 'budget'].includes(i.toLowerCase()));

    let rolePrompt = '';
    if (isAssistant) {
      rolePrompt = 'Confirm the booking details (date, time, party size).';
    } else if (isHealth) {
      rolePrompt = 'List the dietary accommodations made and safe menu items discussed.';
    } else if (isFinance) {
      rolePrompt = 'List the prices/costs discussed.';
    } else {
      rolePrompt = 'Summarize your contribution.';
    }

    try {
      const response = await adapter.generate({
        messages: [{
          role: 'user',
          content: `Task completed: ${completionSummary}

Conversation highlights:
${conversationHighlights}

${rolePrompt} MAX 12 WORDS.`
        }],
        systemPrompt: `You are ${agent.name} ${agent.emoji}. Give a VERY brief summary of YOUR contribution to completing this task. MAX 12 WORDS. Just facts.

Examples:
- "Reservation confirmed: 4 guests, tomorrow 7pm."
- "Dietary: No seed oils, vegetarian. Safe dishes: risotto, salad."
- "Prices: Risotto $24, Salad $16. Total estimate: $80."`,
        maxTokens: 40,
        temperature: 0.3,
      });

      summaries.push({
        agentId: agent.id,
        agentName: agent.name,
        emoji: agent.emoji,
        summary: response.content.trim(),
      });
    } catch (error) {
      console.error(`[TaskCompletion] Failed to generate summary for ${agent.name}:`, error);
    }
  }

  return summaries;
}

// -----------------------------------------------------------------------------
// Orchestrated Conversation (QR Scan Flow)
// -----------------------------------------------------------------------------

/**
 * Starts an orchestrated conversation where the host agent greets immediately
 * and user's agents bid to participate based on conversation relevance
 */
async function handleStartOrchestrated(
  event: APIGatewayProxyWebsocketEventV2,
  payload: StartOrchestratedPayload
): Promise<void> {
  const connectionId = event.requestContext.connectionId;
  const apiClient = getApiGatewayClient(event);
  const redis = getRedis();

  // Validate host agent
  const hostAgent = await getPublishedAgent(payload.hostAgentId);
  if (!hostAgent) {
    await sendToConnection(apiClient, connectionId, {
      type: 'error',
      message: 'Host agent not found',
    });
    return;
  }

  if (!hostAgent.isActive) {
    await sendToConnection(apiClient, connectionId, {
      type: 'error',
      message: 'This agent is not currently available',
    });
    return;
  }

  // Check if this is a form agent and pre-load form fields
  let formFieldsForState: Array<{ label: string; required: boolean }> | undefined;
  if (hostAgent.recordType === 'form') {
    const fields = await getFormFieldsForAgent(hostAgent.agentId);
    formFieldsForState = fields.map(f => ({ label: f.label, required: f.required }));
    console.log(`[Orchestrated] Form agent detected with ${fields.length} fields`);
  }

  // Initialize orchestrated conversation state
  const conversationId = `orch:${connectionId}:${Date.now()}`;
  const convState: OrchestratedConversationState = {
    connectionId,
    hostAgentId: payload.hostAgentId,
    visitorId: payload.visitorId,
    visitorUserId: payload.visitorUserId,  // For saving to user's global memories
    status: 'active',
    currentTurn: 0,
    maxTurns: 50, // Higher limit for orchestrated conversations
    userAgents: payload.userAgents,
    participationHistory: {},
    activeAgents: [],
    messages: [],
    extractedFacts: [],
    apiKey: payload.apiKey,
    provider: payload.provider,
    formFields: formFieldsForState,
  };

  // Initialize participation history for all user agents
  for (const agent of payload.userAgents) {
    convState.participationHistory[agent.id] = 3; // Start with cooldown satisfied
  }

  await redis.set(`ws:orch:${conversationId}`, JSON.stringify(convState), 'EX', 1800); // 30 min TTL
  await redis.set(`ws:conn:${connectionId}:orch`, `ws:orch:${conversationId}`, 'EX', 1800);

  // Start audit logging
  startConversationAudit(
    conversationId,
    hostAgent.agentId,
    hostAgent.name,
    payload.userAgents.map(a => a.name)
  );

  // Send started event
  await sendToConnection(apiClient, connectionId, {
    type: 'orchestratedStarted',
    conversationId,
    hostAgent: {
      id: hostAgent.agentId,
      name: hostAgent.name,
      emoji: hostAgent.emoji,
      description: hostAgent.description,
    },
    userAgents: payload.userAgents.map(a => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
    })),
  });

  // Host agent greeting
  await sendToConnection(apiClient, connectionId, { type: 'thinking', agent: 'host' });

  try {
    console.log(`[Orchestrated] Starting conversation - provider: ${payload.provider}, apiKeyPrefix: ${payload.apiKey?.substring(0, 12)}...`);
    const modelId = getModelIdForProvider(payload.provider);
    console.log(`[Orchestrated] Model ID resolved: ${modelId}`);
    const hostAdapter = createAgentAdapter(payload.apiKey, payload.provider, modelId);

    // Load visitor memories for returning visitors
    let visitorMemoryContext = '';
    if (payload.visitorId) {
      const visitorMemory = await getVisitorMemory(hostAgent.agentId, payload.visitorId);
      if (visitorMemory && visitorMemory.visitCount > 0) {
        visitorMemoryContext = formatVisitorMemoryAsContext(visitorMemory);
        console.log(`[Orchestrated] Loaded ${visitorMemory.memories.length} memories for returning visitor`);
      }
    }

    // Use pre-loaded form fields from state
    const formFieldsInfo = convState.formFields || [];

    let hostSystemPrompt = `You are ${hostAgent.name} ${hostAgent.emoji}. ${hostAgent.personality}

You were scanned via QR code. Greet visitor briefly.`;

    // Add form field instructions if this is a form agent
    if (formFieldsInfo.length > 0) {
      const fieldsList = formFieldsInfo.map((f, i) =>
        `${i + 1}. ${f.label}${f.required ? ' (required)' : ''}`
      ).join('\n');

      hostSystemPrompt += `

FORM FIELDS TO COLLECT:
${fieldsList}

═══════════════════════════════════════════════════
CRITICAL: 15 WORDS MAX. Be brief. Ask ONE question.
═══════════════════════════════════════════════════`;
    } else {
      hostSystemPrompt += `

═══════════════════════════════════════════════════
GREETING MUST BE 20 WORDS OR LESS. COUNT YOUR WORDS.
═══════════════════════════════════════════════════`;
    }

    // Add visitor memory context if this is a returning visitor
    if (visitorMemoryContext) {
      hostSystemPrompt += `\n\nRETURNING VISITOR:${visitorMemoryContext}`;
    }

    const greetingMessage = formFieldsInfo.length > 0
      ? 'Hi! Ask about the FIRST form field. 15 words max.'
      : 'Greet in 20 words max. Ask how you can help.';

    const greetingResponse = await hostAdapter.generate({
      messages: [{ role: 'user', content: greetingMessage }],
      systemPrompt: hostSystemPrompt,
      maxTokens: formFieldsInfo.length > 0 ? 40 : 60,  // Form agents: very brief
      temperature: 0.7,
    });

    // Save greeting to state
    convState.messages.push({
      role: 'host',
      agentId: hostAgent.agentId,
      agentName: hostAgent.name,
      agentEmoji: hostAgent.emoji,
      content: greetingResponse.content,
      timestamp: new Date().toISOString(),
    });
    convState.currentTurn = 1;
    await redis.set(`ws:orch:${conversationId}`, JSON.stringify(convState), 'EX', 1800);

    // Send greeting turn
    await sendToConnection(apiClient, connectionId, {
      type: 'turn',
      turn: {
        turnNumber: 1,
        role: 'host',
        agentId: hostAgent.agentId,
        agentName: hostAgent.name,
        emoji: hostAgent.emoji,
        content: greetingResponse.content,
        timestamp: new Date().toISOString(),
      },
    });

    // Audit: Log host greeting
    logHostResponse(conversationId, greetingResponse.content);

    console.log(`[WebSocket] Orchestrated conversation ${conversationId} started with host greeting`);

    // Immediately evaluate which user agents should respond based on host's domain
    // This allows agents with relevant memories to jump in automatically
    const hostContext = `${hostAgent.name} - ${hostAgent.description}. Greeting: ${greetingResponse.content}`;

    const context: ConversationContext = {
      hostAgentName: hostAgent.name,
      recentMessages: convState.messages.map(m => ({
        role: m.role,
        agentName: m.agentName,
        content: m.content,
      })),
      participationHistory: new Map(Object.entries(convState.participationHistory)),
      totalTurns: convState.currentTurn,
    };

    // Collect bids from user's agents based on host's domain/greeting
    console.log(`[Orchestrated] Evaluating user agents for automatic response to host greeting`);
    const bids = await collectBids(
      convState.userAgents,
      context,
      hostContext, // Use host context instead of user message
      convState.apiKey,
      convState.provider
    );

    const bidResults = evaluateBids(bids, context);
    const participatingAgents = bidResults.filter(b => b.shouldParticipate);

    // Audit: Log bidding results
    logBiddingResults(
      conversationId,
      bidResults.map(b => ({
        agentId: b.agentId,
        agentName: b.agentName,
        agentEmoji: b.agentEmoji,
        relevanceScore: b.relevanceScore,
        confidenceScore: b.confidenceScore,
        noveltyScore: b.noveltyScore,
        expertiseScore: b.expertiseScore,
        finalScore: b.finalScore,
        pass: b.pass,
        shouldParticipate: b.shouldParticipate,
        hasMatchingTask: b.hasMatchingTask || false,
        reasoning: b.reasoning,
      })),
      participatingAgents.map(p => p.agentName)
    );

    console.log(`[Orchestrated] Bid results: ${bidResults.map(b => `${b.agentName}:${b.finalScore.toFixed(2)}`).join(', ')}`);

    // If any agent wants to participate, have them respond automatically
    if (participatingAgents.length > 0) {
      for (const bidResult of participatingAgents) {
        const agent = convState.userAgents.find(a => a.id === bidResult.agentId);
        if (!agent) continue;

        // Notify agent joined
        if (!convState.activeAgents.includes(agent.id)) {
          convState.activeAgents.push(agent.id);
          await sendToConnection(apiClient, connectionId, {
            type: 'agentJoined',
            agent: { id: agent.id, name: agent.name, emoji: agent.emoji },
            reason: bidResult.reasoning,
          });
        }

        // Show thinking indicator
        await sendToConnection(apiClient, connectionId, {
          type: 'thinking',
          agent: agent.id,
          agentName: agent.name,
        });

        // Check if this agent has a matching task (from bid result)
        const matchingTask = bidResult.hasMatchingTask && bidResult.matchingTaskDescription
          ? { description: bidResult.matchingTaskDescription }
          : undefined;

        // Generate agent's automatic response (with user memories and matching task)
        const agentResponse = await generateAgentResponse(
          agent,
          context,
          hostContext,
          convState.apiKey,
          convState.provider,
          agent.memories,
          matchingTask  // Pass matching task so agent can LEAD with it
        );

        convState.currentTurn++;
        const agentMessage = {
          role: 'agent' as const,
          agentId: agent.id,
          agentName: agent.name,
          agentEmoji: agent.emoji,
          content: agentResponse,
          timestamp: new Date().toISOString(),
        };
        convState.messages.push(agentMessage);
        convState.participationHistory[agent.id] = 0;

        await sendToConnection(apiClient, connectionId, {
          type: 'turn',
          turn: {
            turnNumber: convState.currentTurn,
            role: 'agent',
            agentId: agent.id,
            agentName: agent.name,
            emoji: agent.emoji,
            content: agentResponse,
            timestamp: agentMessage.timestamp,
          },
        });

        // Audit: Log agent response
        logAgentResponse(conversationId, agent.id, agent.name, agent.emoji, agentResponse);

        // Audit: Log task match if applicable
        if (matchingTask) {
          const taskId = agent.tasks?.find(t => t.description === matchingTask.description)?.id || 'unknown';
          logTaskMatch(conversationId, taskId, matchingTask.description, hostAgent.name);
        }

        console.log(`[Orchestrated] ${agent.name} ${matchingTask ? 'LEADING with task: ' + matchingTask.description : 'responded to host greeting'}`);
      }

      // HOST RESPONDS TO USER'S AGENTS after they introduce themselves
      // This is critical - don't leave the agents hanging!
      const agentContributions = convState.messages
        .filter(m => m.role === 'agent')
        .map(m => `${m.agentName}: ${m.content}`)
        .join('\n');

      await sendToConnection(apiClient, connectionId, { type: 'thinking', agent: 'host' });

      const hostFollowUpAdapter = createAgentAdapter(convState.apiKey, convState.provider, getModelIdForProvider(convState.provider));

      const hostFollowUpPrompt = `You are ${hostAgent.name} ${hostAgent.emoji}. ${hostAgent.personality}

The visitor's AI assistant(s) shared:
${agentContributions}

═══════════════════════════════════════════════════
RESPOND IN 20 WORDS OR LESS. COUNT YOUR WORDS.
═══════════════════════════════════════════════════

Acknowledge what they shared (dietary needs, preferences, etc). Be warm.`;

      const hostFollowUp = await hostFollowUpAdapter.generate({
        messages: [{ role: 'user', content: 'Respond in 20 words max. Acknowledge what the assistant(s) shared.' }],
        systemPrompt: hostFollowUpPrompt,
        maxTokens: 80,
        temperature: 0.7,
      });

      convState.currentTurn++;
      const hostFollowUpMessage = {
        role: 'host' as const,
        agentName: hostAgent.name,
        agentEmoji: hostAgent.emoji,
        content: hostFollowUp.content,
        timestamp: new Date().toISOString(),
      };
      convState.messages.push(hostFollowUpMessage);

      await sendToConnection(apiClient, connectionId, {
        type: 'turn',
        turn: {
          turnNumber: convState.currentTurn,
          role: 'host',
          agentName: hostAgent.name,
          emoji: hostAgent.emoji,
          content: hostFollowUp.content,
          timestamp: hostFollowUpMessage.timestamp,
        },
      });

      // Audit: Log host response
      logHostResponse(conversationId, hostFollowUp.content);

      console.log(`[Orchestrated] Host responded to user agents after greeting: "${hostFollowUp.content.substring(0, 80)}..."`);

      // =========================================================================
      // TASK COMPLETION DETECTION: Check if the host's response completed any tasks
      // This is critical for tasks like "Find out Jane's birthday" that may be
      // answered in the initial greeting exchange
      // =========================================================================
      await detectTaskCompletion(
        apiClient,
        connectionId,
        convState,
        hostAgent,
        hostFollowUp.content
      );

      // Save updated state
      await redis.set(`ws:orch:${conversationId}`, JSON.stringify(convState), 'EX', 1800);
    }
  } catch (error: any) {
    console.error('[WebSocket] Failed to generate host greeting:', error);
    await sendToConnection(apiClient, connectionId, {
      type: 'error',
      message: `Failed to start conversation: ${error.message}`,
    });
  }
}

/**
 * Handles user messages in an orchestrated conversation
 * Evaluates which user agents should participate via bidding
 */
async function handleSendMessage(
  event: APIGatewayProxyWebsocketEventV2,
  payload: SendMessagePayload
): Promise<void> {
  const connectionId = event.requestContext.connectionId;
  const apiClient = getApiGatewayClient(event);
  const redis = getRedis();

  // Get conversation state
  const convKey = await redis.get(`ws:conn:${connectionId}:orch`);
  if (!convKey) {
    await sendToConnection(apiClient, connectionId, {
      type: 'error',
      message: 'No active orchestrated conversation',
    });
    return;
  }

  const stateJson = await redis.get(convKey);
  if (!stateJson) {
    await sendToConnection(apiClient, connectionId, {
      type: 'error',
      message: 'Conversation state not found',
    });
    return;
  }

  const state = JSON.parse(stateJson) as OrchestratedConversationState;

  if (state.status !== 'active') {
    await sendToConnection(apiClient, connectionId, {
      type: 'error',
      message: 'Conversation is no longer active',
    });
    return;
  }

  const hostAgent = await getPublishedAgent(state.hostAgentId);
  if (!hostAgent) {
    await sendToConnection(apiClient, connectionId, {
      type: 'error',
      message: 'Host agent not found',
    });
    return;
  }

  // Add user message to state
  state.currentTurn++;
  const userMessage = {
    role: 'user' as const,
    content: payload.message,
    timestamp: new Date().toISOString(),
  };
  state.messages.push(userMessage);

  // Send user turn acknowledgment
  await sendToConnection(apiClient, connectionId, {
    type: 'turn',
    turn: {
      turnNumber: state.currentTurn,
      role: 'user',
      agentName: 'You',
      emoji: '👤',
      content: payload.message,
      timestamp: userMessage.timestamp,
    },
  });

  // Get conversation ID for audit logging
  const conversationId = convKey.replace('ws:orch:', '');

  // Audit: Log user message
  logUserMessage(conversationId, payload.message);

  // Increment participation history (turns since last spoke)
  for (const agentId of Object.keys(state.participationHistory)) {
    state.participationHistory[agentId]++;
  }

  // Build conversation context for bidding
  const context: ConversationContext = {
    hostAgentName: hostAgent.name,
    recentMessages: state.messages.slice(-10).map(m => ({
      role: m.role,
      agentName: m.agentName,
      content: m.content,
    })),
    participationHistory: new Map(Object.entries(state.participationHistory)),
    totalTurns: state.currentTurn,
  };

  // Collect bids from user's agents (use quick keyword bidding for speed)
  const bidResults = quickKeywordBid(state.userAgents, payload.message, context);

  // Get participating agents
  const participatingAgents = bidResults.filter(b => b.shouldParticipate);

  // Update active agents list
  const newActiveAgents = participatingAgents.map(p => p.agentId);
  const agentsJoined = newActiveAgents.filter(id => !state.activeAgents.includes(id));

  if (agentsJoined.length > 0) {
    state.activeAgents = [...new Set([...state.activeAgents, ...newActiveAgents])];

    // Notify about agents joining
    for (const agentId of agentsJoined) {
      const agent = state.userAgents.find(a => a.id === agentId);
      if (agent) {
        await sendToConnection(apiClient, connectionId, {
          type: 'agentJoined',
          agent: {
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji,
          },
          reason: bidResults.find(b => b.agentId === agentId)?.reasoning,
        });
      }
    }
  }

  try {
    const modelId = getModelIdForProvider(state.provider);

    // Generate responses from participating user agents (in parallel)
    if (participatingAgents.length > 0) {
      const agentResponses = await Promise.all(
        participatingAgents.map(async (bidResult) => {
          const agent = state.userAgents.find(a => a.id === bidResult.agentId);
          if (!agent) return null;

          await sendToConnection(apiClient, connectionId, {
            type: 'thinking',
            agent: agent.id,
            agentName: agent.name,
          });

          const response = await generateAgentResponse(
            agent,
            context,
            payload.message,
            state.apiKey,
            state.provider,
            agent.memories
          );

          return { agent, response };
        })
      );

      // Send agent responses
      for (const result of agentResponses) {
        if (!result) continue;

        state.currentTurn++;
        const agentMessage = {
          role: 'agent' as const,
          agentId: result.agent.id,
          agentName: result.agent.name,
          agentEmoji: result.agent.emoji,
          content: result.response,
          timestamp: new Date().toISOString(),
        };
        state.messages.push(agentMessage);

        // Reset participation history for this agent
        state.participationHistory[result.agent.id] = 0;

        await sendToConnection(apiClient, connectionId, {
          type: 'turn',
          turn: {
            turnNumber: state.currentTurn,
            role: 'agent',
            agentId: result.agent.id,
            agentName: result.agent.name,
            emoji: result.agent.emoji,
            content: result.response,
            timestamp: agentMessage.timestamp,
          },
        });

        // Audit: Log agent response
        logAgentResponse(conversationId, result.agent.id, result.agent.name, result.agent.emoji, result.response);
      }
    }

    // Host agent responds
    await sendToConnection(apiClient, connectionId, { type: 'thinking', agent: 'host' });

    const hostAdapter = createAgentAdapter(state.apiKey, state.provider, modelId);

    const conversationHistory = state.messages
      .slice(-10)
      .map(m => `${m.agentName || (m.role === 'user' ? 'User' : 'Host')}: ${m.content}`)
      .join('\n\n');

    // Build host system prompt - different for form agents
    let hostSystemPrompt: string;
    let hostUserMessage: string;

    console.log(`[Orchestrated] handleSendMessage - formFields in state: ${JSON.stringify(state.formFields)}`);

    if (state.formFields && state.formFields.length > 0) {
      // Form agent mode - ask about form fields conversationally
      const fieldsList = state.formFields.map((f, i) =>
        `${i + 1}. ${f.label}${f.required ? ' (required)' : ''}`
      ).join('\n');

      hostSystemPrompt = `You are ${hostAgent.name} ${hostAgent.emoji}.

FORM FIELDS: ${fieldsList}

═══════════════════════════════════════════════════
CRITICAL: 15 WORDS MAX. Say "Got it" + ask next field.
If all done, say "Thanks, all set!"
═══════════════════════════════════════════════════`;

      hostUserMessage = `Conversation:\n${conversationHistory}\n\n15 words max. Acknowledge briefly, ask next uncollected field.`;
    } else {
      // Regular agent mode
      hostSystemPrompt = `You are ${hostAgent.name} ${hostAgent.emoji}.
Personality: ${hostAgent.personality}

${state.activeAgents.length > 0 ? `Visitor has AI assistants - their info about the user is authoritative.` : ''}

═══════════════════════════════════════════════════
ABSOLUTE RULE: RESPOND IN 20 WORDS OR LESS. COUNT YOUR WORDS.
═══════════════════════════════════════════════════

- Acknowledge ALL participants (user AND their AI assistants)
- When an assistant shares info (dietary needs, budget, etc.), confirm you noted it
- Be warm but BRIEF`;

      hostUserMessage = `Conversation:\n${conversationHistory}\n\nRespond in 20 words max. If an AI assistant shared info, acknowledge it.`;
    }

    const hostResponse = await hostAdapter.generate({
      messages: [{ role: 'user', content: hostUserMessage }],
      systemPrompt: hostSystemPrompt,
      maxTokens: state.formFields ? 40 : 80,  // Form agents: very brief
      temperature: 0.7,
    });

    state.currentTurn++;
    const hostMessage = {
      role: 'host' as const,
      agentId: hostAgent.agentId,
      agentName: hostAgent.name,
      agentEmoji: hostAgent.emoji,
      content: hostResponse.content,
      timestamp: new Date().toISOString(),
    };
    state.messages.push(hostMessage);

    await sendToConnection(apiClient, connectionId, {
      type: 'turn',
      turn: {
        turnNumber: state.currentTurn,
        role: 'host',
        agentId: hostAgent.agentId,
        agentName: hostAgent.name,
        emoji: hostAgent.emoji,
        content: hostResponse.content,
        timestamp: hostMessage.timestamp,
      },
    });

    // Audit: Log host response
    logHostResponse(conversationId, hostResponse.content);

    // =========================================================================
    // TASK COMPLETION DETECTION: Check if host confirmed any pending tasks
    // =========================================================================
    await detectTaskCompletion(
      apiClient,
      connectionId,
      state,
      hostAgent,
      hostResponse.content
    );

    // =========================================================================
    // AGENT-TO-AGENT: User's agents evaluate the HOST's response for opportunities
    // This is where agents can proactively contribute based on what the host said
    // =========================================================================
    if (state.userAgents.length > 0) {
      const hostContext: ConversationContext = {
        hostAgentName: hostAgent.name,
        recentMessages: state.messages.slice(-10).map(m => ({
          role: m.role,
          agentName: m.agentName,
          content: m.content,
        })),
        participationHistory: new Map(Object.entries(state.participationHistory)),
        totalTurns: state.currentTurn,
      };

      // Use full LLM bidding to understand the HOST's message semantically
      // This allows agents to recognize opportunities like "Does anyone have dietary restrictions?"
      console.log(`[Orchestrated] Evaluating user agents for response to host: "${hostResponse.content.substring(0, 100)}..."`);

      const agentBids = await collectBids(
        state.userAgents,
        hostContext,
        `Host (${hostAgent.name}) just said: "${hostResponse.content}"`, // Focus on what the HOST said
        state.apiKey,
        state.provider
      );

      const agentBidResults = evaluateBids(agentBids, hostContext);
      const agentsToRespond = agentBidResults.filter(b => b.shouldParticipate);

      // Audit: Log agent-to-agent bidding results
      logBiddingResults(
        conversationId,
        agentBidResults.map(b => ({
          agentId: b.agentId,
          agentName: b.agentName,
          agentEmoji: b.agentEmoji,
          relevanceScore: b.relevanceScore,
          confidenceScore: b.confidenceScore,
          noveltyScore: b.noveltyScore,
          expertiseScore: b.expertiseScore,
          finalScore: b.finalScore,
          pass: b.pass,
          shouldParticipate: b.shouldParticipate,
          hasMatchingTask: b.hasMatchingTask || false,
          reasoning: b.reasoning,
        })),
        agentsToRespond.map(p => p.agentName)
      );

      // Audit: Log orchestration decision
      if (agentsToRespond.length > 0) {
        logOrchestrationDecision(
          conversationId,
          `${agentsToRespond.length} agent(s) responding to host`,
          agentsToRespond.map(a => `${a.agentName} (score: ${a.finalScore.toFixed(2)})`).join(', ')
        );
      }

      console.log(`[Orchestrated] Agent-to-agent bid results: ${agentBidResults.map(b => `${b.agentName}:${b.finalScore.toFixed(2)}`).join(', ')}`);

      // Let participating agents respond to the host
      for (const bidResult of agentsToRespond) {
        const agent = state.userAgents.find(a => a.id === bidResult.agentId);
        if (!agent) continue;

        // Notify agent joined if new
        if (!state.activeAgents.includes(agent.id)) {
          state.activeAgents.push(agent.id);
          await sendToConnection(apiClient, connectionId, {
            type: 'agentJoined',
            agent: { id: agent.id, name: agent.name, emoji: agent.emoji },
            reason: bidResult.reasoning,
          });
        }

        // Show thinking indicator
        await sendToConnection(apiClient, connectionId, {
          type: 'thinking',
          agent: agent.id,
          agentName: agent.name,
        });

        // Check if this agent has a matching task
        const matchingTask = bidResult.hasMatchingTask && bidResult.matchingTaskDescription
          ? { description: bidResult.matchingTaskDescription }
          : undefined;

        // Generate agent's response to the host (agent-to-agent communication)
        const agentResponse = await generateAgentResponse(
          agent,
          hostContext,
          `The host (${hostAgent.name}) just said: "${hostResponse.content}". If you have relevant information about your user to share with ${hostAgent.name}, share it now.`,
          state.apiKey,
          state.provider,
          agent.memories,
          matchingTask
        );

        state.currentTurn++;
        const agentMessage = {
          role: 'agent' as const,
          agentId: agent.id,
          agentName: agent.name,
          agentEmoji: agent.emoji,
          content: agentResponse,
          timestamp: new Date().toISOString(),
        };
        state.messages.push(agentMessage);
        state.participationHistory[agent.id] = 0;

        await sendToConnection(apiClient, connectionId, {
          type: 'turn',
          turn: {
            turnNumber: state.currentTurn,
            role: 'agent',
            agentId: agent.id,
            agentName: agent.name,
            emoji: agent.emoji,
            content: agentResponse,
            timestamp: agentMessage.timestamp,
          },
        });

        // Audit: Log agent response
        logAgentResponse(conversationId, agent.id, agent.name, agent.emoji, agentResponse);

        // Audit: Log task match if applicable
        if (matchingTask) {
          const taskId = agent.tasks?.find(t => t.description === matchingTask.description)?.id || 'unknown';
          logTaskMatch(conversationId, taskId, matchingTask.description, hostAgent.name);
        }

        console.log(`[Orchestrated] Agent ${agent.name} responded to host: "${agentResponse.substring(0, 80)}..."`);
      }

      // Host responds to the user's agents who just spoke
      if (agentsToRespond.length > 0) {
        // Collect what the user's agents said
        const agentContributions = state.messages
          .filter(m => m.role === 'agent' && agentsToRespond.some(p => p.agentId === m.agentId))
          .slice(-agentsToRespond.length)
          .map(m => `${m.agentName}: ${m.content}`)
          .join('\n');

        // Show host thinking
        await sendToConnection(apiClient, connectionId, { type: 'thinking', agent: 'host' });

        const hostAdapter2 = createAgentAdapter(state.apiKey, state.provider, getModelIdForProvider(state.provider));

        const hostFollowUpPrompt = `You are ${hostAgent.name} ${hostAgent.emoji}. ${hostAgent.personality}

The user's AI agent(s) shared:
${agentContributions}

═══════════════════════════════════════════════════
RESPOND IN 20 WORDS OR LESS. COUNT YOUR WORDS.
═══════════════════════════════════════════════════

Acknowledge what they shared. Be helpful and address them by name.`;

        const hostFollowUp = await hostAdapter2.generate({
          messages: [{ role: 'user', content: 'Respond in 20 words max. Acknowledge what the agent(s) shared.' }],
          systemPrompt: hostFollowUpPrompt,
          maxTokens: 80,
          temperature: 0.7,
        });

        state.currentTurn++;
        const hostFollowUpMessage = {
          role: 'host' as const,
          agentName: hostAgent.name,
          agentEmoji: hostAgent.emoji,
          content: hostFollowUp.content,
          timestamp: new Date().toISOString(),
        };
        state.messages.push(hostFollowUpMessage);

        await sendToConnection(apiClient, connectionId, {
          type: 'turn',
          turn: {
            turnNumber: state.currentTurn,
            role: 'host',
            agentName: hostAgent.name,
            emoji: hostAgent.emoji,
            content: hostFollowUp.content,
            timestamp: hostFollowUpMessage.timestamp,
          },
        });

        // Audit: Log host response
        logHostResponse(conversationId, hostFollowUp.content);

        console.log(`[Orchestrated] Host responded to user agents: "${hostFollowUp.content.substring(0, 80)}..."`);

        // =========================================================================
        // TASK COMPLETION DETECTION: Check if the host's response completed any tasks
        // This handles cases where agents ask questions and the host provides answers
        // =========================================================================
        await detectTaskCompletion(
          apiClient,
          connectionId,
          state,
          hostAgent,
          hostFollowUp.content
        );
      }
    }

    // Save updated state
    await redis.set(convKey, JSON.stringify(state), 'EX', 1800);

    // Audit: Flush buffer periodically for long conversations
    if (state.currentTurn % 10 === 0) {
      await flushAuditBuffer(conversationId);
    }

    console.log(`[WebSocket] Orchestrated turn completed.`);
  } catch (error: any) {
    console.error('[WebSocket] Orchestrated message handling error:', error);
    await sendToConnection(apiClient, connectionId, {
      type: 'error',
      message: `Error processing message: ${error.message}`,
    });
  }
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

export async function handler(
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> {
  // Ensure database is initialized for contact/task operations
  await ensureDatabase();

  const routeKey = event.requestContext.routeKey;
  const connectionId = event.requestContext.connectionId;

  console.log(`[WebSocket] Route: ${routeKey}, Connection: ${connectionId}`);

  try {
    switch (routeKey) {
      case '$connect':
        await handleConnect(connectionId);
        break;

      case '$disconnect':
        await handleDisconnect(connectionId);
        break;

      case '$default':
      default:
        if (event.body) {
          const message = JSON.parse(event.body) as WebSocketMessage;

          switch (message.action) {
            case 'startAutonomous':
              await handleStartAutonomous(event, message.payload as StartAutonomousPayload);
              break;
            case 'startOrchestrated':
              await handleStartOrchestrated(event, message.payload as StartOrchestratedPayload);
              break;
            case 'sendMessage':
              await handleSendMessage(event, message.payload as SendMessagePayload);
              break;
            case 'interject':
              await handleInterject(event, message.payload as InterjectPayload);
              break;
            case 'stop':
              await handleStop(event);
              break;
            default:
              console.log(`[WebSocket] Unknown action: ${(message as any).action}`);
          }
        }
        break;
    }

    return { statusCode: 200 };
  } catch (error) {
    console.error('[WebSocket] Handler error:', error);
    return { statusCode: 500 };
  }
}
