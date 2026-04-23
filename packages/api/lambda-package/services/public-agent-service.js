"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublishedAgent = getPublishedAgent;
exports.getPublishedAgentsIndex = getPublishedAgentsIndex;
exports.getPublicSession = getPublicSession;
exports.publishAgent = publishAgent;
exports.updatePublishedAgent = updatePublishedAgent;
exports.unpublishAgent = unpublishAgent;
exports.incrementViewCount = incrementViewCount;
exports.createPublicSession = createPublicSession;
exports.createAgentAdapter = createAgentAdapter;
exports.getModelIdForProvider = getModelIdForProvider;
exports.sendPublicMessage = sendPublicMessage;
exports.completePublicSession = completePublicSession;
exports.getSessionsForAgent = getSessionsForAgent;
exports.getPublicAgentUrl = getPublicAgentUrl;
exports.validatePublishRequest = validatePublishRequest;
exports.buildAutonomousHostPrompt = buildAutonomousHostPrompt;
exports.buildAutonomousVisitorPrompt = buildAutonomousVisitorPrompt;
const client_s3_1 = require("@aws-sdk/client-s3");
const ulid_1 = require("ulid");
const core_1 = require("@macp/core");
const visitor_memory_service_js_1 = require("./visitor-memory-service.js");
// S3 client
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
});
const MEMORY_BUCKET = process.env.MEMORY_BUCKET || 'macp-dev-memories';
// -----------------------------------------------------------------------------
// Published Agent Storage
// -----------------------------------------------------------------------------
/**
 * Gets a published agent by agentId
 */
async function getPublishedAgent(agentId) {
    const key = `public-agents/${agentId}.json`;
    try {
        const response = await s3Client.send(new client_s3_1.GetObjectCommand({
            Bucket: MEMORY_BUCKET,
            Key: key,
        }));
        const body = await response.Body?.transformToString();
        if (!body)
            return null;
        return JSON.parse(body);
    }
    catch (error) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
            return null;
        }
        throw error;
    }
}
/**
 * Saves a published agent
 */
async function savePublishedAgent(agent) {
    const key = `public-agents/${agent.agentId}.json`;
    await s3Client.send(new client_s3_1.PutObjectCommand({
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
 */
async function deletePublishedAgent(agentId) {
    const key = `public-agents/${agentId}.json`;
    await s3Client.send(new client_s3_1.DeleteObjectCommand({
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
async function getPublishedAgentsIndex(userId) {
    const key = `public-agents/_index/${userId}.json`;
    try {
        const response = await s3Client.send(new client_s3_1.GetObjectCommand({
            Bucket: MEMORY_BUCKET,
            Key: key,
        }));
        const body = await response.Body?.transformToString();
        if (!body)
            return null;
        return JSON.parse(body);
    }
    catch (error) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
            return null;
        }
        throw error;
    }
}
/**
 * Saves the index of a user's published agents
 */
async function savePublishedAgentsIndex(index) {
    const key = `public-agents/_index/${index.userId}.json`;
    await s3Client.send(new client_s3_1.PutObjectCommand({
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
async function getPublicSession(sessionId) {
    const key = `public-sessions/${sessionId}.json`;
    try {
        const response = await s3Client.send(new client_s3_1.GetObjectCommand({
            Bucket: MEMORY_BUCKET,
            Key: key,
        }));
        const body = await response.Body?.transformToString();
        if (!body)
            return null;
        return JSON.parse(body);
    }
    catch (error) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
            return null;
        }
        throw error;
    }
}
/**
 * Saves a public agent session
 */
async function savePublicSession(session) {
    const key = `public-sessions/${session.sessionId}.json`;
    await s3Client.send(new client_s3_1.PutObjectCommand({
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
/**
 * Publishes an agent with a public URL using its existing agentId
 */
async function publishAgent(userId, ownerName, agentConfig, publishConfig) {
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
    const publishedAgent = {
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
    const agentMeta = {
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
    }
    else {
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
async function updatePublishedAgent(userId, agentId, updates) {
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
async function unpublishAgent(userId, agentId) {
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
async function incrementViewCount(agentId) {
    const agent = await getPublishedAgent(agentId);
    if (!agent)
        return;
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
async function createPublicSession(agentId, request) {
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
    const sessionId = (0, ulid_1.ulid)();
    const session = {
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
function createAgentAdapter(apiKey, provider, modelId) {
    console.log(`[createAgentAdapter] Creating adapter: provider=${provider}, modelId=${modelId}, apiKeyPrefix=${apiKey?.substring(0, 12)}...`);
    switch (provider) {
        case 'openai':
            return (0, core_1.createOpenAIAdapter)(apiKey, modelId);
        case 'gemini':
            return (0, core_1.createGeminiAdapter)(apiKey, modelId);
        case 'groq':
            return (0, core_1.createGroqAdapter)(apiKey, modelId);
        case 'anthropic':
        default:
            return (0, core_1.createClaudeAdapter)(apiKey, modelId);
    }
}
/**
 * Gets the default model ID for a provider
 * Uses -latest aliases where available to avoid version-specific deprecation
 */
function getModelIdForProvider(provider) {
    const envModel = process.env.ANTHROPIC_MODEL;
    const modelMap = {
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
function buildPublicSessionSystemPrompt(agent, mode, visitorAgentName) {
    const basePrompt = `You are ${agent.name} ${agent.emoji}, a helpful AI assistant.

Your personality: ${agent.personality}

You are conducting a public session. ${mode === 'direct'
        ? 'A visitor is chatting with you directly.'
        : mode === 'agent_to_agent'
            ? `You are talking to ${visitorAgentName || 'another agent'} who represents their user.`
            : `You are helping a user who is accompanied by their agent ${visitorAgentName || ''}.`}

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
async function sendPublicMessage(sessionId, content, role, apiKey, provider = 'anthropic') {
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
        const visitorMemory = await (0, visitor_memory_service_js_1.getVisitorMemory)(session.agentId, session.visitorId);
        if (visitorMemory && visitorMemory.visitCount > 1) {
            visitorMemoryContext = (0, visitor_memory_service_js_1.formatVisitorMemoryAsContext)(visitorMemory);
            console.log(`[PublicAgent] Loaded ${visitorMemory.memories.length} memories for returning visitor ${session.visitorId}`);
        }
    }
    const now = new Date().toISOString();
    // Add user/visitor message
    const userMessage = {
        id: (0, ulid_1.ulid)(),
        role,
        content,
        timestamp: now,
    };
    session.messages.push(userMessage);
    // Create adapter
    const modelId = getModelIdForProvider(provider);
    const adapter = createAgentAdapter(apiKey, provider, modelId);
    // Build system prompt with visitor memories
    let systemPrompt = buildPublicSessionSystemPrompt(agent, session.mode, session.visitorAgentName);
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
    const agentMessage = {
        id: (0, ulid_1.ulid)(),
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
async function completePublicSession(sessionId, apiKey, provider = 'anthropic') {
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
    let visitorMemory;
    if (session.visitorId && extractedData.memories.length > 0) {
        try {
            visitorMemory = await (0, visitor_memory_service_js_1.updateVisitorMemoryFromSession)(session.agentId, session.visitorId, sessionId, extractedData.memories, extractedData.preferences, undefined // Could extract name from conversation
            );
            console.log(`[PublicAgent] Updated visitor memory for ${session.visitorId}: ${visitorMemory.memories.length} total memories`);
        }
        catch (error) {
            console.error(`[PublicAgent] Failed to save visitor memory:`, error);
        }
    }
    console.log(`[PublicAgent] Completed session ${sessionId} with ${extractedData.memories.length} memories extracted`);
    return { session, extractedData, visitorMemory };
}
/**
 * Extracts structured data from a session conversation
 */
async function extractSessionData(session, apiKey, provider) {
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
            const extracted = JSON.parse(jsonMatch[0]);
            return {
                preferences: extracted.preferences || {},
                memories: extracted.memories || [],
                summary: extracted.summary || '',
                completedTopics: extracted.completedTopics || [],
            };
        }
    }
    catch (error) {
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
async function getSessionsForAgent(userId, agentId, limit = 50) {
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
function getPublicAgentUrl(agentId) {
    return `https://macp.io/${agentId}`;
}
/**
 * Validates that all required fields are present for publishing
 */
function validatePublishRequest(agentConfig, publishConfig) {
    const errors = [];
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
function buildAutonomousHostPrompt(hostAgent, visitorAgentName, visitorContext) {
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
function buildAutonomousVisitorPrompt(visitorAgentName, visitorPersonality, visitorQuestions, hostAgentName, visitorContext) {
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
//# sourceMappingURL=public-agent-service.js.map