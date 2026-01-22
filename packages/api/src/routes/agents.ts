import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ulid } from 'ulid';

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const createAgentSchema = z.object({
  displayName: z.string().min(1).max(50),
  personality: z.string().max(500).optional(),
  systemPrompt: z.string().max(2000).optional(),
  provider: z.enum(['anthropic', 'openai']).default('anthropic'),
  modelId: z.string().default('claude-sonnet-4-20250514'),
  temperature: z.number().min(0).max(100).default(70),
  maxTokens: z.number().min(100).max(4000).default(1000),
  capabilities: z.array(z.object({
    domain: z.string(),
    expertiseLevel: z.number().min(0).max(1),
    description: z.string().optional(),
  })).optional(),
});

const updateAgentSchema = createAgentSchema.partial();

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export function registerAgentRoutes(app: FastifyInstance): void {
  // Create a new agent
  app.post('/agents', async (req, reply) => {
    // TODO: Get userId from auth token
    const userId = (req.headers['x-user-id'] as string) || 'demo-user';

    const body = createAgentSchema.parse(req.body);

    const agent = {
      id: ulid(),
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
  app.get('/agents', async (req) => {
    // TODO: Get userId from auth token
    const userId = (req.headers['x-user-id'] as string) || 'demo-user';

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
          modelId: 'claude-sonnet-4-20250514',
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
    const { agentId } = req.params as { agentId: string };

    // TODO: Query from database with ownership check

    return {
      id: agentId,
      displayName: 'My Claude',
      personality: 'Helpful and thoughtful',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
    };
  });

  // Update an agent
  app.patch('/agents/:agentId', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
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
    const { agentId } = req.params as { agentId: string };

    // TODO: Delete from database with ownership check

    reply.code(204);
    return;
  });

  // Set default agent
  app.post('/agents/:agentId/set-default', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const userId = (req.headers['x-user-id'] as string) || 'demo-user';

    // TODO: Update default status in database

    return {
      success: true,
      defaultAgentId: agentId,
    };
  });
}
