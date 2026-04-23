import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDatabase, userMemoryFacts } from '@macp/core';
import { eq, and, sql, desc } from 'drizzle-orm';
import { ulid } from 'ulid';
import type {
  MemoryIndex,
  MemoryCategory,
  MemoryFact,
  MemoryCategoryMeta,
} from '@macp/shared';

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const memoryFactSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.string()),
    z.record(z.unknown()),
  ]),
  confidence: z.enum(['high', 'medium', 'low']),
  learnedFrom: z.string(),
  learnedAt: z.string(),
  supersedes: z.string().optional(),
});

// -----------------------------------------------------------------------------
// Helper Functions (DB-backed)
// -----------------------------------------------------------------------------

async function getMemoryIndex(userId: string): Promise<MemoryIndex> {
  const db = getDatabase();

  // Get category counts from DB
  const rows = await db.select({
    category: userMemoryFacts.category,
    factCount: sql<number>`count(*)::int`,
    lastUpdated: sql<string>`max(${userMemoryFacts.learnedAt})::text`,
  })
    .from(userMemoryFacts)
    .where(eq(userMemoryFacts.userId, userId))
    .groupBy(userMemoryFacts.category);

  const categories: MemoryCategoryMeta[] = rows.map(row => ({
    name: row.category,
    displayName: formatCategoryName(row.category),
    factCount: row.factCount,
    lastUpdated: row.lastUpdated || new Date().toISOString(),
  }));

  const totalFacts = categories.reduce((sum, c) => sum + c.factCount, 0);

  return {
    userId,
    categories,
    totalFacts,
    lastUpdated: categories.length > 0
      ? categories.reduce((latest, c) => c.lastUpdated > latest ? c.lastUpdated : latest, categories[0].lastUpdated)
      : new Date().toISOString(),
  };
}

async function getMemoryCategory(userId: string, category: string): Promise<MemoryCategory | null> {
  const db = getDatabase();

  const rows = await db.select().from(userMemoryFacts)
    .where(and(
      eq(userMemoryFacts.userId, userId),
      eq(userMemoryFacts.category, category)
    ))
    .orderBy(desc(userMemoryFacts.learnedAt));

  if (rows.length === 0) return null;

  const facts: MemoryFact[] = rows.map(row => ({
    id: row.id,
    key: row.key,
    value: row.value as any,
    confidence: (row.confidence || 'high') as 'high' | 'medium' | 'low',
    learnedFrom: row.learnedFrom || '',
    learnedAt: row.learnedAt.toISOString(),
    supersedes: row.supersedes || undefined,
  }));

  const lastUpdated = rows[0].learnedAt.toISOString();

  return {
    category,
    displayName: formatCategoryName(category),
    userId,
    lastUpdated,
    summary: generateCategorySummary({ category, displayName: formatCategoryName(category), userId, lastUpdated, summary: '', facts }),
    facts,
  };
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export function registerMemoryRoutes(app: FastifyInstance): void {

  // -------------------------------------------------------------------------
  // Get memory index (list all categories)
  // -------------------------------------------------------------------------
  app.get('/api/memories', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;

    try {
      const index = await getMemoryIndex(userId);
      return index;
    } catch (error: any) {
      app.log.error({ err: error, userId }, 'Failed to get memory index');
      reply.code(500);
      return { error: 'Failed to retrieve memory index' };
    }
  });

  // -------------------------------------------------------------------------
  // Get a specific memory category
  // -------------------------------------------------------------------------
  app.get('/api/memories/:category', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { category } = req.params as { category: string };

    try {
      const memoryCategory = await getMemoryCategory(userId, category);

      if (!memoryCategory) {
        reply.code(404);
        return { error: 'Memory category not found' };
      }

      return memoryCategory;
    } catch (error: any) {
      app.log.error({ err: error, userId, category }, 'Failed to get memory category');
      reply.code(500);
      return { error: 'Failed to retrieve memory category' };
    }
  });

  // -------------------------------------------------------------------------
  // Get multiple memory categories (for context injection)
  // -------------------------------------------------------------------------
  app.post('/api/memories/bulk', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { categories } = z.object({
      categories: z.array(z.string()),
    }).parse(req.body);

    try {
      const results: Record<string, MemoryCategory | null> = {};

      await Promise.all(
        categories.map(async (category) => {
          results[category] = await getMemoryCategory(userId, category);
        })
      );

      const summaries = Object.entries(results)
        .filter(([_, cat]) => cat !== null)
        .map(([name, cat]) => `### ${cat!.displayName}\n${cat!.summary}`)
        .join('\n\n');

      return {
        categories: results,
        combinedSummary: summaries || 'No memory available.',
      };
    } catch (error: any) {
      app.log.error({ err: error, userId }, 'Failed to get bulk memories');
      reply.code(500);
      return { error: 'Failed to retrieve memories' };
    }
  });

  // -------------------------------------------------------------------------
  // Add facts to a category (creates category if doesn't exist)
  // -------------------------------------------------------------------------
  app.post('/api/memories/:category/facts', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { category } = req.params as { category: string };

    const body = z.object({
      displayName: z.string().optional(),
      facts: z.array(memoryFactSchema),
      regenerateSummary: z.boolean().default(true),
    }).parse(req.body);

    try {
      const db = getDatabase();
      const now = new Date();

      for (const newFact of body.facts) {
        // Check for existing fact with same key
        const existing = await db.select().from(userMemoryFacts)
          .where(and(
            eq(userMemoryFacts.userId, userId),
            eq(userMemoryFacts.category, category),
            eq(userMemoryFacts.key, newFact.key)
          ))
          .limit(1);

        if (existing.length > 0) {
          // Update existing
          await db.update(userMemoryFacts)
            .set({
              value: newFact.value as any,
              confidence: newFact.confidence,
              learnedFrom: newFact.learnedFrom,
              learnedAt: new Date(newFact.learnedAt),
              supersedes: newFact.supersedes || existing[0].id,
            })
            .where(eq(userMemoryFacts.id, existing[0].id));
        } else {
          // Insert new
          await db.insert(userMemoryFacts).values({
            id: newFact.id || ulid(),
            userId,
            category,
            key: newFact.key,
            value: newFact.value as any,
            confidence: newFact.confidence,
            learnedFrom: newFact.learnedFrom,
            learnedAt: new Date(newFact.learnedAt),
            supersedes: newFact.supersedes,
          });
        }
      }

      // Retrieve updated data
      const memoryCategory = await getMemoryCategory(userId, category);
      const index = await getMemoryIndex(userId);

      app.log.info({ userId, category, factCount: body.facts.length }, 'Added facts to memory');

      return {
        category: memoryCategory,
        index,
      };
    } catch (error: any) {
      app.log.error({ err: error, userId, category }, 'Failed to add facts');
      reply.code(500);
      return { error: 'Failed to add facts to memory' };
    }
  });

  // -------------------------------------------------------------------------
  // Delete a memory category (all facts in that category)
  // -------------------------------------------------------------------------
  app.delete('/api/memories/:category', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { category } = req.params as { category: string };

    try {
      const db = getDatabase();
      await db.delete(userMemoryFacts)
        .where(and(
          eq(userMemoryFacts.userId, userId),
          eq(userMemoryFacts.category, category)
        ));

      app.log.info({ userId, category }, 'Deleted memory category');
      return { success: true };
    } catch (error: any) {
      app.log.error({ err: error, userId, category }, 'Failed to delete memory category');
      reply.code(500);
      return { error: 'Failed to delete memory category' };
    }
  });

  // -------------------------------------------------------------------------
  // Delete a specific fact from a category
  // -------------------------------------------------------------------------
  app.delete('/api/memories/:category/facts/:factId', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { category, factId } = req.params as { category: string; factId: string };

    try {
      const db = getDatabase();
      await db.delete(userMemoryFacts)
        .where(and(
          eq(userMemoryFacts.id, factId),
          eq(userMemoryFacts.userId, userId),
          eq(userMemoryFacts.category, category)
        ));

      return { success: true };
    } catch (error: any) {
      app.log.error({ err: error, userId, category, factId }, 'Failed to delete fact');
      reply.code(500);
      return { error: 'Failed to delete fact' };
    }
  });

  // -------------------------------------------------------------------------
  // Smart fact lookup - returns facts based on queries
  // -------------------------------------------------------------------------
  app.post('/api/memories/lookup', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { queries, includeContext } = z.object({
      queries: z.array(z.string()),
      includeContext: z.boolean().default(true),
    }).parse(req.body);

    try {
      const db = getDatabase();

      // Get all user facts
      const allFacts = await db.select().from(userMemoryFacts)
        .where(eq(userMemoryFacts.userId, userId));

      const facts: Record<string, unknown> = {};
      const availability: Record<string, { available: boolean; category?: string; confidence?: string; preview?: string }> = {};
      const unavailable: string[] = [];
      const categoriesToLoad = new Set<string>();

      for (const query of queries) {
        const normalizedQuery = query.toLowerCase().replace(/\s+/g, '_');

        // Find matching fact by key
        const match = allFacts.find(f =>
          f.key === normalizedQuery ||
          f.key.includes(normalizedQuery) ||
          normalizedQuery.includes(f.key)
        );

        if (match) {
          facts[query] = match.value;
          availability[query] = {
            available: true,
            category: match.category,
            confidence: match.confidence || 'high',
            preview: typeof match.value === 'string' ? match.value.slice(0, 50) : JSON.stringify(match.value).slice(0, 50),
          };
          categoriesToLoad.add(match.category);
        } else {
          availability[query] = { available: false };
          unavailable.push(query);
        }
      }

      let contextString = '';
      if (includeContext && categoriesToLoad.size > 0) {
        const categoryFacts = new Map<string, typeof allFacts>();
        for (const fact of allFacts) {
          if (categoriesToLoad.has(fact.category)) {
            if (!categoryFacts.has(fact.category)) categoryFacts.set(fact.category, []);
            categoryFacts.get(fact.category)!.push(fact);
          }
        }

        const summaries = Array.from(categoryFacts.entries()).map(([cat, facts]) => {
          const factStrings = facts.map(f => {
            const value = typeof f.value === 'string' ? f.value : JSON.stringify(f.value);
            return `${formatFactKey(f.key)}: ${value}`;
          });
          return `### ${formatCategoryName(cat)}\n${factStrings.join('. ')}.`;
        });
        contextString = summaries.join('\n\n') || 'No relevant information found.';
      }

      return {
        facts,
        availability,
        unavailable,
        context: includeContext ? contextString : undefined,
      };
    } catch (error: any) {
      app.log.error({ err: error, userId }, 'Failed to lookup facts');
      reply.code(500);
      return { error: 'Failed to lookup facts' };
    }
  });

  // -------------------------------------------------------------------------
  // Legacy routes for backward compatibility
  // -------------------------------------------------------------------------

  app.get('/api/memories/:userId/:agentId', async (req, reply) => {
    const { userId, agentId } = req.params as { userId: string; agentId: string };
    const requestUserId = req.user?.userId;

    if (!requestUserId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    if (userId !== requestUserId) {
      reply.code(403);
      return { error: 'Access denied' };
    }

    const index = await getMemoryIndex(userId);
    return index;
  });
}

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

function formatCategoryName(category: string): string {
  const names: Record<string, string> = {
    identity: 'Personal Info',
    dietary: 'Dietary Preferences',
    health: 'Health Information',
    preferences: 'General Preferences',
    wishlist: 'Wishlist',
    financial: 'Financial Information',
    schedule: 'Scheduling Preferences',
    family: 'Family Information',
    work: 'Work & Career',
    general: 'General Information',
  };
  return names[category] || category
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function generateCategorySummary(category: MemoryCategory): string {
  if (category.facts.length === 0) {
    return `No information recorded for ${category.displayName}.`;
  }

  const factStrings = category.facts.map(fact => {
    const value = Array.isArray(fact.value)
      ? fact.value.join(', ')
      : typeof fact.value === 'object'
        ? JSON.stringify(fact.value)
        : String(fact.value);

    return `${formatFactKey(fact.key)}: ${value}`;
  });

  return factStrings.join('. ') + '.';
}

function formatFactKey(key: string): string {
  return key
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
