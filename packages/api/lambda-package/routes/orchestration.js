"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerOrchestrationRoutes = registerOrchestrationRoutes;
const zod_1 = require("zod");
const orchestration_service_js_1 = require("../services/orchestration-service.js");
// -----------------------------------------------------------------------------
// Orchestration Routes
// Handles intent analysis and agent routing
// -----------------------------------------------------------------------------
const analyzeSchema = zod_1.z.object({
    message: zod_1.z.string().min(1).max(10000),
    conversationHistory: zod_1.z.array(zod_1.z.object({
        role: zod_1.z.enum(['user', 'assistant']),
        content: zod_1.z.string(),
        agentName: zod_1.z.string().optional(),
    })).optional(),
    agentConfigs: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        displayName: zod_1.z.string(),
        emoji: zod_1.z.string(),
        provider: zod_1.z.enum(['anthropic', 'openai', 'gemini', 'groq']),
        modelId: zod_1.z.string(),
        systemPrompt: zod_1.z.string().optional(),
        personality: zod_1.z.string().optional(),
        intents: zod_1.z.array(zod_1.z.string()),
        memoryCategories: zod_1.z.array(zod_1.z.string()),
    })).optional(),
    apiKey: zod_1.z.string().optional(),
});
function registerOrchestrationRoutes(app) {
    /**
     * Analyze intent and determine routing without generating a response
     * Used for debugging, previews, or custom implementations
     */
    app.post('/orchestration/analyze', async (req, reply) => {
        const userId = req.user?.userId || 'demo-user';
        let body;
        try {
            body = analyzeSchema.parse(req.body);
        }
        catch (error) {
            reply.code(400);
            return { error: 'Invalid request body', details: error };
        }
        // Use provided agents or defaults
        const agents = body.agentConfigs || (0, orchestration_service_js_1.getDefaultAgentConfigs)();
        const history = body.conversationHistory || [];
        try {
            const result = await (0, orchestration_service_js_1.analyzeAndRoute)(userId, body.message, history, agents, body.apiKey);
            return {
                routing: result,
                availableAgents: agents.map(a => ({
                    id: a.id,
                    displayName: a.displayName,
                    emoji: a.emoji,
                    intents: a.intents,
                })),
            };
        }
        catch (error) {
            console.error('[Orchestration] Analysis failed:', error);
            reply.code(500);
            return { error: 'Failed to analyze intent' };
        }
    });
    /**
     * Get available specialist agents for the current user
     * Returns both system agents and user-created agents configured for orchestration
     */
    app.get('/orchestration/agents', async (req, reply) => {
        const userId = req.user?.userId || 'demo-user';
        // Get user's configured agents from storage
        // For now, return default system agents
        // TODO: Merge with user's custom agents from database
        const systemAgents = (0, orchestration_service_js_1.getDefaultAgentConfigs)();
        return {
            agents: systemAgents.map(a => ({
                id: a.id,
                displayName: a.displayName,
                emoji: a.emoji,
                provider: a.provider,
                intents: a.intents,
                memoryCategories: a.memoryCategories,
                isSystemAgent: true,
            })),
        };
    });
    /**
     * Get the default agent configuration
     * Used when creating a new universal chat session
     */
    app.get('/orchestration/default-config', async (req, reply) => {
        const agents = (0, orchestration_service_js_1.getDefaultAgentConfigs)();
        return {
            agents,
            defaultProvider: 'anthropic',
            defaultModelId: 'claude-sonnet-4-5-20250929',
        };
    });
}
//# sourceMappingURL=orchestration.js.map