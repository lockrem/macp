/**
 * Audit Routes
 *
 * API endpoints for retrieving conversation audit data
 */

import type { FastifyInstance } from 'fastify';
import {
  listConversationAudits,
  getConversationAudit,
} from '../services/audit-service.js';

// -----------------------------------------------------------------------------
// Route Registration
// -----------------------------------------------------------------------------

export async function registerAuditRoutes(app: FastifyInstance) {
  // List all conversation audits
  app.get('/audit/conversations', async (request, reply) => {
    try {
      const limit = parseInt((request.query as any)?.limit || '50');
      const audits = await listConversationAudits(limit);

      return reply.send({
        success: true,
        conversations: audits,
      });
    } catch (error) {
      console.error('[Audit API] Failed to list conversations:', error);
      return reply.status(500).send({ success: false, error: 'Failed to list conversations' });
    }
  });

  // Get specific conversation audit
  app.get('/audit/conversations/:conversationId', async (request, reply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const audit = await getConversationAudit(conversationId);

      if (!audit) {
        return reply.status(404).send({ success: false, error: 'Conversation not found' });
      }

      return reply.send({
        success: true,
        audit,
      });
    } catch (error) {
      console.error('[Audit API] Failed to get conversation:', error);
      return reply.status(500).send({ success: false, error: 'Failed to get conversation' });
    }
  });

  app.log.info('Audit routes registered');
}
