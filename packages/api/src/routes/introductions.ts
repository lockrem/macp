import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getIntroductionStatus,
  getAgentIntroductionStatus,
  skipIntroduction,
  startIntroduction,
  getIntroductionProgress,
} from '../services/introduction-service.js';
import { getTemplateById, getSystemAgentTemplates } from '../services/agent-templates.js';

// -----------------------------------------------------------------------------
// Introduction Routes
// Manages the introduction flow status for user-agent pairs
// -----------------------------------------------------------------------------

export function registerIntroductionRoutes(app: FastifyInstance): void {
  // Get introduction status for all agents
  app.get('/api/introductions', async (req, reply) => {
    const userId = req.user?.userId;
    if (!userId) { reply.code(401); return { error: 'Authentication required' }; }
    const status = await getIntroductionStatus(userId);

    // Enhance with agent metadata
    const templates = getSystemAgentTemplates();
    const agentsWithStatus = templates.map(template => {
      const agentStatus = status.agents[template.templateId] || {
        status: 'not_started',
        questionsAsked: [],
        questionsAnswered: [],
        factsLearned: 0,
        rulesLearned: 0,
      };

      const progress = getIntroductionProgress(
        template.templateId,
        agentStatus.questionsAsked
      );

      return {
        agentId: template.templateId,
        agentName: template.name,
        agentEmoji: template.emoji,
        introductionStatus: agentStatus.status,
        progress: {
          questionsAsked: progress.current,
          totalQuestions: progress.total,
        },
        factsLearned: agentStatus.factsLearned,
        rulesLearned: agentStatus.rulesLearned,
        completedAt: agentStatus.completedAt,
        needsIntroduction: agentStatus.status === 'not_started' || agentStatus.status === 'in_progress',
      };
    });

    return {
      userId: status.userId,
      agents: agentsWithStatus,
      lastUpdated: status.lastUpdated,
    };
  });

  // Get introduction status for a specific agent
  app.get('/api/introductions/:agentId', async (req, reply) => {
    const userId = req.user?.userId;
    if (!userId) { reply.code(401); return { error: 'Authentication required' }; }
    const { agentId } = req.params as { agentId: string };

    const status = await getAgentIntroductionStatus(userId, agentId);
    const template = getTemplateById(agentId);
    const progress = getIntroductionProgress(agentId, status.questionsAsked);

    return {
      agentId,
      agentName: template?.name,
      agentEmoji: template?.emoji,
      introductionGreeting: template?.introductionGreeting,
      status: status.status,
      progress: {
        questionsAsked: progress.current,
        totalQuestions: progress.total,
      },
      questionsAsked: status.questionsAsked,
      questionsAnswered: status.questionsAnswered,
      factsLearned: status.factsLearned,
      rulesLearned: status.rulesLearned,
      startedAt: status.startedAt,
      completedAt: status.completedAt,
      needsIntroduction: status.status === 'not_started' || status.status === 'in_progress',
    };
  });

  // Get the introduction greeting and first question for an agent
  app.get('/api/introductions/:agentId/start-info', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const template = getTemplateById(agentId);

    // For system agents, use the template
    if (template) {
      // Get the first question (highest priority)
      const sortedQuestions = [...template.introductionQuestions].sort(
        (a, b) => a.priority - b.priority
      );
      const firstQuestion = sortedQuestions[0];

      return {
        agentId,
        agentName: template.name,
        agentEmoji: template.emoji,
        introductionGreeting: template.introductionGreeting,
        totalQuestions: template.introductionQuestions.length,
        firstQuestion: firstQuestion ? {
          id: firstQuestion.id,
          question: firstQuestion.question,
        } : null,
      };
    }

    // For custom agents, return a minimal response
    // The actual questions come from the client when creating the introduction
    return {
      agentId,
      agentName: null,
      agentEmoji: null,
      introductionGreeting: null,
      totalQuestions: 0,
      firstQuestion: null,
      isCustomAgent: true,
    };
  });

  // Start introduction for an agent
  app.post('/api/introductions/:agentId/start', async (req, reply) => {
    const userId = req.user?.userId;
    if (!userId) { reply.code(401); return { error: 'Authentication required' }; }
    const { agentId } = req.params as { agentId: string };

    const status = await startIntroduction(userId, agentId);
    const template = getTemplateById(agentId);

    return {
      agentId,
      agentName: template?.name,
      status: status.status,
      startedAt: status.startedAt,
      message: 'Introduction started',
    };
  });

  // Skip introduction for an agent
  app.post('/api/introductions/:agentId/skip', async (req, reply) => {
    const userId = req.user?.userId;
    if (!userId) { reply.code(401); return { error: 'Authentication required' }; }
    const { agentId } = req.params as { agentId: string };

    const status = await skipIntroduction(userId, agentId);
    const template = getTemplateById(agentId);

    return {
      agentId,
      agentName: template?.name,
      status: status.status,
      message: 'Introduction skipped',
    };
  });

  // Reset introduction for an agent (for testing/re-doing)
  app.post('/api/introductions/:agentId/reset', async (req, reply) => {
    const userId = req.user?.userId;
    if (!userId) { reply.code(401); return { error: 'Authentication required' }; }
    const { agentId } = req.params as { agentId: string };

    // Import the update function
    const { updateAgentIntroductionStatus } = await import('../services/introduction-service.js');

    await updateAgentIntroductionStatus(userId, agentId, {
      status: 'not_started',
      questionsAsked: [],
      questionsAnswered: [],
      startedAt: undefined,
      completedAt: undefined,
      factsLearned: 0,
      rulesLearned: 0,
    });

    return {
      agentId,
      status: 'not_started',
      message: 'Introduction reset',
    };
  });
}
