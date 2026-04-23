import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { ulid } from 'ulid';
import { eq } from 'drizzle-orm';
import {
  createClaudeAdapter,
  createOpenAIAdapter,
  createGeminiAdapter,
  createGroqAdapter,
  getDatabase,
  publicAgents,
  type AgentAdapter,
} from '@macp/core';
import type {
  PublishedAgent,
  PublishedAgentsIndex,
  PublishedAgentMeta,
  PublicAgentSession,
  PublicSessionMessage,
  ExtractedSessionData,
  PublishAgentRequest,
  CreatePublicSessionRequest,
  PublicAgentInteractionMode,
  PublicIntroductionQuestion,
} from '@macp/shared';
import {
  getVisitorMemory,
  updateVisitorMemoryFromSession,
  formatVisitorMemoryAsContext,
  type VisitorMemory,
} from './visitor-memory-service.js';

// S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const MEMORY_BUCKET = process.env.MEMORY_BUCKET || 'macp-dev-memories';

// -----------------------------------------------------------------------------
// Feature Flags for Migration
// -----------------------------------------------------------------------------

/**
 * When true, writes go to both S3 and DB
 * Used during migration to ensure data is in sync
 */
const DUAL_WRITE_ENABLED = process.env.PUBLIC_AGENTS_DUAL_WRITE === 'true';

/**
 * When true, reads come from DB instead of S3
 * Enable after migration is complete and verified
 */
const USE_DB_FOR_READS = process.env.PUBLIC_AGENTS_USE_DB === 'true';

// -----------------------------------------------------------------------------
// Database Operations for Public Agents
// -----------------------------------------------------------------------------

/**
 * Gets a published agent from the database
 */
async function getPublishedAgentFromDB(agentId: string): Promise<PublishedAgent | null> {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(publicAgents)
      .where(eq(publicAgents.agentId, agentId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      agentId: row.agentId,
      ownerId: row.ownerId,
      ownerName: row.ownerName || undefined,
      recordType: (row.recordType as 'agent' | 'form') || 'agent',
      name: row.name,
      emoji: row.emoji,
      description: row.description,
      personality: row.personality,
      greeting: row.greeting,
      accentColor: row.accentColor,
      introductionGreeting: row.introductionGreeting || '',
      introductionQuestions: (row.introductionQuestions as PublicIntroductionQuestion[]) || [],
      voiceId: row.voiceId || undefined,
      voiceSpeed: row.voiceSpeed || undefined,
      isActive: row.isActive,
      allowDirectChat: row.allowDirectChat,
      allowAgentToAgent: row.allowAgentToAgent,
      allowAccompaniedChat: row.allowAccompaniedChat,
      viewCount: row.viewCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error('[PublicAgent] DB read error:', error);
    return null;
  }
}

/**
 * Saves a published agent to the database
 */
async function savePublishedAgentToDB(agent: PublishedAgent): Promise<void> {
  try {
    const db = getDatabase();

    // Check if exists
    const existing = await db
      .select({ agentId: publicAgents.agentId })
      .from(publicAgents)
      .where(eq(publicAgents.agentId, agent.agentId))
      .limit(1);

    const now = new Date();
    const values = {
      agentId: agent.agentId,
      ownerId: agent.ownerId,
      ownerName: agent.ownerName,
      name: agent.name,
      emoji: agent.emoji,
      description: agent.description,
      personality: agent.personality,
      greeting: agent.greeting,
      accentColor: agent.accentColor,
      introductionGreeting: agent.introductionGreeting,
      introductionQuestions: agent.introductionQuestions,
      voiceId: agent.voiceId,
      voiceSpeed: agent.voiceSpeed,
      isActive: agent.isActive,
      allowDirectChat: agent.allowDirectChat,
      allowAgentToAgent: agent.allowAgentToAgent,
      allowAccompaniedChat: agent.allowAccompaniedChat,
      viewCount: agent.viewCount,
      updatedAt: now,
    };

    if (existing.length > 0) {
      // Update
      await db
        .update(publicAgents)
        .set(values)
        .where(eq(publicAgents.agentId, agent.agentId));
    } else {
      // Insert
      await db.insert(publicAgents).values({
        ...values,
        createdAt: agent.createdAt ? new Date(agent.createdAt) : now,
      });
    }

    console.log(`[PublicAgent] Saved agent ${agent.agentId} to database`);
  } catch (error) {
    console.error('[PublicAgent] DB write error:', error);
    throw error;
  }
}

/**
 * Deletes a published agent from the database
 */
async function deletePublishedAgentFromDB(agentId: string): Promise<void> {
  try {
    const db = getDatabase();
    await db.delete(publicAgents).where(eq(publicAgents.agentId, agentId));
    console.log(`[PublicAgent] Deleted agent ${agentId} from database`);
  } catch (error) {
    console.error('[PublicAgent] DB delete error:', error);
    throw error;
  }
}

/**
 * Lists all published agents for a user from the database
 */
export async function listPublishedAgentsFromDB(userId: string): Promise<PublishedAgent[]> {
  try {
    const db = getDatabase();
    const results = await db
      .select()
      .from(publicAgents)
      .where(eq(publicAgents.ownerId, userId));

    return results.map(row => ({
      agentId: row.agentId,
      ownerId: row.ownerId,
      ownerName: row.ownerName || undefined,
      name: row.name,
      emoji: row.emoji,
      description: row.description,
      personality: row.personality,
      greeting: row.greeting,
      accentColor: row.accentColor,
      introductionGreeting: row.introductionGreeting || '',
      introductionQuestions: (row.introductionQuestions as PublicIntroductionQuestion[]) || [],
      voiceId: row.voiceId || undefined,
      voiceSpeed: row.voiceSpeed || undefined,
      isActive: row.isActive,
      allowDirectChat: row.allowDirectChat,
      allowAgentToAgent: row.allowAgentToAgent,
      allowAccompaniedChat: row.allowAccompaniedChat,
      viewCount: row.viewCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  } catch (error) {
    console.error('[PublicAgent] DB list error:', error);
    return [];
  }
}

// -----------------------------------------------------------------------------
// Published Agent Storage (S3 + DB with feature flags)
// -----------------------------------------------------------------------------

/**
 * Gets a published agent by agentId
 * Reads from DB if USE_DB_FOR_READS is enabled, otherwise from S3
 */
export async function getPublishedAgent(agentId: string): Promise<PublishedAgent | null> {
  // If DB reads are enabled, use database
  if (USE_DB_FOR_READS) {
    return getPublishedAgentFromDB(agentId);
  }

  // Otherwise, use S3 (default)
  return getPublishedAgentFromS3(agentId);
}

/**
 * Gets a published agent from S3 (legacy storage)
 */
async function getPublishedAgentFromS3(agentId: string): Promise<PublishedAgent | null> {
  const key = `public-agents/${agentId}.json`;

  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: MEMORY_BUCKET,
      Key: key,
    }));

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return JSON.parse(body) as PublishedAgent;
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Saves a published agent
 * When DUAL_WRITE_ENABLED, writes to both S3 and DB
 */
async function savePublishedAgent(agent: PublishedAgent): Promise<void> {
  // Always write to S3 (for now)
  await savePublishedAgentToS3(agent);

  // If dual-write is enabled, also write to DB
  if (DUAL_WRITE_ENABLED) {
    try {
      await savePublishedAgentToDB(agent);
    } catch (error) {
      console.error('[PublicAgent] Dual-write to DB failed (S3 succeeded):', error);
      // Don't throw - S3 write succeeded, log the DB error
    }
  }
}

/**
 * Saves a published agent to S3 (legacy storage)
 */
async function savePublishedAgentToS3(agent: PublishedAgent): Promise<void> {
  const key = `public-agents/${agent.agentId}.json`;

  await s3Client.send(new PutObjectCommand({
    Bucket: MEMORY_BUCKET,
    Key: key,
    Body: JSON.stringify(agent, null, 2),
    ContentType: 'application/json',
    ServerSideEncryption: 'AES256',
    Metadata: {
      'owner-id': agent.ownerId,
      'agent-id': agent.agentId,
      'is-active': agent.isActive.toString(),
    },
  }));
}

/**
 * Deletes a published agent
 * When DUAL_WRITE_ENABLED, deletes from both S3 and DB
 */
async function deletePublishedAgent(agentId: string): Promise<void> {
  // Always delete from S3 (for now)
  await deletePublishedAgentFromS3(agentId);

  // If dual-write is enabled, also delete from DB
  if (DUAL_WRITE_ENABLED) {
    try {
      await deletePublishedAgentFromDB(agentId);
    } catch (error) {
      console.error('[PublicAgent] Dual-delete from DB failed (S3 succeeded):', error);
      // Don't throw - S3 delete succeeded, log the DB error
    }
  }
}

/**
 * Deletes a published agent from S3 (legacy storage)
 */
async function deletePublishedAgentFromS3(agentId: string): Promise<void> {
  const key = `public-agents/${agentId}.json`;

  await s3Client.send(new DeleteObjectCommand({
    Bucket: MEMORY_BUCKET,
    Key: key,
  }));
}

// -----------------------------------------------------------------------------
// User's Published Agents Index
// -----------------------------------------------------------------------------

/**
 * Gets the index of a user's published agents
 */
export async function getPublishedAgentsIndex(userId: string): Promise<PublishedAgentsIndex | null> {
  const key = `public-agents/_index/${userId}.json`;

  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: MEMORY_BUCKET,
      Key: key,
    }));

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return JSON.parse(body) as PublishedAgentsIndex;
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Saves the index of a user's published agents
 */
async function savePublishedAgentsIndex(index: PublishedAgentsIndex): Promise<void> {
  const key = `public-agents/_index/${index.userId}.json`;

  await s3Client.send(new PutObjectCommand({
    Bucket: MEMORY_BUCKET,
    Key: key,
    Body: JSON.stringify(index, null, 2),
    ContentType: 'application/json',
    ServerSideEncryption: 'AES256',
  }));
}

// -----------------------------------------------------------------------------
// Session Storage
// -----------------------------------------------------------------------------

/**
 * Gets a public agent session
 */
export async function getPublicSession(sessionId: string): Promise<PublicAgentSession | null> {
  const key = `public-sessions/${sessionId}.json`;

  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: MEMORY_BUCKET,
      Key: key,
    }));

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return JSON.parse(body) as PublicAgentSession;
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Saves a public agent session
 */
async function savePublicSession(session: PublicAgentSession): Promise<void> {
  const key = `public-sessions/${session.sessionId}.json`;

  await s3Client.send(new PutObjectCommand({
    Bucket: MEMORY_BUCKET,
    Key: key,
    Body: JSON.stringify(session, null, 2),
    ContentType: 'application/json',
    ServerSideEncryption: 'AES256',
    Metadata: {
      'agent-id': session.agentId,
      'mode': session.mode,
      'status': session.status,
    },
  }));
}

// -----------------------------------------------------------------------------
// Publishing Operations
// -----------------------------------------------------------------------------

/**
 * Agent configuration for publishing (from client)
 */
export interface AgentConfigForPublishing {
  agentId: string;
  name: string;
  emoji: string;
  description: string;
  personality: string;
  greeting: string;
  accentColor: string;
}

/**
 * Publishes an agent with a public URL using its existing agentId
 */
export async function publishAgent(
  userId: string,
  ownerName: string | undefined,
  agentConfig: AgentConfigForPublishing,
  publishConfig: PublishAgentRequest
): Promise<PublishedAgent> {
  const now = new Date().toISOString();

  // Check if agent is already published
  const existing = await getPublishedAgent(agentConfig.agentId);
  if (existing) {
    // Update existing instead of creating new
    return updatePublishedAgent(userId, agentConfig.agentId, {
      ...publishConfig,
      isActive: true,
    });
  }

  // Create published agent using agentId as the key
  const publishedAgent: PublishedAgent = {
    agentId: agentConfig.agentId,
    ownerId: userId,
    ownerName,
    name: agentConfig.name,
    emoji: agentConfig.emoji,
    description: agentConfig.description,
    personality: agentConfig.personality,
    greeting: agentConfig.greeting,
    accentColor: agentConfig.accentColor,
    introductionGreeting: publishConfig.introductionGreeting || agentConfig.greeting,
    introductionQuestions: publishConfig.introductionQuestions || [],
    isActive: true,
    allowDirectChat: publishConfig.allowDirectChat,
    allowAgentToAgent: publishConfig.allowAgentToAgent,
    allowAccompaniedChat: publishConfig.allowAccompaniedChat,
    createdAt: now,
    updatedAt: now,
    viewCount: 0,
  };

  // Save the published agent
  await savePublishedAgent(publishedAgent);

  // Update user's index
  let index = await getPublishedAgentsIndex(userId);
  if (!index) {
    index = {
      userId,
      agents: [],
      totalPublished: 0,
      lastUpdated: now,
    };
  }

  const agentMeta: PublishedAgentMeta = {
    agentId: agentConfig.agentId,
    name: agentConfig.name,
    emoji: agentConfig.emoji,
    isActive: true,
    viewCount: 0,
    sessionCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  // Check if already in index
  const existingIndex = index.agents.findIndex(a => a.agentId === agentConfig.agentId);
  if (existingIndex !== -1) {
    index.agents[existingIndex] = agentMeta;
  } else {
    index.agents.push(agentMeta);
  }

  index.totalPublished = index.agents.filter(a => a.isActive).length;
  index.lastUpdated = now;

  await savePublishedAgentsIndex(index);

  console.log(`[PublicAgent] Published agent ${agentConfig.name} with ID ${agentConfig.agentId}`);

  return publishedAgent;
}

/**
 * Updates a published agent's settings
 */
export async function updatePublishedAgent(
  userId: string,
  agentId: string,
  updates: Partial<PublishAgentRequest> & { isActive?: boolean }
): Promise<PublishedAgent> {
  const agent = await getPublishedAgent(agentId);
  if (!agent) {
    throw new Error('Published agent not found');
  }

  if (agent.ownerId !== userId) {
    throw new Error('Not authorized to update this agent');
  }

  const now = new Date().toISOString();

  // Apply updates
  if (updates.allowDirectChat !== undefined) {
    agent.allowDirectChat = updates.allowDirectChat;
  }
  if (updates.allowAgentToAgent !== undefined) {
    agent.allowAgentToAgent = updates.allowAgentToAgent;
  }
  if (updates.allowAccompaniedChat !== undefined) {
    agent.allowAccompaniedChat = updates.allowAccompaniedChat;
  }
  if (updates.introductionGreeting !== undefined) {
    agent.introductionGreeting = updates.introductionGreeting;
  }
  if (updates.introductionQuestions !== undefined) {
    agent.introductionQuestions = updates.introductionQuestions;
  }
  if (updates.isActive !== undefined) {
    agent.isActive = updates.isActive;
  }

  agent.updatedAt = now;

  await savePublishedAgent(agent);

  // Update index
  const index = await getPublishedAgentsIndex(userId);
  if (index) {
    const agentIndex = index.agents.findIndex(a => a.agentId === agentId);
    if (agentIndex !== -1) {
      index.agents[agentIndex].isActive = agent.isActive;
      index.agents[agentIndex].updatedAt = now;
      index.totalPublished = index.agents.filter(a => a.isActive).length;
      index.lastUpdated = now;
      await savePublishedAgentsIndex(index);
    }
  }

  return agent;
}

/**
 * Unpublishes an agent
 */
export async function unpublishAgent(userId: string, agentId: string): Promise<void> {
  const agent = await getPublishedAgent(agentId);
  if (!agent) {
    throw new Error('Published agent not found');
  }

  if (agent.ownerId !== userId) {
    throw new Error('Not authorized to unpublish this agent');
  }

  // Delete the published agent file
  await deletePublishedAgent(agentId);

  // Update user's index
  const index = await getPublishedAgentsIndex(userId);
  if (index) {
    index.agents = index.agents.filter(a => a.agentId !== agentId);
    index.totalPublished = index.agents.filter(a => a.isActive).length;
    index.lastUpdated = new Date().toISOString();
    await savePublishedAgentsIndex(index);
  }

  console.log(`[PublicAgent] Unpublished agent with ID ${agentId}`);
}

/**
 * Increments the view count for a published agent
 */
export async function incrementViewCount(agentId: string): Promise<void> {
  const agent = await getPublishedAgent(agentId);
  if (!agent) return;

  agent.viewCount++;
  agent.updatedAt = new Date().toISOString();

  await savePublishedAgent(agent);

  // Also update in user's index
  const index = await getPublishedAgentsIndex(agent.ownerId);
  if (index) {
    const agentIndex = index.agents.findIndex(a => a.agentId === agentId);
    if (agentIndex !== -1) {
      index.agents[agentIndex].viewCount++;
      await savePublishedAgentsIndex(index);
    }
  }
}

// -----------------------------------------------------------------------------
// Session Operations
// -----------------------------------------------------------------------------

/**
 * Creates a new public session
 */
export async function createPublicSession(
  agentId: string,
  request: CreatePublicSessionRequest
): Promise<PublicAgentSession> {
  const agent = await getPublishedAgent(agentId);
  if (!agent) {
    throw new Error('Published agent not found');
  }

  if (!agent.isActive) {
    throw new Error('This agent is not currently accepting sessions');
  }

  // Validate mode is allowed
  if (request.mode === 'direct' && !agent.allowDirectChat) {
    throw new Error('Direct chat is not enabled for this agent');
  }
  if (request.mode === 'agent_to_agent' && !agent.allowAgentToAgent) {
    throw new Error('Agent-to-agent mode is not enabled for this agent');
  }
  if (request.mode === 'accompanied' && !agent.allowAccompaniedChat) {
    throw new Error('Accompanied mode is not enabled for this agent');
  }

  const now = new Date().toISOString();
  const sessionId = ulid();

  const session: PublicAgentSession = {
    sessionId,
    agentId,
    mode: request.mode,
    visitorId: request.visitorId,
    visitorUserId: request.visitorUserId,
    visitorAgentId: request.visitorAgentId,
    visitorAgentName: request.visitorAgentName,
    messages: [],
    extractedData: {
      preferences: {},
      memories: [],
      summary: '',
      completedTopics: [],
    },
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  await savePublicSession(session);

  // Increment session count in index
  const index = await getPublishedAgentsIndex(agent.ownerId);
  if (index) {
    const agentIndex = index.agents.findIndex(a => a.agentId === agentId);
    if (agentIndex !== -1) {
      index.agents[agentIndex].sessionCount++;
      await savePublishedAgentsIndex(index);
    }
  }

  console.log(`[PublicAgent] Created session ${sessionId} for agent ${agentId} in ${request.mode} mode`);

  return session;
}

/**
 * Creates an agent adapter based on provider
 */
export function createAgentAdapter(
  apiKey: string,
  provider: 'anthropic' | 'openai' | 'gemini' | 'groq',
  modelId: string
): AgentAdapter {
  console.log(`[createAgentAdapter] Creating adapter: provider=${provider}, modelId=${modelId}, apiKeyPrefix=${apiKey?.substring(0, 12)}...`);

  switch (provider) {
    case 'openai':
      return createOpenAIAdapter(apiKey, modelId);
    case 'gemini':
      return createGeminiAdapter(apiKey, modelId);
    case 'groq':
      return createGroqAdapter(apiKey, modelId);
    case 'anthropic':
    default:
      return createClaudeAdapter(apiKey, modelId);
  }
}

/**
 * Gets the default model ID for a provider
 * Uses -latest aliases where available to avoid version-specific deprecation
 */
export function getModelIdForProvider(provider: 'anthropic' | 'openai' | 'gemini' | 'groq'): string {
  const envModel = process.env.ANTHROPIC_MODEL;
  const modelMap: Record<string, string> = {
    anthropic: envModel || 'claude-sonnet-4-5-20250929',
    openai: process.env.OPENAI_MODEL || 'gpt-4o',
    gemini: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    groq: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  };
  const result = modelMap[provider];
  console.log(`[getModelIdForProvider] provider=${provider}, envModel=${envModel}, result=${result}`);
  return result;
}

/**
 * Builds the system prompt for a public agent session
 */
function buildPublicSessionSystemPrompt(
  agent: PublishedAgent,
  mode: PublicAgentInteractionMode,
  visitorAgentName?: string
): string {
  const basePrompt = `You are ${agent.name} ${agent.emoji}, a helpful AI assistant.

Your personality: ${agent.personality}

You are conducting a public session. ${
    mode === 'direct'
      ? 'A visitor is chatting with you directly.'
      : mode === 'agent_to_agent'
      ? `You are talking to ${visitorAgentName || 'another agent'} who represents their user.`
      : `You are helping a user who is accompanied by their agent ${visitorAgentName || ''}.`
  }

Guidelines:
- Be helpful, friendly, and professional
- Answer questions to the best of your ability
- If you don't have information to answer something, say so honestly
- Keep responses conversational but informative
- Remember what the visitor shares during this session`;

  // Add introduction questions context if available
  if (agent.introductionQuestions.length > 0) {
    const questions = agent.introductionQuestions
      .map(q => `- ${q.question}`)
      .join('\n');

    return `${basePrompt}

## Getting to Know the Visitor

During this conversation, try to naturally learn about the visitor by asking about these topics when appropriate:
${questions}

Don't make it feel like an interrogation - weave these questions naturally into the conversation.`;
  }

  return basePrompt;
}

/**
 * Sends a message in a public session and gets a response
 */
export async function sendPublicMessage(
  sessionId: string,
  content: string,
  role: 'user' | 'visitor_agent',
  apiKey: string,
  provider: 'anthropic' | 'openai' | 'gemini' | 'groq' = 'anthropic'
): Promise<{ userMessage: PublicSessionMessage; agentMessage: PublicSessionMessage }> {
  const session = await getPublicSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'active') {
    throw new Error('Session is not active');
  }

  const agent = await getPublishedAgent(session.agentId);
  if (!agent) {
    throw new Error('Published agent not found');
  }

  // Load visitor memories for returning visitors
  let visitorMemoryContext = '';
  if (session.visitorId) {
    const visitorMemory = await getVisitorMemory(session.agentId, session.visitorId);
    if (visitorMemory && visitorMemory.visitCount > 1) {
      visitorMemoryContext = formatVisitorMemoryAsContext(visitorMemory);
      console.log(`[PublicAgent] Loaded ${visitorMemory.memories.length} memories for returning visitor ${session.visitorId}`);
    }
  }

  const now = new Date().toISOString();

  // Add user/visitor message
  const userMessage: PublicSessionMessage = {
    id: ulid(),
    role,
    content,
    timestamp: now,
  };
  session.messages.push(userMessage);

  // Create adapter
  const modelId = getModelIdForProvider(provider);
  const adapter = createAgentAdapter(apiKey, provider, modelId);

  // Build system prompt with visitor memories
  let systemPrompt = buildPublicSessionSystemPrompt(
    agent,
    session.mode,
    session.visitorAgentName
  );

  // Add visitor memory context if this is a returning visitor
  if (visitorMemoryContext) {
    systemPrompt += visitorMemoryContext;
  }

  // Build conversation history
  const historyText = session.messages
    .slice(-20)
    .map(m => {
      const sender = m.role === 'assistant' ? agent.name :
                     m.role === 'visitor_agent' ? (session.visitorAgentName || 'Visitor Agent') :
                     'Visitor';
      return `${sender}: ${m.content}`;
    })
    .join('\n\n');

  // Generate response
  const startTime = Date.now();
  const response = await adapter.generate({
    messages: [{ role: 'user', content: historyText }],
    systemPrompt,
    maxTokens: 1000,
    temperature: 0.7,
  });
  const latencyMs = Date.now() - startTime;

  // Add agent response
  const totalTokens = response.tokensUsed.input + response.tokensUsed.output;
  const agentMessage: PublicSessionMessage = {
    id: ulid(),
    role: 'assistant',
    content: response.content,
    timestamp: new Date().toISOString(),
    metadata: {
      tokensUsed: totalTokens,
      latencyMs,
    },
  };
  session.messages.push(agentMessage);
  session.updatedAt = new Date().toISOString();

  await savePublicSession(session);

  return { userMessage, agentMessage };
}

/**
 * Completes a public session and extracts data
 * Also saves visitor memories for personalized future visits
 */
export async function completePublicSession(
  sessionId: string,
  apiKey: string,
  provider: 'anthropic' | 'openai' | 'gemini' | 'groq' = 'anthropic'
): Promise<{ session: PublicAgentSession; extractedData: ExtractedSessionData; visitorMemory?: VisitorMemory }> {
  const session = await getPublicSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status !== 'active') {
    throw new Error('Session is not active');
  }

  const now = new Date().toISOString();

  // Extract data from conversation
  const extractedData = await extractSessionData(session, apiKey, provider);

  session.extractedData = extractedData;
  session.status = 'completed';
  session.completedAt = now;
  session.updatedAt = now;

  await savePublicSession(session);

  // Save visitor memories for future personalized experiences
  let visitorMemory: VisitorMemory | undefined;
  if (session.visitorId && extractedData.memories.length > 0) {
    try {
      visitorMemory = await updateVisitorMemoryFromSession(
        session.agentId,
        session.visitorId,
        sessionId,
        extractedData.memories,
        extractedData.preferences,
        undefined // Could extract name from conversation
      );
      console.log(`[PublicAgent] Updated visitor memory for ${session.visitorId}: ${visitorMemory.memories.length} total memories`);
    } catch (error) {
      console.error(`[PublicAgent] Failed to save visitor memory:`, error);
    }
  }

  console.log(`[PublicAgent] Completed session ${sessionId} with ${extractedData.memories.length} memories extracted`);

  return { session, extractedData, visitorMemory };
}

/**
 * Extracts structured data from a session conversation
 */
async function extractSessionData(
  session: PublicAgentSession,
  apiKey: string,
  provider: 'anthropic' | 'openai' | 'gemini' | 'groq'
): Promise<ExtractedSessionData> {
  if (session.messages.length < 2) {
    return {
      preferences: {},
      memories: [],
      summary: 'Session was too short to extract meaningful data.',
      completedTopics: [],
    };
  }

  const modelId = getModelIdForProvider(provider);
  const adapter = createAgentAdapter(apiKey, provider, modelId);

  // Build conversation text
  const conversationText = session.messages
    .map(m => {
      const role = m.role === 'assistant' ? 'Agent' :
                   m.role === 'visitor_agent' ? 'Visitor Agent' :
                   'Visitor';
      return `${role}: ${m.content}`;
    })
    .join('\n\n');

  const extractionPrompt = `Analyze this conversation and extract structured information about the visitor.

## Conversation
${conversationText}

## Instructions

Extract the following information from the conversation. Return ONLY valid JSON, no additional text.

{
  "preferences": {
    // Key-value pairs of preferences expressed by the visitor
    // Example: {"communication_style": "email", "appointment_time": "morning"}
  },
  "memories": [
    // Array of key facts learned about the visitor
    // Example: ["Works as a software engineer", "Has two children"]
  ],
  "summary": "A brief 1-2 sentence summary of the conversation and its outcome",
  "completedTopics": [
    // Array of topics that were discussed or questions that were answered
    // Example: ["contact_information", "medical_history", "appointment_scheduling"]
  ]
}

Extract only information that was explicitly stated or strongly implied. Do not infer or assume.`;

  try {
    const response = await adapter.generate({
      messages: [{ role: 'user', content: extractionPrompt }],
      systemPrompt: 'You are a data extraction assistant. Extract structured information from conversations. Return only valid JSON.',
      maxTokens: 1500,
      temperature: 0.3,
    });

    // Parse the JSON response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extracted = JSON.parse(jsonMatch[0]) as ExtractedSessionData;
      return {
        preferences: extracted.preferences || {},
        memories: extracted.memories || [],
        summary: extracted.summary || '',
        completedTopics: extracted.completedTopics || [],
      };
    }
  } catch (error) {
    console.error('[PublicAgent] Failed to extract session data:', error);
  }

  return {
    preferences: {},
    memories: [],
    summary: 'Unable to extract structured data from this session.',
    completedTopics: [],
  };
}

/**
 * Gets sessions for a published agent (for owner dashboard)
 */
export async function getSessionsForAgent(
  userId: string,
  agentId: string,
  limit: number = 50
): Promise<PublicAgentSession[]> {
  // Verify ownership
  const agent = await getPublishedAgent(agentId);
  if (!agent || agent.ownerId !== userId) {
    throw new Error('Not authorized to view sessions for this agent');
  }

  // This is a simplified implementation - in production you'd want a proper index
  // For now we'll just return an empty array since we don't have session listing
  // A better implementation would use a GSI or separate session index file

  console.log(`[PublicAgent] Session listing requested for ${agentId} - requires implementation`);

  return [];
}

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

/**
 * Gets the public URL for an agent using its agentId
 */
export function getPublicAgentUrl(agentId: string): string {
  return `https://macp.io/${agentId}`;
}

/**
 * Validates that all required fields are present for publishing
 */
export function validatePublishRequest(
  agentConfig: AgentConfigForPublishing,
  publishConfig: PublishAgentRequest
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!agentConfig.agentId) {
    errors.push('Agent ID is required');
  }
  if (!agentConfig.name) {
    errors.push('Agent name is required');
  }
  if (!agentConfig.emoji) {
    errors.push('Agent emoji is required');
  }

  // At least one mode must be enabled
  if (!publishConfig.allowDirectChat && !publishConfig.allowAgentToAgent && !publishConfig.allowAccompaniedChat) {
    errors.push('At least one interaction mode must be enabled');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// -----------------------------------------------------------------------------
// Autonomous Conversation Prompts
// -----------------------------------------------------------------------------

/**
 * Builds the system prompt for the host agent in an autonomous conversation
 */
export function buildAutonomousHostPrompt(
  hostAgent: PublishedAgent,
  visitorAgentName: string,
  visitorContext?: string
): string {
  let prompt = `You are ${hostAgent.name} ${hostAgent.emoji}, an AI assistant having a conversation with ${visitorAgentName}, another AI agent who represents their user.

Your personality: ${hostAgent.personality}

## Your Role
You are the "host" in this agent-to-agent conversation. The visitor's agent has come to learn about you and potentially ask questions on behalf of their user.

## Guidelines
- Be welcoming, helpful, and professional
- Answer questions about yourself and your capabilities
- Share relevant information naturally
- Keep responses conversational and concise (2-3 sentences max)
- If asked about things you don't know, say so honestly
- When the conversation reaches a natural conclusion, say goodbye graciously`;

  // Add introduction questions as conversation topics
  if (hostAgent.introductionQuestions.length > 0) {
    const questions = hostAgent.introductionQuestions
      .map(q => `- ${q.question}`)
      .join('\n');

    prompt += `

## Topics to Explore
During this conversation, you may want to learn about the visitor by asking about these topics when appropriate:
${questions}

Don't make it feel like an interrogation - weave these naturally into the conversation.`;
  }

  if (visitorContext) {
    prompt += `

## Visitor Context
The visitor shared this context: "${visitorContext}"`;
  }

  return prompt;
}

/**
 * Builds the system prompt for the visitor agent in an autonomous conversation
 */
export function buildAutonomousVisitorPrompt(
  visitorAgentName: string,
  visitorPersonality: string,
  visitorQuestions: string[],
  hostAgentName: string,
  visitorContext?: string
): string {
  let prompt = `You are ${visitorAgentName}, an AI assistant representing your user in a conversation with ${hostAgentName}.

Your personality: ${visitorPersonality}

## Your Role
You are visiting on behalf of your user to learn about ${hostAgentName} and gather information. You're having an autonomous conversation where you represent your user's interests.

## Guidelines
- Be friendly, curious, and respectful
- Ask questions to learn what your user wants to know
- Share relevant information about your user when appropriate
- Keep responses conversational and concise (2-3 sentences max)
- When you've gathered the information you need, thank the host and say goodbye
- Don't overstay - aim to complete the conversation efficiently`;

  // Add questions the visitor should ask
  if (visitorQuestions.length > 0) {
    const questions = visitorQuestions
      .map(q => `- ${q}`)
      .join('\n');

    prompt += `

## Questions to Ask
Your user wants you to find out about these topics:
${questions}

Work these questions into the conversation naturally.`;
  }

  if (visitorContext) {
    prompt += `

## Context from Your User
Your user shared this context to guide the conversation: "${visitorContext}"
Use this to inform what questions you ask and information you share.`;
  }

  return prompt;
}
