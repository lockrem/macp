"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerContactRoutes = registerContactRoutes;
const zod_1 = require("zod");
const contacts_service_js_1 = require("../services/contacts-service.js");
// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------
const createContactSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    aliases: zod_1.z.array(zod_1.z.string().max(100)).max(10).optional(),
    relationship: zod_1.z.string().max(50).optional(),
    relationshipStarted: zod_1.z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
    birthday: zod_1.z.string().max(10).optional(), // "03-15" or "1990-03-15"
    email: zod_1.z.string().email().max(255).optional(),
    phone: zod_1.z.string().max(20).optional(),
    notes: zod_1.z.string().max(1000).optional(),
    tags: zod_1.z.array(zod_1.z.string().max(50)).max(20).optional(),
});
const updateContactSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).optional(),
    aliases: zod_1.z.array(zod_1.z.string().max(100)).max(10).optional(),
    relationship: zod_1.z.string().max(50).nullable().optional(),
    relationshipStarted: zod_1.z.union([
        zod_1.z.string().datetime().transform(val => new Date(val)),
        zod_1.z.null(),
    ]).optional(),
    birthday: zod_1.z.string().max(10).nullable().optional(),
    email: zod_1.z.string().email().max(255).nullable().optional(),
    phone: zod_1.z.string().max(20).nullable().optional(),
    notes: zod_1.z.string().max(1000).nullable().optional(),
    tags: zod_1.z.array(zod_1.z.string().max(50)).max(20).optional(),
});
const associateAgentSchema = zod_1.z.object({
    publicAgentId: zod_1.z.string().min(1),
    role: zod_1.z.string().max(50).optional(),
    discoveredVia: zod_1.z.enum(['qr_code', 'manual', 'introduction', 'search']).optional(),
});
const listContactsQuerySchema = zod_1.z.object({
    limit: zod_1.z.string().optional().transform(val => val ? parseInt(val, 10) : 50),
    offset: zod_1.z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
    tags: zod_1.z.string().optional().transform(val => val ? val.split(',') : undefined),
    search: zod_1.z.string().optional(),
});
const searchQuerySchema = zod_1.z.object({
    q: zod_1.z.string().min(1).max(100),
    limit: zod_1.z.string().optional().transform(val => val ? parseInt(val, 10) : 10),
});
// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
function registerContactRoutes(app) {
    // -------------------------------------------------------------------------
    // Contact CRUD
    // -------------------------------------------------------------------------
    // Create a new contact
    app.post('/api/contacts', async (req, reply) => {
        // Debug logging
        console.log('[Contacts] POST /api/contacts - auth header present:', !!req.headers.authorization);
        console.log('[Contacts] POST /api/contacts - req.user:', req.user ? `userId=${req.user.userId}` : 'null');
        const userId = req.user?.userId;
        if (!userId) {
            console.log('[Contacts] Rejecting - no userId in request');
            reply.code(401);
            return { error: 'Authentication required' };
        }
        try {
            const body = createContactSchema.parse(req.body);
            const contact = await (0, contacts_service_js_1.createContact)(userId, body);
            reply.code(201);
            return contact;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                reply.code(400);
                return { error: 'Validation error', details: error.errors };
            }
            throw error;
        }
    });
    // List contacts with optional filtering
    app.get('/api/contacts', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        try {
            const query = listContactsQuerySchema.parse(req.query);
            const result = await (0, contacts_service_js_1.listContacts)(userId, {
                limit: query.limit,
                offset: query.offset,
                tags: query.tags,
                search: query.search,
            });
            return {
                contacts: result.contacts,
                total: result.total,
                limit: query.limit,
                offset: query.offset,
                hasMore: query.offset + result.contacts.length < result.total,
            };
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                reply.code(400);
                return { error: 'Validation error', details: error.errors };
            }
            console.error('[Contacts] Error listing contacts:', error);
            reply.code(500);
            return {
                error: 'Failed to list contacts',
                details: error instanceof Error ? error.message : String(error)
            };
        }
    });
    // Fuzzy search contacts by name
    app.get('/api/contacts/search', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        try {
            const query = searchQuerySchema.parse(req.query);
            const contacts = await (0, contacts_service_js_1.searchContactsByName)(userId, query.q, query.limit);
            return { contacts };
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                reply.code(400);
                return { error: 'Validation error', details: error.errors };
            }
            throw error;
        }
    });
    // Find agents for a person (for task routing)
    app.get('/api/contacts/find-agents', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const query = req.query;
        if (!query.name) {
            reply.code(400);
            return { error: 'name query parameter is required' };
        }
        try {
            const results = await (0, contacts_service_js_1.findAgentsForPerson)(userId, query.name);
            return { results };
        }
        catch (error) {
            console.error('[Contacts] Error finding agents for person:', error);
            throw error;
        }
    });
    // Get a specific contact
    app.get('/api/contacts/:contactId', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { contactId } = req.params;
        try {
            const contact = await (0, contacts_service_js_1.getContact)(userId, contactId);
            if (!contact) {
                reply.code(404);
                return { error: 'Contact not found' };
            }
            return contact;
        }
        catch (error) {
            console.error('[Contacts] Error getting contact:', error);
            reply.code(500);
            return {
                error: 'Failed to get contact',
                details: error instanceof Error ? error.message : String(error)
            };
        }
    });
    // Update a contact
    app.patch('/api/contacts/:contactId', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { contactId } = req.params;
        try {
            const body = updateContactSchema.parse(req.body);
            const contact = await (0, contacts_service_js_1.updateContact)(userId, contactId, body);
            if (!contact) {
                reply.code(404);
                return { error: 'Contact not found' };
            }
            return contact;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                reply.code(400);
                return { error: 'Validation error', details: error.errors };
            }
            throw error;
        }
    });
    // Delete a contact
    app.delete('/api/contacts/:contactId', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { contactId } = req.params;
        const deleted = await (0, contacts_service_js_1.deleteContact)(userId, contactId);
        if (!deleted) {
            reply.code(404);
            return { error: 'Contact not found' };
        }
        reply.code(204);
        return;
    });
    // -------------------------------------------------------------------------
    // Contact-Agent Associations
    // -------------------------------------------------------------------------
    // Associate an agent with a contact
    app.post('/api/contacts/:contactId/agents', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { contactId } = req.params;
        try {
            const body = associateAgentSchema.parse(req.body);
            const association = await (0, contacts_service_js_1.associateAgentWithContact)(userId, contactId, body);
            if (!association) {
                reply.code(404);
                return { error: 'Contact or agent not found' };
            }
            reply.code(201);
            return association;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                reply.code(400);
                return { error: 'Validation error', details: error.errors };
            }
            if (error instanceof Error) {
                if (error.message === 'Contact not found') {
                    reply.code(404);
                    return { error: 'Contact not found' };
                }
                if (error.message === 'Public agent not found') {
                    reply.code(404);
                    return { error: 'Public agent not found' };
                }
            }
            throw error;
        }
    });
    // List agents associated with a contact
    app.get('/api/contacts/:contactId/agents', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { contactId } = req.params;
        try {
            const agents = await (0, contacts_service_js_1.listContactAgents)(userId, contactId);
            return { agents };
        }
        catch (error) {
            if (error instanceof Error && error.message === 'Contact not found') {
                reply.code(404);
                return { error: 'Contact not found' };
            }
            throw error;
        }
    });
    // Remove an agent association from a contact
    app.delete('/api/contacts/:contactId/agents/:agentId', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { contactId, agentId } = req.params;
        const removed = await (0, contacts_service_js_1.removeAgentFromContact)(userId, contactId, agentId);
        if (!removed) {
            reply.code(404);
            return { error: 'Contact not found' };
        }
        reply.code(204);
        return;
    });
}
//# sourceMappingURL=contacts.js.map