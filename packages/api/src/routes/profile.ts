import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getUserProfile,
  upsertProfileFacts,
  deleteFact,
} from '../services/user-memory-service.js';

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export function registerProfileRoutes(app: FastifyInstance): void {

  // -------------------------------------------------------------------------
  // GET /api/profile - User's profile (facts grouped by category)
  // -------------------------------------------------------------------------
  app.get('/api/profile', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;

    try {
      const profile = await getUserProfile(userId);
      return profile;
    } catch (error: any) {
      app.log.error({ err: error, userId }, 'Failed to get user profile');
      reply.code(500);
      return { error: 'Failed to retrieve profile' };
    }
  });

  // -------------------------------------------------------------------------
  // PATCH /api/profile/:category - Manual edit: upsert facts in a category
  // -------------------------------------------------------------------------
  app.patch('/api/profile/:category', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { category } = req.params as { category: string };

    const body = z.object({
      facts: z.array(z.object({
        key: z.string(),
        value: z.union([
          z.string(),
          z.number(),
          z.array(z.string()),
          z.record(z.unknown()),
        ]),
      })),
    }).parse(req.body);

    try {
      const saved = await upsertProfileFacts(userId, category, body.facts);

      // Return updated profile
      const profile = await getUserProfile(userId);

      return {
        saved,
        profile,
      };
    } catch (error: any) {
      app.log.error({ err: error, userId, category }, 'Failed to update profile');
      reply.code(500);
      return { error: 'Failed to update profile' };
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /api/profile/facts/:factId - Delete a specific fact
  // -------------------------------------------------------------------------
  app.delete('/api/profile/facts/:factId', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { factId } = req.params as { factId: string };

    try {
      await deleteFact(userId, factId);

      // Return updated profile
      const profile = await getUserProfile(userId);

      return {
        success: true,
        profile,
      };
    } catch (error: any) {
      app.log.error({ err: error, userId, factId }, 'Failed to delete fact');
      reply.code(500);
      return { error: 'Failed to delete fact' };
    }
  });
}
