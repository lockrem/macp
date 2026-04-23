import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  analyzeAndRoute,
  getDefaultAgentConfigs,
  type AgentConfig,
} from '../services/orchestration-service.js';

// -----------------------------------------------------------------------------
// Orchestration Routes
// Handles intent analysis and agent routing
// -----------------------------------------------------------------------------

const analyzeSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    agentName: z.string().optional(),
  })).optional(),
  agentConfigs: z.array(z.object({
    id: z.string(),
    displayName: z.string(),
    emoji: z.string(),
    provider: z.enum(['anthropic', 'openai', 'gemini', 'groq']),
    modelId: z.string(),
    systemPrompt: z.string().optional(),
    personality: z.string().optional(),
    intents: z.array(z.string()),
    memoryCategories: z.array(z.string()),
  })).optional(),
  apiKey: z.string().optional(),
});

export function registerOrchestrationRoutes(app: FastifyInstance): void {
  /**
   * Analyze intent and determine routing without generating a response
   * Used for debugging, previews, or custom implementations
   */
  app.post('/orchestration/analyze', async (req, reply) => {
    const userId = req.user?.userId;
    if (!userId) { reply.code(401); return { error: 'Authentication required' }; }

    let body;
    try {
      body = analyzeSchema.parse(req.body);
    } catch (error) {
      reply.code(400);
      return { error: 'Invalid request body', details: error };
    }

    // Use provided agents or defaults
    const agents = body.agentConfigs || getDefaultAgentConfigs();
    const history = body.conversationHistory || [];

    try {
      const result = await analyzeAndRoute(
        userId,
        body.message,
        history,
        agents,
        body.apiKey
      );

      return {
        routing: result,
        availableAgents: agents.map(a => ({
          id: a.id,
          displayName: a.displayName,
          emoji: a.emoji,
          intents: a.intents,
        })),
      };
    } catch (error) {
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
    const userId = req.user?.userId;
    if (!userId) { reply.code(401); return { error: 'Authentication required' }; }

    // Get user's configured agents from storage
    // For now, return default system agents
    // TODO: Merge with user's custom agents from database
    const systemAgents = getDefaultAgentConfigs();

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
    const agents = getDefaultAgentConfigs();

    return {
      agents,
      defaultProvider: 'anthropic',
      defaultModelId: 'claude-sonnet-4-5-20250929',
    };
  });
}
