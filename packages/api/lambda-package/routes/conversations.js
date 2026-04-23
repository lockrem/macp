"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConversationRoutes = registerConversationRoutes;
const zod_1 = require("zod");
const ulid_1 = require("ulid");
const core_1 = require("@macp/core");
const client_s3_1 = require("@aws-sdk/client-s3");
const crypto = __importStar(require("crypto"));
const connection_manager_js_1 = require("../services/connection-manager.js");
const push_service_js_1 = require("../services/push-service.js");
const redis_store_js_1 = require("../services/redis-store.js");
const fact_extraction_js_1 = require("../services/fact-extraction.js");
const orchestration_service_js_1 = require("../services/orchestration-service.js");
const rules_js_1 = require("./rules.js");
const rule_extraction_js_1 = require("../services/rule-extraction.js");
const fact_extraction_js_2 = require("../services/fact-extraction.js");
const agent_templates_js_1 = require("../services/agent-templates.js");
const introduction_service_js_1 = require("../services/introduction-service.js");
// -----------------------------------------------------------------------------
// User Agent Loading
// -----------------------------------------------------------------------------
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const s3ClientForSettings = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const secretsClient = new client_secrets_manager_1.SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
const bucketName = process.env.MEMORY_BUCKET || 'macp-dev-memories';
// Cache the encryption key
let cachedEncryptionKey = null;
async function getEncryptionKey() {
    if (cachedEncryptionKey) {
        return cachedEncryptionKey;
    }
    // Try environment variables first
    if (process.env.SETTINGS_ENCRYPTION_KEY) {
        cachedEncryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;
        return cachedEncryptionKey;
    }
    if (process.env.JWT_SECRET) {
        cachedEncryptionKey = process.env.JWT_SECRET;
        return cachedEncryptionKey;
    }
    // Fetch from Secrets Manager (same as settings.ts)
    try {
        const secretName = process.env.JWT_SECRET_NAME || 'macp-dev/jwt-secret';
        const response = await secretsClient.send(new client_secrets_manager_1.GetSecretValueCommand({
            SecretId: secretName,
        }));
        if (response.SecretString) {
            cachedEncryptionKey = response.SecretString;
            return response.SecretString;
        }
    }
    catch (error) {
        console.error('[Orchestration] Failed to fetch encryption key from Secrets Manager:', error);
    }
    // Fallback
    console.warn('[Orchestration] Using fallback encryption key');
    return 'dev-key-change-in-production';
}
function deriveKey(secret) {
    return crypto.scryptSync(secret, 'macp-settings-salt', 32);
}
async function decryptSettings(encryptedData) {
    const parts = encryptedData.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
    }
    const encryptionKey = await getEncryptionKey();
    const key = deriveKey(encryptionKey);
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
/**
 * Loads user's configured agents from their synced settings
 * Falls back to system defaults if no agents configured
 */
async function loadUserAgents(userId, provider) {
    try {
        const key = `settings/${userId}/settings.json`;
        const response = await s3ClientForSettings.send(new client_s3_1.GetObjectCommand({
            Bucket: bucketName,
            Key: key,
        }));
        const encryptedData = await response.Body?.transformToString();
        if (!encryptedData) {
            console.log(`[Orchestration] No settings found for user ${userId}`);
            return []; // No fallback - return empty if no settings
        }
        const decrypted = await decryptSettings(encryptedData);
        const settings = JSON.parse(decrypted);
        if (!settings.agents || settings.agents.length === 0) {
            console.log(`[Orchestration] No agents configured for user ${userId}`);
            return []; // No fallback - return empty if no agents
        }
        // Convert user agents to AgentConfig format
        const userAgents = settings.agents.map((agent) => ({
            id: agent.id,
            displayName: agent.name,
            emoji: agent.emoji || '🤖',
            provider: agent.provider || provider,
            modelId: agent.modelId || 'claude-sonnet-4-5-20250929',
            personality: agent.personality || agent.description,
            systemPrompt: agent.systemPrompt,
            // Map agent type to intents based on name/description
            intents: inferIntentsFromAgent(agent),
            memoryCategories: agent.memoryCategories || [],
        }));
        console.log(`[Orchestration] Loaded ${userAgents.length} agents for user ${userId}: ${userAgents.map(a => a.displayName).join(', ')}`);
        return userAgents;
    }
    catch (error) {
        if (error.name === 'NoSuchKey') {
            console.log(`[Orchestration] No settings file for user ${userId}`);
        }
        else {
            console.error(`[Orchestration] Failed to load user agents:`, error);
        }
        return []; // No fallback - return empty on error
    }
}
/**
 * Infers intents from agent name, description, and other properties
 */
function inferIntentsFromAgent(agent) {
    const intents = [];
    const searchText = `${agent.name} ${agent.description || ''} ${agent.personality || ''}`.toLowerCase();
    const intentPatterns = {
        health: ['health', 'medical', 'doctor', 'medication', 'wellness', 'symptom'],
        fitness: ['fitness', 'workout', 'exercise', 'coach', 'training', 'sport'],
        work: ['work', 'career', 'job', 'productivity', 'professional', 'business'],
        finance: ['money', 'finance', 'budget', 'financial', 'investment', 'savings'],
        personal: ['journal', 'personal', 'mood', 'emotional', 'reflection', 'diary'],
        education: ['study', 'learn', 'education', 'tutor', 'teaching', 'academic'],
    };
    for (const [intent, patterns] of Object.entries(intentPatterns)) {
        if (patterns.some(p => searchText.includes(p))) {
            intents.push(intent);
        }
    }
    // Default to general if no specific intents detected
    if (intents.length === 0) {
        intents.push('general');
    }
    return intents;
}
// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------
const createConversationSchema = zod_1.z.object({
    topic: zod_1.z.string().min(1).max(500),
    goal: zod_1.z.string().max(500).optional(),
    mode: zod_1.z.enum(['bts', 'campfire', 'solo']).default('campfire'),
    maxTurns: zod_1.z.number().min(1).max(50).default(20),
    inviteeUserId: zod_1.z.string().optional(),
    inviteeEmail: zod_1.z.string().email().optional(),
    // Solo mode options
    memoryCategories: zod_1.z.array(zod_1.z.string()).optional(), // Categories to inject into context
    extractFacts: zod_1.z.boolean().default(true), // Whether to extract facts after conversation
});
const startConversationSchema = zod_1.z.object({
    participantAgentIds: zod_1.z.array(zod_1.z.string()).min(2).max(2), // P2P = exactly 2 agents
});
// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
function registerConversationRoutes(app) {
    // Create a new conversation (send invitation)
    app.post('/conversations', async (req, reply) => {
        const userId = req.user?.userId || 'demo-user';
        const body = createConversationSchema.parse(req.body);
        const now = new Date().toISOString();
        const conversation = {
            id: (0, ulid_1.ulid)(),
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
        await redis_store_js_1.conversationStore.set(conversation);
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
        const { conversationId } = req.params;
        const conversation = await redis_store_js_1.conversationStore.get(conversationId);
        if (!conversation) {
            reply.code(404);
            return { error: 'Conversation not found' };
        }
        return conversation;
    });
    // Join a conversation (add your agent)
    app.post('/conversations/:conversationId/join', async (req, reply) => {
        const { conversationId } = req.params;
        const userId = req.user?.userId || 'demo-user';
        const body = zod_1.z.object({
            agentId: zod_1.z.string(),
            apiKey: zod_1.z.string().min(1), // Required: client's API key for their provider
            agentConfig: zod_1.z.object({
                displayName: zod_1.z.string(),
                provider: zod_1.z.enum(['anthropic', 'openai', 'gemini', 'groq']),
                modelId: zod_1.z.string(),
                systemPrompt: zod_1.z.string().optional(),
                personality: zod_1.z.string().optional(),
            }),
        }).parse(req.body);
        const conversation = await redis_store_js_1.conversationStore.get(conversationId);
        if (!conversation) {
            reply.code(404);
            return { error: 'Conversation not found' };
        }
        if (conversation.participants.length >= 2) {
            reply.code(400);
            return { error: 'Conversation already has maximum participants' };
        }
        const participant = {
            id: (0, ulid_1.ulid)(),
            userId,
            agentId: body.agentId,
            apiKey: body.apiKey, // Store the client's API key
            agentConfig: body.agentConfig,
        };
        conversation.participants.push(participant);
        await redis_store_js_1.conversationStore.set(conversation);
        await redis_store_js_1.conversationStore.addUserToConversation(userId, conversationId);
        // Subscribe user to WebSocket updates
        connection_manager_js_1.connectionManager.subscribeToConversation(userId, conversationId);
        return {
            participantId: participant.id,
            conversationId,
            participantCount: conversation.participants.length,
        };
    });
    // Start the conversation (begin agent-to-agent dialogue)
    app.post('/conversations/:conversationId/start', async (req, reply) => {
        const { conversationId } = req.params;
        const conversation = await redis_store_js_1.conversationStore.get(conversationId);
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
        await redis_store_js_1.conversationStore.set(conversation);
        // Start the conversation asynchronously
        runConversation(conversation, redis_store_js_1.conversationStore).catch(err => {
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
        const { conversationId } = req.params;
        const conversation = await redis_store_js_1.conversationStore.get(conversationId);
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
        const userConversations = await redis_store_js_1.conversationStore.getByUser(userId);
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
        const { conversationId } = req.params;
        const conversation = await redis_store_js_1.conversationStore.get(conversationId);
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
        await redis_store_js_1.conversationStore.set(conversation);
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
        const { conversationId } = req.params;
        const conversation = await redis_store_js_1.conversationStore.get(conversationId);
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
        const body = zod_1.z.object({
            agentId: zod_1.z.string(),
            apiKey: zod_1.z.string().min(1),
            agentConfig: zod_1.z.object({
                displayName: zod_1.z.string(),
                provider: zod_1.z.enum(['anthropic', 'openai', 'gemini', 'groq']),
                modelId: zod_1.z.string(),
                systemPrompt: zod_1.z.string().optional(),
                personality: zod_1.z.string().optional(),
            }),
            topic: zod_1.z.string().optional(),
            memoryCategories: zod_1.z.array(zod_1.z.string()).optional(),
            extractFacts: zod_1.z.boolean().default(true),
        }).parse(req.body);
        const now = new Date().toISOString();
        const conversationId = (0, ulid_1.ulid)();
        // Load memory context if categories specified
        let memoryContext = '';
        if (body.memoryCategories && body.memoryCategories.length > 0) {
            memoryContext = await loadMemoryContext(userId, body.memoryCategories, body.apiKey);
        }
        const participant = {
            id: (0, ulid_1.ulid)(),
            userId,
            agentId: body.agentId,
            apiKey: body.apiKey,
            agentConfig: body.agentConfig,
        };
        const conversation = {
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
        await redis_store_js_1.conversationStore.set(conversation);
        await redis_store_js_1.conversationStore.addUserToConversation(userId, conversationId);
        // Subscribe user to WebSocket updates
        connection_manager_js_1.connectionManager.subscribeToConversation(userId, conversationId);
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
        const { conversationId } = req.params;
        const userId = req.user?.userId || 'demo-user';
        const body = zod_1.z.object({
            content: zod_1.z.string().min(1).max(10000),
        }).parse(req.body);
        const conversation = await redis_store_js_1.conversationStore.get(conversationId);
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
        const humanMessageId = (0, ulid_1.ulid)();
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
            const systemPrompt = buildSoloSystemPromptWithMemory(participant.agentConfig, conversation.memoryContext);
            // Build conversation history for context
            const recentMessages = conversation.messages.slice(-20); // Last 20 messages
            const historyText = recentMessages
                .map(m => `${m.isHuman ? 'User' : participant.agentConfig.displayName}: ${m.content}`)
                .join('\n\n');
            const response = await adapter.generate({
                messages: [{ role: 'user', content: historyText }],
                systemPrompt,
                maxTokens: 80, // Enforce 20-word limit
                temperature: 0.7,
            });
            // Add agent response
            const agentMessageId = (0, ulid_1.ulid)();
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
            await redis_store_js_1.conversationStore.set(conversation);
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
        }
        catch (error) {
            console.error(`[Solo] Error generating response:`, error);
            reply.code(500);
            return { error: 'Failed to generate agent response' };
        }
    });
    // End a solo conversation and extract facts
    app.post('/conversations/:conversationId/end', async (req, reply) => {
        const { conversationId } = req.params;
        const userId = req.user?.userId || 'demo-user';
        const conversation = await redis_store_js_1.conversationStore.get(conversationId);
        if (!conversation) {
            reply.code(404);
            return { error: 'Conversation not found' };
        }
        if (conversation.status !== 'active') {
            reply.code(400);
            return { error: 'Conversation is not active' };
        }
        conversation.status = 'completed';
        await redis_store_js_1.conversationStore.set(conversation);
        // Broadcast completion
        broadcastToConversation(conversationId, {
            type: 'conversation_end',
            totalTurns: conversation.currentTurn,
            status: 'completed',
        });
        // Extract facts if enabled
        let extractedFacts = null;
        let extractedRulesCount = 0;
        // Get API key (from participant for solo, from orchestrationConfig for universal)
        const apiKey = conversation.orchestrationConfig?.apiKey
            || conversation.participants?.[0]?.apiKey;
        if (conversation.extractFacts && conversation.messages.length > 0 && apiKey) {
            // Format messages for extraction
            const messagesForExtraction = conversation.messages.map(m => ({
                role: (m.isHuman ? 'user' : 'assistant'),
                content: m.content,
            }));
            // Extract facts
            try {
                const extractionResult = await (0, fact_extraction_js_1.extractFactsFromConversation)(conversationId, messagesForExtraction, apiKey);
                if (Object.keys(extractionResult.factsByCategory).length > 0) {
                    extractedFacts = await storeExtractedFacts(userId, conversationId, extractionResult, apiKey);
                }
            }
            catch (error) {
                console.error('[Conversation] Fact extraction failed:', error);
            }
            // Extract rules for universal chat conversations
            if (conversation.mode === 'universal') {
                try {
                    // Find the most-used agent in this conversation
                    const agentUsage = new Map();
                    for (const msg of conversation.messages) {
                        if (!msg.isHuman && msg.agentId) {
                            const current = agentUsage.get(msg.agentId) || { count: 0, name: msg.agentName };
                            agentUsage.set(msg.agentId, { count: current.count + 1, name: msg.agentName || current.name });
                        }
                    }
                    // Extract rules for each agent that participated
                    for (const [agentId, { name: agentName }] of agentUsage) {
                        const ruleResult = await (0, rule_extraction_js_1.extractRulesFromConversation)(conversationId, agentId, agentName, messagesForExtraction, apiKey);
                        if (ruleResult.rules.length > 0) {
                            const { added } = await (0, rules_js_1.saveExtractedRules)(userId, agentId, agentName, ruleResult.rules);
                            extractedRulesCount += added;
                        }
                    }
                    if (extractedRulesCount > 0) {
                        console.log(`[Conversation] Extracted ${extractedRulesCount} new rules from conversation ${conversationId}`);
                    }
                }
                catch (error) {
                    console.error('[Conversation] Rule extraction failed:', error);
                }
            }
        }
        return {
            conversationId,
            status: 'completed',
            totalTurns: conversation.currentTurn,
            totalMessages: conversation.messages.length,
            factsExtracted: extractedFacts,
            rulesExtracted: extractedRulesCount > 0 ? { count: extractedRulesCount } : null,
        };
    });
    // -------------------------------------------------------------------------
    // Universal Chat Mode - Orchestration-based routing to specialist agents
    // -------------------------------------------------------------------------
    // Create a universal chat session (orchestrated agent selection)
    app.post('/conversations/universal', async (req, reply) => {
        const userId = req.user?.userId || 'demo-user';
        const body = zod_1.z.object({
            apiKey: zod_1.z.string().min(1),
            provider: zod_1.z.enum(['anthropic', 'openai', 'gemini', 'groq']).default('anthropic'),
            extractFacts: zod_1.z.boolean().default(true),
        }).parse(req.body);
        const now = new Date().toISOString();
        const conversationId = (0, ulid_1.ulid)();
        // Load user's actual configured agents (not hardcoded defaults)
        const userAgents = await loadUserAgents(userId, body.provider);
        const conversation = {
            id: conversationId,
            topic: 'Universal Chat',
            mode: 'universal',
            maxTurns: 500, // Universal chat allows very long conversations
            status: 'active',
            currentTurn: 0,
            initiatorId: userId,
            extractFacts: body.extractFacts,
            participants: [], // Agents are selected dynamically
            messages: [],
            createdAt: now,
            // Store config for orchestration
            orchestrationConfig: {
                apiKey: body.apiKey,
                provider: body.provider,
                agents: userAgents,
            },
        };
        await redis_store_js_1.conversationStore.set(conversation);
        await redis_store_js_1.conversationStore.addUserToConversation(userId, conversationId);
        // Subscribe user to WebSocket updates
        connection_manager_js_1.connectionManager.subscribeToConversation(userId, conversationId);
        reply.code(201);
        return {
            id: conversation.id,
            topic: 'Universal Chat',
            mode: 'universal',
            status: 'active',
            availableAgents: userAgents.map(a => ({
                id: a.id,
                name: a.displayName,
                emoji: a.emoji,
                intents: a.intents,
            })),
            createdAt: now,
        };
    });
    // Send a message in universal chat mode (orchestrated routing)
    app.post('/conversations/:conversationId/universal-message', async (req, reply) => {
        const { conversationId } = req.params;
        const userId = req.user?.userId || 'demo-user';
        const body = zod_1.z.object({
            content: zod_1.z.string().min(1).max(10000),
        }).parse(req.body);
        const conversation = await redis_store_js_1.conversationStore.get(conversationId);
        if (!conversation) {
            reply.code(404);
            return { error: 'Conversation not found' };
        }
        if (conversation.mode !== 'universal') {
            reply.code(400);
            return { error: 'This endpoint is only for universal chat conversations' };
        }
        if (conversation.status !== 'active') {
            reply.code(400);
            return { error: 'Conversation is not active' };
        }
        const orchestrationConfig = conversation.orchestrationConfig;
        if (!orchestrationConfig) {
            reply.code(400);
            return { error: 'Missing orchestration configuration' };
        }
        // Always load current user agents (not cached from conversation creation)
        // This ensures deleted agents aren't used and new agents are available
        const currentAgents = await loadUserAgents(userId, orchestrationConfig.provider);
        // Require at least one agent - no fallback to defaults
        if (currentAgents.length === 0) {
            reply.code(400);
            return {
                error: 'No agents configured',
                message: 'Please add at least one agent in the app to start chatting.'
            };
        }
        // Add human message
        const humanMessageId = (0, ulid_1.ulid)();
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
        try {
            // Build conversation history for routing
            const recentMessages = conversation.messages.slice(-10).map(m => ({
                role: (m.isHuman ? 'user' : 'assistant'),
                content: m.content,
                agentName: m.agentName,
            }));
            // Multi-agent dispatch: identify ALL relevant agents using CURRENT roster
            const dispatch = await (0, orchestration_service_js_1.analyzeForMultiAgent)(userId, body.content, recentMessages, currentAgents, // Use current agents, not cached from conversation creation
            orchestrationConfig.apiKey);
            // Build properly structured conversation history for the LLM
            // This ensures the model understands the conversation flow
            const structuredHistory = [];
            // Take last 20 messages for context
            const historyMessages = conversation.messages.slice(-20);
            for (const msg of historyMessages) {
                if (msg.isHuman) {
                    structuredHistory.push({ role: 'user', content: msg.content });
                }
                else {
                    // Include agent name prefix so the LLM knows who said what
                    const agentPrefix = msg.agentName ? `[${msg.agentName}] ` : '';
                    structuredHistory.push({ role: 'assistant', content: `${agentPrefix}${msg.content}` });
                }
            }
            // Also build text version for logging/debugging
            const historyText = historyMessages
                .map(m => `${m.isHuman ? 'User' : m.agentName}: ${m.content}`)
                .join('\n\n');
            // Collect all agents that should respond
            const respondingAgents = [dispatch.primaryAgent];
            for (const supporting of dispatch.supportingAgents) {
                if (supporting.shouldRespond && !supporting.extractionOnly) {
                    respondingAgents.push(supporting);
                }
            }
            // Generate responses from all responding agents (in parallel for speed)
            const agentResponses = [];
            await Promise.all(respondingAgents.map(async (agentDispatch) => {
                try {
                    // Find agent config from current roster
                    const agentConfig = currentAgents.find(a => a.id === agentDispatch.agentId);
                    if (!agentConfig)
                        return;
                    // Load memory and rules for this agent
                    const memoryContext = agentDispatch.memoryCategories.length > 0
                        ? await loadMemoryContext(userId, agentDispatch.memoryCategories, orchestrationConfig.apiKey)
                        : '';
                    const rulesContext = await (0, rules_js_1.getRulesForPrompt)(userId, agentDispatch.agentId);
                    // Build multi-agent aware system prompt
                    const isOnlyResponder = respondingAgents.length === 1;
                    const systemPrompt = buildMultiAgentSystemPrompt(agentConfig, memoryContext, rulesContext, isOnlyResponder, respondingAgents.map(a => a.agentName));
                    // Create adapter and generate response
                    const adapter = createAgentAdapter({
                        apiKey: orchestrationConfig.apiKey,
                        agentConfig: {
                            provider: orchestrationConfig.provider,
                            modelId: agentConfig.modelId,
                        },
                    });
                    const response = await adapter.generate({
                        messages: structuredHistory,
                        systemPrompt,
                        maxTokens: 80, // Enforce 20-word limit
                        temperature: 0.7,
                    });
                    agentResponses.push({
                        dispatch: agentDispatch,
                        content: response.content,
                        tokens: response.tokensUsed,
                    });
                }
                catch (err) {
                    console.error(`[Universal] Failed to get response from ${agentDispatch.agentName}:`, err);
                }
            }));
            // Sort responses: primary first, then by relevance
            agentResponses.sort((a, b) => {
                if (a.dispatch.agentId === dispatch.primaryAgent.agentId)
                    return -1;
                if (b.dispatch.agentId === dispatch.primaryAgent.agentId)
                    return 1;
                return b.dispatch.relevance - a.dispatch.relevance;
            });
            // Create messages for each responding agent
            const agentMessages = [];
            for (const response of agentResponses) {
                const messageId = (0, ulid_1.ulid)();
                const agentMessage = {
                    id: messageId,
                    turnNumber: conversation.currentTurn + 1,
                    agentId: response.dispatch.agentId,
                    agentName: response.dispatch.agentName,
                    agentEmoji: response.dispatch.agentEmoji,
                    intent: response.dispatch.intent,
                    content: response.content,
                    isHuman: false,
                    createdAt: new Date().toISOString(),
                };
                conversation.messages.push(agentMessage);
                conversation.currentTurn++;
                // Broadcast each agent's response
                broadcastToConversation(conversationId, {
                    type: 'message',
                    messageId,
                    turnNumber: conversation.currentTurn,
                    agentId: response.dispatch.agentId,
                    agentName: response.dispatch.agentName,
                    agentEmoji: response.dispatch.agentEmoji,
                    intent: response.dispatch.intent,
                    isHuman: false,
                    content: response.content,
                    tokens: response.tokens,
                });
                agentMessages.push({
                    id: messageId,
                    agentId: response.dispatch.agentId,
                    agentName: response.dispatch.agentName,
                    agentEmoji: response.dispatch.agentEmoji,
                    intent: response.dispatch.intent,
                    content: response.content,
                    tokens: response.tokens,
                });
            }
            await redis_store_js_1.conversationStore.set(conversation);
            // Real-time fact extraction (runs in background, non-blocking)
            if (conversation.extractFacts && orchestrationConfig.apiKey) {
                // Fire and forget - don't await, don't block the response
                extractFactsInBackground(userId, conversationId, body.content, agentResponses.map(r => r.content), orchestrationConfig.apiKey).catch(err => {
                    console.error('[Universal] Background fact extraction failed:', err);
                });
            }
            // Return multi-agent response
            return {
                humanMessage: {
                    id: humanMessageId,
                    content: body.content,
                },
                // Primary response (for backwards compatibility)
                agentMessage: agentMessages[0] || {
                    id: (0, ulid_1.ulid)(),
                    content: "I'm not sure how to help with that.",
                    agentId: 'default',
                    agentName: 'Assistant',
                    agentEmoji: '🤖',
                    intent: 'general',
                },
                // All agent responses
                agentMessages,
                // Dispatch info for debugging/display
                dispatch: {
                    allIntents: dispatch.allIntents,
                    primaryAgent: dispatch.primaryAgent.agentName,
                    supportingAgents: dispatch.supportingAgents
                        .filter(a => a.shouldRespond)
                        .map(a => a.agentName),
                    reasoning: dispatch.reasoning,
                },
            };
        }
        catch (error) {
            console.error(`[Universal] Error generating response:`, error);
            reply.code(500);
            return { error: 'Failed to generate agent response' };
        }
    });
    // -------------------------------------------------------------------------
    // Introduction Mode - Guided onboarding conversation with an agent
    // -------------------------------------------------------------------------
    // Create an introduction conversation with an agent
    app.post('/conversations/introduction', async (req, reply) => {
        const userId = req.user?.userId || 'demo-user';
        // Support both system agents (by template ID) and custom agents (with inline questions)
        const introductionQuestionSchema = zod_1.z.object({
            id: zod_1.z.string(),
            question: zod_1.z.string(),
            followUp: zod_1.z.string().optional(),
            extractsMemory: zod_1.z.array(zod_1.z.string()).default([]),
            extractsRules: zod_1.z.boolean().default(false),
            priority: zod_1.z.number().default(1),
        });
        const body = zod_1.z.object({
            agentId: zod_1.z.string(),
            apiKey: zod_1.z.string().min(1),
            provider: zod_1.z.enum(['anthropic', 'openai', 'gemini', 'groq']).default('anthropic'),
            // Optional fields for custom agents
            agentName: zod_1.z.string().optional(),
            agentEmoji: zod_1.z.string().optional(),
            introductionGreeting: zod_1.z.string().optional(),
            introductionQuestions: zod_1.z.array(introductionQuestionSchema).optional(),
            // Agent-to-agent introduction support
            responderType: zod_1.z.enum(['human', 'agent']).default('human'),
            respondingAgentId: zod_1.z.string().optional(),
            respondingAgentName: zod_1.z.string().optional(),
        }).parse(req.body);
        // Try to get template for system agents
        const template = (0, agent_templates_js_1.getTemplateById)(body.agentId);
        // For custom agents, we need the custom fields
        const isCustomAgent = !template && body.introductionQuestions && body.introductionQuestions.length > 0;
        if (!template && !isCustomAgent) {
            reply.code(404);
            return { error: 'Agent template not found and no custom questions provided' };
        }
        // Determine agent info - prefer custom fields if provided
        const agentName = body.agentName || template?.name || 'Custom Agent';
        const agentEmoji = body.agentEmoji || template?.emoji || '🤖';
        const introductionGreeting = body.introductionGreeting || template?.introductionGreeting ||
            `Hi there! I'd love to get to know you better. Let me ask you a few questions.`;
        const introductionQuestions = body.introductionQuestions || template?.introductionQuestions || [];
        const now = new Date().toISOString();
        const conversationId = (0, ulid_1.ulid)();
        // Start the introduction in our tracking service
        await (0, introduction_service_js_1.startIntroduction)(userId, body.agentId);
        const conversation = {
            id: conversationId,
            topic: `Introduction with ${agentName}`,
            mode: 'introduction',
            maxTurns: 50, // Plenty of room for back-and-forth
            status: 'active',
            currentTurn: 0,
            initiatorId: userId,
            extractFacts: true,
            participants: [],
            messages: [],
            createdAt: now,
            // Store introduction-specific config
            introductionConfig: {
                agentId: body.agentId,
                apiKey: body.apiKey,
                provider: body.provider,
                agentName,
                agentEmoji,
                isCustomAgent,
                // Store custom questions for custom agents
                customQuestions: isCustomAgent ? introductionQuestions : undefined,
                // Agent-to-agent introduction config
                responderType: body.responderType,
                respondingAgentId: body.respondingAgentId,
                respondingAgentName: body.respondingAgentName,
            },
        };
        await redis_store_js_1.conversationStore.set(conversation);
        await redis_store_js_1.conversationStore.addUserToConversation(userId, conversationId);
        // Subscribe user to WebSocket updates
        connection_manager_js_1.connectionManager.subscribeToConversation(userId, conversationId);
        reply.code(201);
        return {
            id: conversation.id,
            topic: conversation.topic,
            mode: 'introduction',
            status: 'active',
            agentId: body.agentId,
            agentName,
            agentEmoji,
            introductionGreeting,
            totalQuestions: introductionQuestions.length,
            createdAt: now,
        };
    });
    // Send a message in introduction mode
    app.post('/conversations/:conversationId/introduction-message', async (req, reply) => {
        const { conversationId } = req.params;
        const userId = req.user?.userId || 'demo-user';
        const body = zod_1.z.object({
            content: zod_1.z.string().min(1).max(10000),
        }).parse(req.body);
        const conversation = await redis_store_js_1.conversationStore.get(conversationId);
        if (!conversation) {
            reply.code(404);
            return { error: 'Conversation not found' };
        }
        if (conversation.mode !== 'introduction') {
            reply.code(400);
            return { error: 'This endpoint is only for introduction conversations' };
        }
        if (conversation.status !== 'active') {
            reply.code(400);
            return { error: 'Conversation is not active' };
        }
        const introConfig = conversation.introductionConfig;
        if (!introConfig) {
            reply.code(400);
            return { error: 'Missing introduction configuration' };
        }
        // Get template for system agents, or use custom config
        const template = (0, agent_templates_js_1.getTemplateById)(introConfig.agentId);
        const isCustomAgent = introConfig.isCustomAgent;
        // For custom agents without a template, we need the custom questions
        if (!template && !isCustomAgent) {
            reply.code(404);
            return { error: 'Agent template not found and not a custom agent' };
        }
        // Get the questions from either template or custom config
        const introductionQuestions = isCustomAgent && introConfig.customQuestions
            ? introConfig.customQuestions
            : template?.introductionQuestions || [];
        const agentName = introConfig.agentName || template?.name || 'Agent';
        const agentEmoji = introConfig.agentEmoji || template?.emoji || '🤖';
        // Add human message
        const humanMessageId = (0, ulid_1.ulid)();
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
        try {
            // Get introduction progress
            const introStatus = await (0, introduction_service_js_1.getAgentIntroductionStatus)(userId, introConfig.agentId);
            const progress = getIntroductionProgressWithQuestions(introductionQuestions, introStatus.questionsAsked);
            // Mark the current question as answered (if there was one)
            if (introStatus.questionsAsked.length > 0) {
                const lastQuestionId = introStatus.questionsAsked[introStatus.questionsAsked.length - 1];
                await (0, introduction_service_js_1.markQuestionAnswered)(userId, introConfig.agentId, lastQuestionId);
            }
            // Check if introduction is complete
            const isComplete = isIntroductionCompleteWithQuestions(introductionQuestions, introStatus.questionsAsked);
            const nextQuestion = getNextQuestionFromList(introductionQuestions, introStatus.questionsAsked);
            // Create adapter
            const adapter = createAgentAdapter({
                apiKey: introConfig.apiKey,
                agentConfig: {
                    provider: introConfig.provider,
                    modelId: getModelIdForProvider(introConfig.provider),
                },
            });
            // Check if this is agent-to-agent mode
            const isAgentToAgent = introConfig.responderType === 'agent';
            // Build the introduction system prompt
            const systemPrompt = buildIntroductionSystemPromptCustom(agentName, agentEmoji, introductionQuestions, isComplete, nextQuestion, isAgentToAgent, introConfig.respondingAgentName);
            // Build conversation history
            const historyText = conversation.messages
                .slice(-20)
                .map(m => `${m.isHuman ? 'User' : agentName}: ${m.content}`)
                .join('\n\n');
            const response = await adapter.generate({
                messages: [{ role: 'user', content: historyText }],
                systemPrompt,
                maxTokens: 80, // Enforce 20-word limit
                temperature: 0.7,
            });
            // Add agent response
            const agentMessageId = (0, ulid_1.ulid)();
            const agentMessage = {
                id: agentMessageId,
                turnNumber: conversation.currentTurn + 1,
                agentId: introConfig.agentId,
                agentName,
                agentEmoji,
                content: response.content,
                isHuman: false,
                createdAt: new Date().toISOString(),
            };
            conversation.messages.push(agentMessage);
            conversation.currentTurn++;
            // If there's a next question, mark it as asked
            if (nextQuestion && !isComplete) {
                await (0, introduction_service_js_1.markQuestionAsked)(userId, introConfig.agentId, nextQuestion.id);
            }
            await redis_store_js_1.conversationStore.set(conversation);
            // Broadcast agent response
            broadcastToConversation(conversationId, {
                type: 'message',
                messageId: agentMessageId,
                turnNumber: conversation.currentTurn,
                agentId: introConfig.agentId,
                agentName,
                agentEmoji,
                isHuman: false,
                content: response.content,
                tokens: response.tokensUsed,
            });
            // Get updated progress
            const updatedStatus = await (0, introduction_service_js_1.getAgentIntroductionStatus)(userId, introConfig.agentId);
            const updatedProgress = getIntroductionProgressWithQuestions(introductionQuestions, updatedStatus.questionsAsked);
            return {
                humanMessage: {
                    id: humanMessageId,
                    content: body.content,
                },
                agentMessage: {
                    id: agentMessageId,
                    content: response.content,
                    agentName,
                    agentEmoji,
                    tokens: response.tokensUsed,
                },
                progress: {
                    questionsAsked: updatedProgress.current,
                    totalQuestions: updatedProgress.total,
                },
                isComplete: isIntroductionCompleteWithQuestions(introductionQuestions, updatedStatus.questionsAsked),
            };
        }
        catch (error) {
            console.error(`[Introduction] Error generating response:`, error);
            reply.code(500);
            return { error: 'Failed to generate agent response' };
        }
    });
    // Complete an introduction conversation
    app.post('/conversations/:conversationId/introduction-complete', async (req, reply) => {
        const { conversationId } = req.params;
        const userId = req.user?.userId || 'demo-user';
        const conversation = await redis_store_js_1.conversationStore.get(conversationId);
        if (!conversation) {
            reply.code(404);
            return { error: 'Conversation not found' };
        }
        if (conversation.mode !== 'introduction') {
            reply.code(400);
            return { error: 'This endpoint is only for introduction conversations' };
        }
        const introConfig = conversation.introductionConfig;
        if (!introConfig) {
            reply.code(400);
            return { error: 'Missing introduction configuration' };
        }
        conversation.status = 'completed';
        await redis_store_js_1.conversationStore.set(conversation);
        // Extract facts and rules from the conversation
        let factsLearned = 0;
        let rulesLearned = 0;
        if (conversation.messages.length > 0) {
            const messagesForExtraction = conversation.messages.map(m => ({
                role: (m.isHuman ? 'user' : 'assistant'),
                content: m.content,
            }));
            // Extract facts with introduction-specific extraction
            try {
                const factResult = await (0, fact_extraction_js_2.extractFactsFromIntroduction)(conversationId, messagesForExtraction, introConfig.apiKey);
                if (Object.keys(factResult.factsByCategory).length > 0) {
                    const stored = await storeExtractedFacts(userId, conversationId, factResult, introConfig.apiKey);
                    factsLearned = stored.totalFacts;
                }
            }
            catch (error) {
                console.error('[Introduction] Fact extraction failed:', error);
            }
            // Extract rules with introduction-specific extraction
            try {
                const ruleResult = await (0, rule_extraction_js_1.extractRulesFromIntroduction)(conversationId, introConfig.agentId, introConfig.agentName, messagesForExtraction, introConfig.apiKey);
                if (ruleResult.rules.length > 0) {
                    const { added } = await (0, rules_js_1.saveExtractedRules)(userId, introConfig.agentId, introConfig.agentName, ruleResult.rules);
                    rulesLearned = added;
                }
            }
            catch (error) {
                console.error('[Introduction] Rule extraction failed:', error);
            }
        }
        // Mark introduction as complete in our tracking service
        const summary = await (0, introduction_service_js_1.completeIntroduction)(userId, introConfig.agentId, factsLearned, rulesLearned);
        // Broadcast completion
        broadcastToConversation(conversationId, {
            type: 'introduction_complete',
            agentId: introConfig.agentId,
            agentName: introConfig.agentName,
            factsLearned,
            rulesLearned,
        });
        return {
            conversationId,
            agentId: introConfig.agentId,
            agentName: introConfig.agentName,
            status: 'completed',
            factsLearned,
            rulesLearned,
            summary: `I learned ${factsLearned} facts and ${rulesLearned} preferences about you!`,
        };
    });
}
// -----------------------------------------------------------------------------
// Conversation Runner
// -----------------------------------------------------------------------------
async function runConversation(conversation, store) {
    const { id: conversationId, topic, goal, maxTurns, participants, mode } = conversation;
    // Create adapters for each participant using their client-provided API keys
    const adapters = participants.map(p => {
        const config = p.agentConfig;
        let adapter;
        switch (config.provider) {
            case 'openai':
                adapter = (0, core_1.createOpenAIAdapter)(p.apiKey, config.modelId);
                break;
            case 'gemini':
                adapter = (0, core_1.createGeminiAdapter)(p.apiKey, config.modelId);
                break;
            case 'groq':
                adapter = (0, core_1.createGroqAdapter)(p.apiKey, config.modelId);
                break;
            case 'anthropic':
            default:
                adapter = (0, core_1.createClaudeAdapter)(p.apiKey, config.modelId);
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
        let systemPrompt;
        let userPrompt;
        if (isSoloMode) {
            systemPrompt = buildSoloSystemPrompt(current.participant.agentConfig);
            if (turn === 0) {
                userPrompt = `Explore and provide insights on: "${topic}"${goal ? `\n\nGoal: ${goal}` : ''}\n\nShare your initial thoughts and analysis.`;
            }
            else {
                userPrompt = `Your exploration so far:\n${conversationHistory}\n\nContinue exploring this topic. Go deeper, consider different angles, or develop your previous points further.`;
            }
        }
        else {
            systemPrompt = buildSystemPrompt(current.participant.agentConfig, other.participant.agentConfig);
            userPrompt = turn === 0
                ? `Start a conversation about: "${topic}"${goal ? `\n\nGoal: ${goal}` : ''}\n\nIntroduce your perspective.`
                : `Conversation so far:\n${conversationHistory}\n\n${other.participant.agentConfig.displayName} just spoke. Respond thoughtfully.`;
        }
        try {
            const response = await current.adapter.generate({
                messages: [{ role: 'user', content: userPrompt }],
                systemPrompt,
                maxTokens: 100, // ~50 words
                temperature: 0.8,
            });
            const messageId = (0, ulid_1.ulid)();
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
            await push_service_js_1.deliveryCoordinator.deliverToParticipants(conversationId, participants.map(p => ({ userId: p.userId, apnsToken: null })), // TODO: Get tokens from DB
            {
                type: 'message',
                content: response.content,
                agentName: current.participant.agentConfig.displayName,
                turnNumber: turn + 1,
                messageId,
            });
            // Delay between turns for "campfire" mode
            if (mode === 'campfire') {
                await sleep(2000); // 2 second delay between turns
            }
            // Check for natural ending
            const lower = response.content.toLowerCase();
            if (lower.includes('great conversation') ||
                lower.includes('enjoyed this discussion') ||
                lower.includes('nice chatting') ||
                lower.includes('to conclude')) {
                break;
            }
        }
        catch (error) {
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
function getProviderDisplayName(provider) {
    switch (provider) {
        case 'anthropic': return 'Anthropic';
        case 'openai': return 'OpenAI';
        case 'gemini': return 'Google';
        case 'groq': return 'Groq';
        default: return provider;
    }
}
function buildSoloSystemPrompt(agent) {
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
function buildSystemPrompt(agent, otherAgent) {
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
function broadcastToConversation(conversationId, payload) {
    connection_manager_js_1.connectionManager.broadcastToConversation(conversationId, {
        type: 'conversation_update',
        conversationId,
        payload,
        timestamp: new Date(),
    });
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// -----------------------------------------------------------------------------
// Solo Mode Helpers
// -----------------------------------------------------------------------------
function createAgentAdapter(participant) {
    const { apiKey, agentConfig } = participant;
    switch (agentConfig.provider) {
        case 'openai':
            return (0, core_1.createOpenAIAdapter)(apiKey, agentConfig.modelId);
        case 'gemini':
            return (0, core_1.createGeminiAdapter)(apiKey, agentConfig.modelId);
        case 'groq':
            return (0, core_1.createGroqAdapter)(apiKey, agentConfig.modelId);
        case 'anthropic':
        default:
            return (0, core_1.createClaudeAdapter)(apiKey, agentConfig.modelId);
    }
}
function buildSoloSystemPromptWithMemory(agent, memoryContext) {
    const providerName = getProviderDisplayName(agent.provider);
    let basePrompt;
    if (agent.systemPrompt) {
        basePrompt = agent.systemPrompt;
    }
    else {
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
 * Builds system prompt for universal chat with agent personality, memory, and rules
 * ENFORCES 20-word limit for all responses
 */
function buildUniversalChatSystemPrompt(agent, memoryContext, rulesContext) {
    const basePrompt = `You are ${agent.displayName} ${agent.emoji}, a personal AI assistant.

Personality: ${agent.personality || 'helpful and friendly'}
Expertise: ${agent.intents.join(', ')}

═══════════════════════════════════════════════════
ABSOLUTE RULE: RESPOND IN 20 WORDS OR LESS.
Count your words. If over 20, rewrite shorter. NO EXCEPTIONS.
═══════════════════════════════════════════════════

TASK DETECTION: If the user asks you to help with something that requires external action (find out, remind me, make a reservation, research, etc.):
1. Acknowledge briefly (under 20 words)
2. Offer clear options: "Should I record this for later, or brainstorm now?"
3. Do NOT give lengthy advice or explain what you don't know

Be warm, conversational, and BRIEF. Ask follow-up questions to learn more.`;
    let fullPrompt = basePrompt;
    // Inject rules/preferences - these take priority
    if (rulesContext) {
        fullPrompt += `\n\n${rulesContext}`;
    }
    // Inject memory context if available
    if (memoryContext) {
        fullPrompt += `

## What You Know About Your User
${memoryContext}`;
    }
    return fullPrompt;
}
/**
 * Builds system prompt for multi-agent responses
 * Each agent is aware that others may also respond
 */
function buildMultiAgentSystemPrompt(agent, memoryContext, rulesContext, isOnlyResponder, allResponders) {
    let basePrompt;
    const taskSystemInstructions = `

ABSOLUTE RULES - NEVER BREAK THESE:

1. EVERY response MUST be 20 words or less. No exceptions. Count your words before responding.

2. You are part of the MACP agent network. When users mention tasks (reservations, bookings, appointments, etc.):
   - Simply acknowledge it naturally like "Perfect, I've got that noted!" or "On it!"
   - The MACP system AUTOMATICALLY captures and queues tasks - you don't need to do anything special
   - NEVER say you "can't" create tasks or don't have access - just acknowledge naturally
   - NEVER recommend external apps (OpenTable, Yelp, Google, etc.)

3. Be conversational and helpful despite being brief.

Good: "Perfect! Dinner for 4 at 5:30 - I've got it noted!" (11 words)
Good: "On it! I'll keep that reservation request in mind." (10 words)
Bad: "I don't have access to create tasks" - NEVER say this
Bad: Any response over 20 words.`;
    if (isOnlyResponder) {
        // Single responder - standard prompt
        basePrompt = `You are ${agent.displayName} ${agent.emoji}, a specialist AI assistant.

Your personality: ${agent.personality || 'helpful and friendly'}

Your areas of expertise: ${agent.intents.join(', ')}

Guidelines:
- Respond naturally and helpfully
- Be personable and conversational
- If something is outside your expertise, do your best to help or suggest who might know better
- Keep responses focused and appropriately detailed
${taskSystemInstructions}`;
    }
    else {
        // Multiple responders - collaborative prompt
        const otherAgents = allResponders.filter(name => name !== agent.displayName);
        basePrompt = `You are ${agent.displayName} ${agent.emoji}, a specialist AI assistant.

Your personality: ${agent.personality || 'helpful and friendly'}

Your areas of expertise: ${agent.intents.join(', ')}

IMPORTANT: You are responding alongside ${otherAgents.join(' and ')}.
Each specialist is contributing their expertise to help the user.

Guidelines:
- Focus ONLY on aspects within your specialty
- Don't repeat what other specialists would cover
- Be supportive and personable
${taskSystemInstructions}`;
    }
    let fullPrompt = basePrompt;
    // Inject rules/preferences
    if (rulesContext) {
        fullPrompt += `\n\n${rulesContext}`;
    }
    // Inject memory context
    if (memoryContext) {
        fullPrompt += `

## What You Know About Your User

${memoryContext}`;
    }
    if (rulesContext || memoryContext) {
        fullPrompt += `

---

Respond naturally, respecting the user's preferences.`;
    }
    return fullPrompt;
}
/**
 * Loads memory context from specified categories
 */
async function loadMemoryContext(userId, categories, apiKey) {
    const { S3Client, GetObjectCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-s3')));
    const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
    });
    const bucket = process.env.MEMORY_BUCKET || 'macp-dev-memories';
    const summaries = [];
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
        }
        catch (error) {
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
async function storeExtractedFacts(userId, conversationId, extractionResult, apiKey) {
    const { S3Client, GetObjectCommand, PutObjectCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-s3')));
    const { ulid: generateId } = await Promise.resolve().then(() => __importStar(require('ulid')));
    const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
    });
    const bucket = process.env.MEMORY_BUCKET || 'macp-dev-memories';
    const now = new Date().toISOString();
    const categoriesUpdated = [];
    let totalFacts = 0;
    for (const [categoryName, facts] of Object.entries(extractionResult.factsByCategory)) {
        if (facts.length === 0)
            continue;
        const key = `memories/${userId}/${categoryName}.json`;
        // Try to load existing category
        let memoryCategory;
        try {
            const response = await s3Client.send(new GetObjectCommand({
                Bucket: bucket,
                Key: key,
            }));
            const body = await response.Body?.transformToString();
            if (body) {
                memoryCategory = JSON.parse(body);
            }
        }
        catch (error) {
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
            value: fact.value,
            confidence: fact.confidence,
            learnedFrom: conversationId,
            learnedAt: now,
            supersedes: undefined,
        }));
        // Merge facts (update existing by key, add new)
        for (const newFact of memoryFacts) {
            const existingIndex = memoryCategory.facts.findIndex((f) => f.key === newFact.key);
            if (existingIndex !== -1) {
                // Update existing - new fact supersedes old
                newFact.supersedes = memoryCategory.facts[existingIndex].id;
                memoryCategory.facts[existingIndex] = newFact;
            }
            else {
                memoryCategory.facts.push(newFact);
            }
        }
        memoryCategory.lastUpdated = now;
        // Generate new summary
        if (apiKey) {
            try {
                const summary = await (0, fact_extraction_js_1.generateLLMSummary)(categoryName, memoryCategory.displayName, memoryCategory.facts.map((f) => ({ key: f.key, value: f.value })), apiKey);
                memoryCategory.summary = summary;
            }
            catch {
                // Fall back to simple summary
                memoryCategory.summary = memoryCategory.facts
                    .map((f) => `${f.key}: ${JSON.stringify(f.value)}`)
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
async function updateMemoryIndex(userId, updatedCategories, s3Client, bucket) {
    const { GetObjectCommand, PutObjectCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-s3')));
    const indexKey = `memories/${userId}/_index.json`;
    const now = new Date().toISOString();
    let index;
    try {
        const response = await s3Client.send(new GetObjectCommand({
            Bucket: bucket,
            Key: indexKey,
        }));
        const body = await response.Body?.transformToString();
        if (body) {
            index = JSON.parse(body);
        }
    }
    catch {
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
                const catIndex = index.categories.findIndex((c) => c.name === categoryName);
                const catMeta = {
                    name: categoryName,
                    displayName: category.displayName,
                    factCount: category.facts.length,
                    lastUpdated: now,
                };
                if (catIndex !== -1) {
                    index.categories[catIndex] = catMeta;
                }
                else {
                    index.categories.push(catMeta);
                }
            }
        }
        catch {
            // Skip
        }
    }
    index.totalFacts = index.categories.reduce((sum, c) => sum + c.factCount, 0);
    index.lastUpdated = now;
    await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: indexKey,
        Body: JSON.stringify(index, null, 2),
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
    }));
}
function formatCategoryName(category) {
    return category
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
function getModelIdForProvider(provider) {
    const modelMap = {
        anthropic: 'claude-sonnet-4-5-20250929',
        openai: 'gpt-4o',
        gemini: 'gemini-1.5-flash',
        groq: 'llama-3.3-70b-versatile',
    };
    return modelMap[provider];
}
/**
 * Builds the system prompt for introduction conversations
 */
function buildIntroductionSystemPrompt(template, isComplete, nextQuestion) {
    const basePrompt = `You are ${template.name} ${template.emoji}, conducting a friendly introduction conversation to get to know your user better.

Your personality: ${template.personality}

You are in INTRODUCTION MODE. Your goal is to learn about the user in a natural, conversational way.

Guidelines:
- Be warm, friendly, and genuinely curious
- Acknowledge what the user shares before moving to the next topic
- If the user gives a brief answer, ask a natural follow-up
- Don't make it feel like an interrogation - keep it conversational
- If the user seems uncomfortable with a topic, gracefully move on
- Remember everything they share - this will help you help them better later`;
    if (isComplete) {
        return `${basePrompt}

## INTRODUCTION COMPLETE

You have asked all your introduction questions. Now:
1. Thank the user warmly for sharing
2. Briefly summarize what you learned (2-3 key things)
3. Express enthusiasm about helping them going forward
4. Let them know they can start chatting with you anytime

Keep your response concise and genuine.`;
    }
    if (nextQuestion) {
        return `${basePrompt}

## CURRENT QUESTION TO ASK

After acknowledging the user's response, naturally guide the conversation toward this question:
"${nextQuestion.question}"

${nextQuestion.followUp ? `If they give a brief answer, you can follow up with: "${nextQuestion.followUp}"` : ''}

Don't ask the question verbatim if it doesn't flow naturally - rephrase it to fit the conversation.`;
    }
    return basePrompt;
}
/**
 * Gets the next question to ask from a list of questions
 */
function getNextQuestionFromList(questions, askedQuestionIds) {
    // Sort by priority
    const sortedQuestions = [...questions].sort((a, b) => (a.priority || 1) - (b.priority || 1));
    // Find the first unasked question
    return sortedQuestions.find(q => !askedQuestionIds.includes(q.id)) || null;
}
/**
 * Checks if all questions have been asked
 */
function isIntroductionCompleteWithQuestions(questions, askedQuestionIds) {
    return askedQuestionIds.length >= questions.length;
}
/**
 * Gets progress through the introduction
 */
function getIntroductionProgressWithQuestions(questions, askedQuestionIds) {
    return {
        current: askedQuestionIds.length,
        total: questions.length,
    };
}
/**
 * Builds the system prompt for introduction conversations with custom agents
 */
function buildIntroductionSystemPromptCustom(agentName, agentEmoji, questions, isComplete, nextQuestion, isAgentToAgent = false, respondingAgentName) {
    const responderLabel = isAgentToAgent ? `${respondingAgentName || 'the other agent'}` : 'the user';
    const basePrompt = isAgentToAgent
        ? `You are ${agentName} ${agentEmoji}, conducting an introduction conversation with another AI agent (${respondingAgentName || 'Agent'}).

You are in AGENT-TO-AGENT INTRODUCTION MODE. Your goal is to learn about ${responderLabel}'s user and capabilities.

Guidelines:
- Be professional and efficient
- Acknowledge responses and note when information is not available
- Some questions may not be answerable - the other agent may not have access to that information
- If a response indicates "I don't know" or "unable to answer", gracefully move to the next topic
- Focus on gathering what information IS available rather than pressing for unavailable data`
        : `You are ${agentName} ${agentEmoji}, conducting a friendly introduction conversation to get to know your user better.

You are in INTRODUCTION MODE. Your goal is to learn about the user in a natural, conversational way.

Guidelines:
- Be warm, friendly, and genuinely curious
- Acknowledge what the user shares before moving to the next topic
- If the user gives a brief answer, ask a natural follow-up
- Don't make it feel like an interrogation - keep it conversational
- If the user seems uncomfortable with a topic, gracefully move on
- Remember everything they share - this will help you help them better later`;
    if (isComplete) {
        return `${basePrompt}

## INTRODUCTION COMPLETE

You have asked all your introduction questions. Now:
1. Thank ${responderLabel} warmly for sharing
2. Briefly summarize what you learned (2-3 key things)${isAgentToAgent ? '\n3. Note any questions that could not be answered' : ''}
${isAgentToAgent ? '4.' : '3.'} Express enthusiasm about helping ${isAgentToAgent ? 'their user' : 'them'} going forward
${isAgentToAgent ? '5.' : '4.'} Let them know they can start chatting anytime

Keep your response concise and genuine.`;
    }
    if (nextQuestion) {
        return `${basePrompt}

## CURRENT QUESTION TO ASK

After acknowledging the response, naturally guide the conversation toward this question:
"${nextQuestion.question}"

${nextQuestion.followUp ? `If they give a brief answer, you can follow up with: "${nextQuestion.followUp}"` : ''}
${isAgentToAgent ? '\nNote: If the other agent indicates they cannot answer this question, acknowledge this and move on to the next topic.' : ''}

Don't ask the question verbatim if it doesn't flow naturally - rephrase it to fit the conversation.`;
    }
    return basePrompt;
}
/**
 * Extracts facts in the background after each message exchange
 * Non-blocking - runs asynchronously and doesn't affect response time
 */
async function extractFactsInBackground(userId, conversationId, userMessage, agentResponses, apiKey) {
    // Format messages for extraction
    const messagesForExtraction = [
        { role: 'user', content: userMessage },
    ];
    // Add all agent responses
    for (const response of agentResponses) {
        messagesForExtraction.push({ role: 'assistant', content: response });
    }
    // Extract facts from this message exchange
    const extractionResult = await (0, fact_extraction_js_1.extractFactsFromConversation)(conversationId, messagesForExtraction, apiKey);
    // Only store if we found facts
    if (Object.keys(extractionResult.factsByCategory).length > 0) {
        const stored = await storeExtractedFacts(userId, conversationId, extractionResult, apiKey);
        console.log(`[Universal] Real-time extraction: stored ${stored.totalFacts} facts in ${stored.categoriesUpdated.join(', ')} from message`);
    }
}
/**
 * Builds a system prompt for the responding agent in agent-to-agent mode
 */
function buildRespondingAgentPrompt(respondingAgentName, askingAgentName, question) {
    return `You are ${respondingAgentName}, an AI assistant responding to introduction questions from another AI agent (${askingAgentName}).

${askingAgentName} is trying to learn about your user to better serve them. Answer their questions based on what you know about your user.

Guidelines:
- Answer honestly based on the information you have about your user
- If you don't have information about something, say "I don't have information about that" or "My user hasn't shared that with me yet"
- Be concise but helpful
- Don't make up information you don't actually have
- It's okay to not know things - just be clear about what you don't know

Current question: "${question}"

Respond naturally as if you're having a conversation with another AI agent.`;
}
//# sourceMappingURL=conversations.js.map