"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPublicAgentRoutes = registerPublicAgentRoutes;
const zod_1 = require("zod");
const public_agent_service_js_1 = require("../services/public-agent-service.js");
// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------
const introductionQuestionSchema = zod_1.z.object({
    id: zod_1.z.string(),
    question: zod_1.z.string(),
    followUp: zod_1.z.string().optional(),
    extractsMemory: zod_1.z.array(zod_1.z.string()).default([]),
    extractsRules: zod_1.z.boolean().default(false),
});
const publishAgentSchema = zod_1.z.object({
    // Agent configuration
    agentId: zod_1.z.string(),
    name: zod_1.z.string(),
    emoji: zod_1.z.string(),
    description: zod_1.z.string(),
    personality: zod_1.z.string(),
    greeting: zod_1.z.string(),
    accentColor: zod_1.z.string(),
    // Publishing settings
    allowDirectChat: zod_1.z.boolean(),
    allowAgentToAgent: zod_1.z.boolean(),
    allowAccompaniedChat: zod_1.z.boolean(),
    introductionGreeting: zod_1.z.string().optional(),
    introductionQuestions: zod_1.z.array(introductionQuestionSchema).optional(),
});
const updatePublishSettingsSchema = zod_1.z.object({
    allowDirectChat: zod_1.z.boolean().optional(),
    allowAgentToAgent: zod_1.z.boolean().optional(),
    allowAccompaniedChat: zod_1.z.boolean().optional(),
    introductionGreeting: zod_1.z.string().optional(),
    introductionQuestions: zod_1.z.array(introductionQuestionSchema).optional(),
    isActive: zod_1.z.boolean().optional(),
});
const createSessionSchema = zod_1.z.object({
    mode: zod_1.z.enum(['direct', 'agent_to_agent', 'accompanied']),
    visitorId: zod_1.z.string(),
    visitorUserId: zod_1.z.string().optional(),
    visitorAgentId: zod_1.z.string().optional(),
    visitorAgentName: zod_1.z.string().optional(),
});
const sendMessageSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    content: zod_1.z.string().min(1).max(10000),
    role: zod_1.z.enum(['user', 'visitor_agent']).default('user'),
    apiKey: zod_1.z.string().min(1),
    provider: zod_1.z.enum(['anthropic', 'openai', 'gemini', 'groq']).default('anthropic'),
});
const completeSessionSchema = zod_1.z.object({
    sessionId: zod_1.z.string(),
    apiKey: zod_1.z.string().min(1),
    provider: zod_1.z.enum(['anthropic', 'openai', 'gemini', 'groq']).default('anthropic'),
});
// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
function registerPublicAgentRoutes(app) {
    // =========================================================================
    // PUBLIC ROUTES (No authentication required)
    // =========================================================================
    // -------------------------------------------------------------------------
    // Get published agent info by agentId
    // -------------------------------------------------------------------------
    app.get('/public/agent/:agentId', async (req, reply) => {
        const { agentId } = req.params;
        try {
            const agent = await (0, public_agent_service_js_1.getPublishedAgent)(agentId);
            if (!agent) {
                reply.code(404);
                return { error: 'Agent not found' };
            }
            if (!agent.isActive) {
                reply.code(404);
                return { error: 'This agent is not currently available' };
            }
            // Increment view count (don't await, fire and forget)
            (0, public_agent_service_js_1.incrementViewCount)(agentId).catch(err => {
                app.log.error({ err, agentId }, 'Failed to increment view count');
            });
            // Return public-safe agent info
            return {
                agentId: agent.agentId,
                ownerName: agent.ownerName,
                name: agent.name,
                emoji: agent.emoji,
                description: agent.description,
                greeting: agent.greeting,
                accentColor: agent.accentColor,
                introductionGreeting: agent.introductionGreeting,
                allowDirectChat: agent.allowDirectChat,
                allowAgentToAgent: agent.allowAgentToAgent,
                allowAccompaniedChat: agent.allowAccompaniedChat,
                viewCount: agent.viewCount,
                voiceId: agent.voiceId,
                voiceSpeed: agent.voiceSpeed,
            };
        }
        catch (error) {
            app.log.error({ err: error, agentId }, 'Failed to get published agent');
            reply.code(500);
            return { error: 'Failed to retrieve agent information' };
        }
    });
    // -------------------------------------------------------------------------
    // Create a session with a public agent
    // -------------------------------------------------------------------------
    app.post('/public/agent/:agentId/session', async (req, reply) => {
        const { agentId } = req.params;
        try {
            const body = createSessionSchema.parse(req.body);
            const session = await (0, public_agent_service_js_1.createPublicSession)(agentId, body);
            // Get agent info for the greeting
            const agent = await (0, public_agent_service_js_1.getPublishedAgent)(agentId);
            return {
                sessionId: session.sessionId,
                agentId: session.agentId,
                mode: session.mode,
                status: session.status,
                createdAt: session.createdAt,
                agent: agent ? {
                    name: agent.name,
                    emoji: agent.emoji,
                    greeting: agent.introductionGreeting || agent.greeting,
                } : null,
            };
        }
        catch (error) {
            if (error.message) {
                reply.code(400);
                return { error: error.message };
            }
            app.log.error({ err: error, agentId }, 'Failed to create session');
            reply.code(500);
            return { error: 'Failed to create session' };
        }
    });
    // -------------------------------------------------------------------------
    // Send a message in a public session
    // -------------------------------------------------------------------------
    app.post('/public/agent/:agentId/message', async (req, reply) => {
        const { agentId } = req.params;
        try {
            const body = sendMessageSchema.parse(req.body);
            // Verify the session belongs to this agent
            const session = await (0, public_agent_service_js_1.getPublicSession)(body.sessionId);
            if (!session || session.agentId !== agentId) {
                reply.code(404);
                return { error: 'Session not found' };
            }
            const { userMessage, agentMessage } = await (0, public_agent_service_js_1.sendPublicMessage)(body.sessionId, body.content, body.role, body.apiKey, body.provider);
            return {
                userMessage: {
                    id: userMessage.id,
                    content: userMessage.content,
                    role: userMessage.role,
                    timestamp: userMessage.timestamp,
                },
                agentMessage: {
                    id: agentMessage.id,
                    content: agentMessage.content,
                    role: agentMessage.role,
                    timestamp: agentMessage.timestamp,
                    tokensUsed: agentMessage.metadata?.tokensUsed,
                },
            };
        }
        catch (error) {
            if (error.message) {
                reply.code(400);
                return { error: error.message };
            }
            app.log.error({ err: error, agentId }, 'Failed to send message');
            reply.code(500);
            return { error: 'Failed to send message' };
        }
    });
    // -------------------------------------------------------------------------
    // Complete a public session
    // -------------------------------------------------------------------------
    app.post('/public/agent/:agentId/complete', async (req, reply) => {
        const { agentId } = req.params;
        try {
            const body = completeSessionSchema.parse(req.body);
            // Verify the session belongs to this agent
            const session = await (0, public_agent_service_js_1.getPublicSession)(body.sessionId);
            if (!session || session.agentId !== agentId) {
                reply.code(404);
                return { error: 'Session not found' };
            }
            const result = await (0, public_agent_service_js_1.completePublicSession)(body.sessionId, body.apiKey, body.provider);
            return {
                sessionId: result.session.sessionId,
                status: result.session.status,
                completedAt: result.session.completedAt,
                extractedData: result.extractedData,
                messageCount: result.session.messages.length,
            };
        }
        catch (error) {
            if (error.message) {
                reply.code(400);
                return { error: error.message };
            }
            app.log.error({ err: error, agentId }, 'Failed to complete session');
            reply.code(500);
            return { error: 'Failed to complete session' };
        }
    });
    // =========================================================================
    // AUTHENTICATED ROUTES (For agent owners)
    // =========================================================================
    // -------------------------------------------------------------------------
    // Publish an agent
    // -------------------------------------------------------------------------
    app.post('/api/agents/:agentId/publish', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { agentId } = req.params;
        try {
            const body = publishAgentSchema.parse(req.body);
            // Validate agent ID matches
            if (body.agentId !== agentId) {
                reply.code(400);
                return { error: 'Agent ID mismatch' };
            }
            // Validate the publish request
            const agentConfig = {
                agentId: body.agentId,
                name: body.name,
                emoji: body.emoji,
                description: body.description,
                personality: body.personality,
                greeting: body.greeting,
                accentColor: body.accentColor,
            };
            const validation = (0, public_agent_service_js_1.validatePublishRequest)(agentConfig, {
                allowDirectChat: body.allowDirectChat,
                allowAgentToAgent: body.allowAgentToAgent,
                allowAccompaniedChat: body.allowAccompaniedChat,
                introductionGreeting: body.introductionGreeting,
                introductionQuestions: body.introductionQuestions,
            });
            if (!validation.valid) {
                reply.code(400);
                return { error: validation.errors.join(', ') };
            }
            const publishedAgent = await (0, public_agent_service_js_1.publishAgent)(userId, req.user.name, agentConfig, {
                allowDirectChat: body.allowDirectChat,
                allowAgentToAgent: body.allowAgentToAgent,
                allowAccompaniedChat: body.allowAccompaniedChat,
                introductionGreeting: body.introductionGreeting,
                introductionQuestions: body.introductionQuestions,
            });
            app.log.info({ userId, agentId }, 'Agent published');
            return {
                success: true,
                agentId: publishedAgent.agentId,
                url: (0, public_agent_service_js_1.getPublicAgentUrl)(publishedAgent.agentId),
                agent: {
                    agentId: publishedAgent.agentId,
                    name: publishedAgent.name,
                    emoji: publishedAgent.emoji,
                    isActive: publishedAgent.isActive,
                    allowDirectChat: publishedAgent.allowDirectChat,
                    allowAgentToAgent: publishedAgent.allowAgentToAgent,
                    allowAccompaniedChat: publishedAgent.allowAccompaniedChat,
                    createdAt: publishedAgent.createdAt,
                },
            };
        }
        catch (error) {
            if (error.message) {
                reply.code(400);
                return { error: error.message };
            }
            app.log.error({ err: error, userId, agentId }, 'Failed to publish agent');
            reply.code(500);
            return { error: 'Failed to publish agent' };
        }
    });
    // -------------------------------------------------------------------------
    // Update published agent settings
    // -------------------------------------------------------------------------
    app.put('/api/agents/:agentId/publish', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { agentId } = req.params;
        try {
            const body = updatePublishSettingsSchema.parse(req.body);
            const updatedAgent = await (0, public_agent_service_js_1.updatePublishedAgent)(userId, agentId, body);
            app.log.info({ userId, agentId }, 'Published agent updated');
            return {
                success: true,
                agentId: updatedAgent.agentId,
                isActive: updatedAgent.isActive,
                allowDirectChat: updatedAgent.allowDirectChat,
                allowAgentToAgent: updatedAgent.allowAgentToAgent,
                allowAccompaniedChat: updatedAgent.allowAccompaniedChat,
                updatedAt: updatedAgent.updatedAt,
            };
        }
        catch (error) {
            if (error.message) {
                reply.code(400);
                return { error: error.message };
            }
            app.log.error({ err: error, userId, agentId }, 'Failed to update published agent');
            reply.code(500);
            return { error: 'Failed to update published agent' };
        }
    });
    // -------------------------------------------------------------------------
    // Unpublish an agent
    // -------------------------------------------------------------------------
    app.delete('/api/agents/:agentId/publish', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { agentId } = req.params;
        try {
            await (0, public_agent_service_js_1.unpublishAgent)(userId, agentId);
            app.log.info({ userId, agentId }, 'Agent unpublished');
            return { success: true };
        }
        catch (error) {
            if (error.message) {
                reply.code(400);
                return { error: error.message };
            }
            app.log.error({ err: error, userId, agentId }, 'Failed to unpublish agent');
            reply.code(500);
            return { error: 'Failed to unpublish agent' };
        }
    });
    // -------------------------------------------------------------------------
    // Get user's published agents
    // -------------------------------------------------------------------------
    app.get('/api/agents/published', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        try {
            const index = await (0, public_agent_service_js_1.getPublishedAgentsIndex)(userId);
            if (!index) {
                return {
                    agents: [],
                    totalPublished: 0,
                };
            }
            // Get full details for each agent
            const agentsWithDetails = await Promise.all(index.agents.map(async (meta) => {
                const agent = await (0, public_agent_service_js_1.getPublishedAgent)(meta.agentId);
                return {
                    agentId: meta.agentId,
                    name: meta.name,
                    emoji: meta.emoji,
                    isActive: meta.isActive,
                    viewCount: meta.viewCount,
                    sessionCount: meta.sessionCount,
                    url: (0, public_agent_service_js_1.getPublicAgentUrl)(meta.agentId),
                    allowDirectChat: agent?.allowDirectChat || false,
                    allowAgentToAgent: agent?.allowAgentToAgent || false,
                    allowAccompaniedChat: agent?.allowAccompaniedChat || false,
                    createdAt: meta.createdAt,
                    updatedAt: meta.updatedAt,
                };
            }));
            return {
                agents: agentsWithDetails,
                totalPublished: index.totalPublished,
            };
        }
        catch (error) {
            app.log.error({ err: error, userId }, 'Failed to get published agents');
            reply.code(500);
            return { error: 'Failed to retrieve published agents' };
        }
    });
    // -------------------------------------------------------------------------
    // Get sessions for a published agent
    // -------------------------------------------------------------------------
    app.get('/api/agents/published/:agentId/sessions', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { agentId } = req.params;
        const { limit } = req.query;
        try {
            const sessions = await (0, public_agent_service_js_1.getSessionsForAgent)(userId, agentId, limit ? parseInt(limit, 10) : 50);
            return {
                agentId,
                sessions: sessions.map(s => ({
                    sessionId: s.sessionId,
                    mode: s.mode,
                    status: s.status,
                    visitorId: s.visitorId,
                    visitorAgentName: s.visitorAgentName,
                    messageCount: s.messages.length,
                    extractedData: s.extractedData,
                    createdAt: s.createdAt,
                    completedAt: s.completedAt,
                })),
                totalSessions: sessions.length,
            };
        }
        catch (error) {
            if (error.message === 'Not authorized to view sessions for this agent') {
                reply.code(403);
                return { error: error.message };
            }
            app.log.error({ err: error, userId, agentId }, 'Failed to get sessions');
            reply.code(500);
            return { error: 'Failed to retrieve sessions' };
        }
    });
    // -------------------------------------------------------------------------
    // Get a specific session's details (for owner)
    // -------------------------------------------------------------------------
    app.get('/api/agents/published/:agentId/sessions/:sessionId', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { agentId, sessionId } = req.params;
        try {
            // Verify ownership
            const agent = await (0, public_agent_service_js_1.getPublishedAgent)(agentId);
            if (!agent || agent.ownerId !== userId) {
                reply.code(403);
                return { error: 'Not authorized to view this session' };
            }
            const session = await (0, public_agent_service_js_1.getPublicSession)(sessionId);
            if (!session || session.agentId !== agentId) {
                reply.code(404);
                return { error: 'Session not found' };
            }
            return {
                sessionId: session.sessionId,
                agentId: session.agentId,
                mode: session.mode,
                status: session.status,
                visitorId: session.visitorId,
                visitorUserId: session.visitorUserId,
                visitorAgentId: session.visitorAgentId,
                visitorAgentName: session.visitorAgentName,
                messages: session.messages,
                extractedData: session.extractedData,
                createdAt: session.createdAt,
                completedAt: session.completedAt,
            };
        }
        catch (error) {
            app.log.error({ err: error, userId, agentId, sessionId }, 'Failed to get session');
            reply.code(500);
            return { error: 'Failed to retrieve session' };
        }
    });
    // -------------------------------------------------------------------------
    // Get published status for an agent
    // -------------------------------------------------------------------------
    app.get('/api/agents/:agentId/publish', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { agentId } = req.params;
        try {
            const agent = await (0, public_agent_service_js_1.getPublishedAgent)(agentId);
            if (!agent) {
                return { isPublished: false };
            }
            // Verify ownership
            if (agent.ownerId !== userId) {
                return { isPublished: false };
            }
            return {
                isPublished: true,
                agentId: agent.agentId,
                url: (0, public_agent_service_js_1.getPublicAgentUrl)(agent.agentId),
                isActive: agent.isActive,
                allowDirectChat: agent.allowDirectChat,
                allowAgentToAgent: agent.allowAgentToAgent,
                allowAccompaniedChat: agent.allowAccompaniedChat,
                viewCount: agent.viewCount,
                createdAt: agent.createdAt,
                updatedAt: agent.updatedAt,
            };
        }
        catch (error) {
            app.log.error({ err: error, userId, agentId }, 'Failed to get publish status');
            reply.code(500);
            return { error: 'Failed to retrieve publish status' };
        }
    });
}
