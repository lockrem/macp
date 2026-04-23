import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createContact,
  getContact,
  listContacts,
  updateContact,
  deleteContact,
  searchContactsByName,
  associateAgentWithContact,
  removeAgentFromContact,
  listContactAgents,
  findAgentsForPerson,
} from '../services/contacts-service.js';

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const createContactSchema = z.object({
  name: z.string().min(1).max(100),
  aliases: z.array(z.string().max(100)).max(10).optional(),
  relationship: z.string().max(50).optional(),
  relationshipStarted: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  birthday: z.string().max(10).optional(), // "03-15" or "1990-03-15"
  email: z.string().email().max(255).optional(),
  phone: z.string().max(20).optional(),
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

const updateContactSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  aliases: z.array(z.string().max(100)).max(10).optional(),
  relationship: z.string().max(50).nullable().optional(),
  relationshipStarted: z.union([
    z.string().datetime().transform(val => new Date(val)),
    z.null(),
  ]).optional(),
  birthday: z.string().max(10).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

const associateAgentSchema = z.object({
  publicAgentId: z.string().min(1),
  role: z.string().max(50).optional(),
  discoveredVia: z.enum(['qr_code', 'manual', 'introduction', 'search']).optional(),
});

const listContactsQuerySchema = z.object({
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 50),
  offset: z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
  tags: z.string().optional().transform(val => val ? val.split(',') : undefined),
  search: z.string().optional(),
});

const searchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 10),
});

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export function registerContactRoutes(app: FastifyInstance): void {
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
      const contact = await createContact(userId, body);

      reply.code(201);
      return contact;
    } catch (error) {
      if (error instanceof z.ZodError) {
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
      const result = await listContacts(userId, {
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
    } catch (error) {
      if (error instanceof z.ZodError) {
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
      const contacts = await searchContactsByName(userId, query.q, query.limit);

      return { contacts };
    } catch (error) {
      if (error instanceof z.ZodError) {
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

    const query = req.query as { name?: string };
    if (!query.name) {
      reply.code(400);
      return { error: 'name query parameter is required' };
    }

    try {
      const results = await findAgentsForPerson(userId, query.name);
      return { results };
    } catch (error) {
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

    const { contactId } = req.params as { contactId: string };

    try {
      const contact = await getContact(userId, contactId);

      if (!contact) {
        reply.code(404);
        return { error: 'Contact not found' };
      }

      return contact;
    } catch (error) {
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

    const { contactId } = req.params as { contactId: string };

    try {
      const body = updateContactSchema.parse(req.body);
      const contact = await updateContact(userId, contactId, body);

      if (!contact) {
        reply.code(404);
        return { error: 'Contact not found' };
      }

      return contact;
    } catch (error) {
      if (error instanceof z.ZodError) {
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

    const { contactId } = req.params as { contactId: string };
    const deleted = await deleteContact(userId, contactId);

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

    const { contactId } = req.params as { contactId: string };

    try {
      const body = associateAgentSchema.parse(req.body);
      const association = await associateAgentWithContact(userId, contactId, body);

      if (!association) {
        reply.code(404);
        return { error: 'Contact or agent not found' };
      }

      reply.code(201);
      return association;
    } catch (error) {
      if (error instanceof z.ZodError) {
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

    const { contactId } = req.params as { contactId: string };

    try {
      const agents = await listContactAgents(userId, contactId);
      return { agents };
    } catch (error) {
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

    const { contactId, agentId } = req.params as { contactId: string; agentId: string };
    const removed = await removeAgentFromContact(userId, contactId, agentId);

    if (!removed) {
      reply.code(404);
      return { error: 'Contact not found' };
    }

    reply.code(204);
    return;
  });
}
