"use strict";
/**
 * Audit Routes
 *
 * API endpoints for retrieving conversation audit data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAuditRoutes = registerAuditRoutes;
const audit_service_js_1 = require("../services/audit-service.js");
// -----------------------------------------------------------------------------
// Route Registration
// -----------------------------------------------------------------------------
async function registerAuditRoutes(app) {
    // List all conversation audits
    app.get('/audit/conversations', async (request, reply) => {
        try {
            const limit = parseInt(request.query?.limit || '50');
            const audits = await (0, audit_service_js_1.listConversationAudits)(limit);
            return reply.send({
                success: true,
                conversations: audits,
            });
        }
        catch (error) {
            console.error('[Audit API] Failed to list conversations:', error);
            return reply.status(500).send({ success: false, error: 'Failed to list conversations' });
        }
    });
    // Get specific conversation audit
    app.get('/audit/conversations/:conversationId', async (request, reply) => {
        try {
            const { conversationId } = request.params;
            const audit = await (0, audit_service_js_1.getConversationAudit)(conversationId);
            if (!audit) {
                return reply.status(404).send({ success: false, error: 'Conversation not found' });
            }
            return reply.send({
                success: true,
                audit,
            });
        }
        catch (error) {
            console.error('[Audit API] Failed to get conversation:', error);
            return reply.status(500).send({ success: false, error: 'Failed to get conversation' });
        }
    });
    app.log.info('Audit routes registered');
}
//# sourceMappingURL=audit.js.map