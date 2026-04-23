"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAgentRoutes = registerAgentRoutes;
const zod_1 = require("zod");
const ulid_1 = require("ulid");
// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------
const createAgentSchema = zod_1.z.object({
    displayName: zod_1.z.string().min(1).max(50),
    personality: zod_1.z.string().max(500).optional(),
    systemPrompt: zod_1.z.string().max(2000).optional(),
    provider: zod_1.z.enum(['anthropic', 'openai']).default('anthropic'),
    modelId: zod_1.z.string().default('claude-sonnet-4-5-20250929'),
    temperature: zod_1.z.number().min(0).max(100).default(70),
    maxTokens: zod_1.z.number().min(100).max(4000).default(1000),
    capabilities: zod_1.z.array(zod_1.z.object({
        domain: zod_1.z.string(),
        expertiseLevel: zod_1.z.number().min(0).max(1),
        description: zod_1.z.string().optional(),
    })).optional(),
});
const updateAgentSchema = createAgentSchema.partial();
// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
function registerAgentRoutes(app) {
    // Create a new agent
    app.post('/agents', async (req, reply) => {
        // TODO: Get userId from auth token
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const body = createAgentSchema.parse(req.body);
        const agent = {
            id: (0, ulid_1.ulid)(),
            ownerId: userId,
            ...body,
            isDefault: false,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        // TODO: Save to database
        // await db.insert(agents).values(agent);
        reply.code(201);
        return agent;
    });
    // Get user's agents
    app.get('/agents', async (req, reply) => {
        // TODO: Get userId from auth token
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        // TODO: Query from database
        // const userAgents = await db.select().from(agents).where(eq(agents.ownerId, userId));
        // Return mock data for now
        return {
            agents: [
                {
                    id: 'agent-1',
                    ownerId: userId,
                    displayName: 'My Claude',
                    personality: 'Helpful and thoughtful',
                    provider: 'anthropic',
                    modelId: 'claude-sonnet-4-5-20250929',
                    temperature: 70,
                    maxTokens: 1000,
                    isDefault: true,
                    isActive: true,
                },
            ],
        };
    });
    // Get a specific agent
    app.get('/agents/:agentId', async (req, reply) => {
        const { agentId } = req.params;
        // TODO: Query from database with ownership check
        return {
            id: agentId,
            displayName: 'My Claude',
            personality: 'Helpful and thoughtful',
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-5-20250929',
        };
    });
    // Update an agent
    app.patch('/agents/:agentId', async (req, reply) => {
        const { agentId } = req.params;
        const body = updateAgentSchema.parse(req.body);
        // TODO: Update in database with ownership check
        return {
            id: agentId,
            ...body,
            updatedAt: new Date(),
        };
    });
    // Delete an agent
    app.delete('/agents/:agentId', async (req, reply) => {
        const { agentId } = req.params;
        // TODO: Delete from database with ownership check
        reply.code(204);
        return;
    });
    // Set default agent
    app.post('/agents/:agentId/set-default', async (req, reply) => {
        const { agentId } = req.params;
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        // TODO: Update default status in database
        return {
            success: true,
            defaultAgentId: agentId,
        };
    });
}
//# sourceMappingURL=agents.js.map