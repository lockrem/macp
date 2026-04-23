import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface AgentRule {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRules {
  userId: string;
  agentId: string;
  agentName: string;
  rules: AgentRule[];
  lastUpdated: string;
}

export interface RulesIndex {
  userId: string;
  agents: AgentRulesMeta[];
  totalRules: number;
  lastUpdated: string;
}

export interface AgentRulesMeta {
  agentId: string;
  agentName: string;
  ruleCount: number;
  lastUpdated: string;
}

// S3 client - uses default credentials from environment/IAM role
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const MEMORY_BUCKET = process.env.MEMORY_BUCKET || 'macp-dev-memories';

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

async function getRulesIndex(userId: string): Promise<RulesIndex | null> {
  const key = `rules/${userId}/_index.json`;

  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: MEMORY_BUCKET,
      Key: key,
    }));

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return JSON.parse(body) as RulesIndex;
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

async function saveRulesIndex(index: RulesIndex): Promise<void> {
  const key = `rules/${index.userId}/_index.json`;

  await s3Client.send(new PutObjectCommand({
    Bucket: MEMORY_BUCKET,
    Key: key,
    Body: JSON.stringify(index, null, 2),
    ContentType: 'application/json',
    ServerSideEncryption: 'AES256',
  }));
}

async function getAgentRules(userId: string, agentId: string): Promise<AgentRules | null> {
  const key = `rules/${userId}/${agentId}.json`;

  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: MEMORY_BUCKET,
      Key: key,
    }));

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return JSON.parse(body) as AgentRules;
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

async function saveAgentRules(rules: AgentRules): Promise<void> {
  const key = `rules/${rules.userId}/${rules.agentId}.json`;

  await s3Client.send(new PutObjectCommand({
    Bucket: MEMORY_BUCKET,
    Key: key,
    Body: JSON.stringify(rules, null, 2),
    ContentType: 'application/json',
    ServerSideEncryption: 'AES256',
    Metadata: {
      'user-id': rules.userId,
      'agent-id': rules.agentId,
      'updated-at': rules.lastUpdated,
    },
  }));
}

async function deleteAgentRulesFile(userId: string, agentId: string): Promise<void> {
  const key = `rules/${userId}/${agentId}.json`;

  await s3Client.send(new DeleteObjectCommand({
    Bucket: MEMORY_BUCKET,
    Key: key,
  }));
}

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const addRuleSchema = z.object({
  content: z.string().min(1).max(1000),
  agentName: z.string().optional(),
});

const updateRuleSchema = z.object({
  content: z.string().min(1).max(1000),
});

const bulkRulesSchema = z.object({
  agentIds: z.array(z.string()),
});

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export function registerRulesRoutes(app: FastifyInstance): void {

  // -------------------------------------------------------------------------
  // Get rules index (list all agents with rules)
  // -------------------------------------------------------------------------
  app.get('/api/rules', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;

    try {
      const index = await getRulesIndex(userId);

      if (!index) {
        // Return empty index for new users
        return {
          userId,
          agents: [],
          totalRules: 0,
          lastUpdated: new Date().toISOString(),
        };
      }

      return index;
    } catch (error: any) {
      app.log.error({ err: error, userId }, 'Failed to get rules index');
      reply.code(500);
      return { error: 'Failed to retrieve rules index' };
    }
  });

  // -------------------------------------------------------------------------
  // Get rules for a specific agent
  // -------------------------------------------------------------------------
  app.get('/api/rules/:agentId', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { agentId } = req.params as { agentId: string };

    try {
      const agentRules = await getAgentRules(userId, agentId);

      if (!agentRules) {
        // Return empty rules for agents without any
        return {
          userId,
          agentId,
          agentName: agentId,
          rules: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      return agentRules;
    } catch (error: any) {
      app.log.error({ err: error, userId, agentId }, 'Failed to get agent rules');
      reply.code(500);
      return { error: 'Failed to retrieve agent rules' };
    }
  });

  // -------------------------------------------------------------------------
  // Get rules for multiple agents (for orchestration)
  // -------------------------------------------------------------------------
  app.post('/api/rules/bulk', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { agentIds } = bulkRulesSchema.parse(req.body);

    try {
      const results: Record<string, AgentRules | null> = {};

      await Promise.all(
        agentIds.map(async (agentId) => {
          results[agentId] = await getAgentRules(userId, agentId);
        })
      );

      // Build combined rules string for prompt injection
      const rulesSummary = Object.entries(results)
        .filter(([_, rules]) => rules !== null && rules.rules.length > 0)
        .map(([agentId, rules]) => {
          const rulesList = rules!.rules.map(r => `- ${r.content}`).join('\n');
          return `### ${rules!.agentName}\n${rulesList}`;
        })
        .join('\n\n');

      return {
        rules: results,
        combinedRules: rulesSummary || '',
      };
    } catch (error: any) {
      app.log.error({ err: error, userId }, 'Failed to get bulk rules');
      reply.code(500);
      return { error: 'Failed to retrieve rules' };
    }
  });

  // -------------------------------------------------------------------------
  // Add a rule for an agent
  // -------------------------------------------------------------------------
  app.post('/api/rules/:agentId', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { agentId } = req.params as { agentId: string };
    const { content, agentName } = addRuleSchema.parse(req.body);

    try {
      const now = new Date().toISOString();

      // Get or create agent rules
      let agentRules = await getAgentRules(userId, agentId);

      if (!agentRules) {
        agentRules = {
          userId,
          agentId,
          agentName: agentName || formatAgentName(agentId),
          rules: [],
          lastUpdated: now,
        };
      }

      // Create new rule
      const newRule: AgentRule = {
        id: generateRuleId(),
        content,
        createdAt: now,
        updatedAt: now,
      };

      agentRules.rules.push(newRule);
      agentRules.lastUpdated = now;

      // Update agent name if provided
      if (agentName) {
        agentRules.agentName = agentName;
      }

      // Save rules
      await saveAgentRules(agentRules);

      // Update index
      let index = await getRulesIndex(userId);
      if (!index) {
        index = {
          userId,
          agents: [],
          totalRules: 0,
          lastUpdated: now,
        };
      }

      // Update agent in index
      const agentIndex = index.agents.findIndex(a => a.agentId === agentId);
      const agentMeta: AgentRulesMeta = {
        agentId,
        agentName: agentRules.agentName,
        ruleCount: agentRules.rules.length,
        lastUpdated: now,
      };

      if (agentIndex !== -1) {
        index.agents[agentIndex] = agentMeta;
      } else {
        index.agents.push(agentMeta);
      }

      index.totalRules = index.agents.reduce((sum, a) => sum + a.ruleCount, 0);
      index.lastUpdated = now;

      await saveRulesIndex(index);

      app.log.info({ userId, agentId, ruleId: newRule.id }, 'Added rule to agent');

      return {
        rule: newRule,
        agentRules,
        index,
      };
    } catch (error: any) {
      app.log.error({ err: error, userId, agentId }, 'Failed to add rule');
      reply.code(500);
      return { error: 'Failed to add rule' };
    }
  });

  // -------------------------------------------------------------------------
  // Update a rule
  // -------------------------------------------------------------------------
  app.put('/api/rules/:agentId/:ruleId', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { agentId, ruleId } = req.params as { agentId: string; ruleId: string };
    const { content } = updateRuleSchema.parse(req.body);

    try {
      const agentRules = await getAgentRules(userId, agentId);

      if (!agentRules) {
        reply.code(404);
        return { error: 'Agent rules not found' };
      }

      const ruleIndex = agentRules.rules.findIndex(r => r.id === ruleId);
      if (ruleIndex === -1) {
        reply.code(404);
        return { error: 'Rule not found' };
      }

      const now = new Date().toISOString();
      agentRules.rules[ruleIndex].content = content;
      agentRules.rules[ruleIndex].updatedAt = now;
      agentRules.lastUpdated = now;

      await saveAgentRules(agentRules);

      app.log.info({ userId, agentId, ruleId }, 'Updated rule');

      return { success: true, rule: agentRules.rules[ruleIndex] };
    } catch (error: any) {
      app.log.error({ err: error, userId, agentId, ruleId }, 'Failed to update rule');
      reply.code(500);
      return { error: 'Failed to update rule' };
    }
  });

  // -------------------------------------------------------------------------
  // Delete a rule
  // -------------------------------------------------------------------------
  app.delete('/api/rules/:agentId/:ruleId', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { agentId, ruleId } = req.params as { agentId: string; ruleId: string };

    try {
      const agentRules = await getAgentRules(userId, agentId);

      if (!agentRules) {
        reply.code(404);
        return { error: 'Agent rules not found' };
      }

      const ruleIndex = agentRules.rules.findIndex(r => r.id === ruleId);
      if (ruleIndex === -1) {
        reply.code(404);
        return { error: 'Rule not found' };
      }

      agentRules.rules.splice(ruleIndex, 1);
      agentRules.lastUpdated = new Date().toISOString();

      // If no rules left, delete the file entirely
      if (agentRules.rules.length === 0) {
        await deleteAgentRulesFile(userId, agentId);
      } else {
        await saveAgentRules(agentRules);
      }

      // Update index
      const index = await getRulesIndex(userId);
      if (index) {
        if (agentRules.rules.length === 0) {
          // Remove agent from index
          index.agents = index.agents.filter(a => a.agentId !== agentId);
        } else {
          // Update rule count
          const agentIndex = index.agents.findIndex(a => a.agentId === agentId);
          if (agentIndex !== -1) {
            index.agents[agentIndex].ruleCount = agentRules.rules.length;
            index.agents[agentIndex].lastUpdated = agentRules.lastUpdated;
          }
        }
        index.totalRules = index.agents.reduce((sum, a) => sum + a.ruleCount, 0);
        index.lastUpdated = agentRules.lastUpdated;
        await saveRulesIndex(index);
      }

      app.log.info({ userId, agentId, ruleId }, 'Deleted rule');

      return { success: true };
    } catch (error: any) {
      app.log.error({ err: error, userId, agentId, ruleId }, 'Failed to delete rule');
      reply.code(500);
      return { error: 'Failed to delete rule' };
    }
  });

  // -------------------------------------------------------------------------
  // Delete all rules for an agent
  // -------------------------------------------------------------------------
  app.delete('/api/rules/:agentId', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const { agentId } = req.params as { agentId: string };

    try {
      await deleteAgentRulesFile(userId, agentId);

      // Update index
      const index = await getRulesIndex(userId);
      if (index) {
        index.agents = index.agents.filter(a => a.agentId !== agentId);
        index.totalRules = index.agents.reduce((sum, a) => sum + a.ruleCount, 0);
        index.lastUpdated = new Date().toISOString();
        await saveRulesIndex(index);
      }

      app.log.info({ userId, agentId }, 'Deleted all rules for agent');

      return { success: true };
    } catch (error: any) {
      app.log.error({ err: error, userId, agentId }, 'Failed to delete agent rules');
      reply.code(500);
      return { error: 'Failed to delete agent rules' };
    }
  });
}

// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------

function generateRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function formatAgentName(agentId: string): string {
  return agentId
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// -----------------------------------------------------------------------------
// Export helper for orchestration
// -----------------------------------------------------------------------------

/**
 * Gets rules for an agent and formats them for system prompt injection
 */
export async function getRulesForPrompt(userId: string, agentId: string): Promise<string> {
  const rules = await getAgentRules(userId, agentId);

  if (!rules || rules.rules.length === 0) {
    return '';
  }

  const rulesList = rules.rules.map(r => `- ${r.content}`).join('\n');
  return `\n## User Preferences & Rules for ${rules.agentName}\nThe user has specified the following preferences. You MUST follow these rules:\n${rulesList}\n`;
}

/**
 * Gets rules for multiple agents
 */
export async function getBulkRulesForPrompt(userId: string, agentIds: string[]): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  await Promise.all(
    agentIds.map(async (agentId) => {
      results[agentId] = await getRulesForPrompt(userId, agentId);
    })
  );

  return results;
}

/**
 * Saves extracted rules from a conversation
 * Returns the number of new rules added
 */
export async function saveExtractedRules(
  userId: string,
  agentId: string,
  agentName: string,
  extractedRules: Array<{ content: string; confidence?: string; source?: string }>
): Promise<{ added: number; duplicates: number }> {
  if (extractedRules.length === 0) {
    return { added: 0, duplicates: 0 };
  }

  const now = new Date().toISOString();

  // Get existing rules for this agent
  let agentRules = await getAgentRules(userId, agentId);

  if (!agentRules) {
    agentRules = {
      userId,
      agentId,
      agentName,
      rules: [],
      lastUpdated: now,
    };
  }

  // Check for duplicates by comparing normalized content
  const existingContents = new Set(
    agentRules.rules.map(r => r.content.toLowerCase().trim())
  );

  let added = 0;
  let duplicates = 0;

  for (const extracted of extractedRules) {
    const normalizedContent = extracted.content.toLowerCase().trim();

    // Skip if similar rule already exists
    if (existingContents.has(normalizedContent)) {
      duplicates++;
      continue;
    }

    // Also check for very similar rules (basic similarity check)
    let isDuplicate = false;
    for (const existing of existingContents) {
      if (calculateSimilarity(normalizedContent, existing) > 0.8) {
        isDuplicate = true;
        duplicates++;
        break;
      }
    }

    if (isDuplicate) continue;

    // Add new rule
    const newRule: AgentRule = {
      id: generateRuleId(),
      content: extracted.content,
      createdAt: now,
      updatedAt: now,
    };

    agentRules.rules.push(newRule);
    existingContents.add(normalizedContent);
    added++;
  }

  if (added > 0) {
    agentRules.lastUpdated = now;
    await saveAgentRules(agentRules);

    // Update index
    let index = await getRulesIndex(userId);
    if (!index) {
      index = {
        userId,
        agents: [],
        totalRules: 0,
        lastUpdated: now,
      };
    }

    const agentIndex = index.agents.findIndex(a => a.agentId === agentId);
    const agentMeta: AgentRulesMeta = {
      agentId,
      agentName,
      ruleCount: agentRules.rules.length,
      lastUpdated: now,
    };

    if (agentIndex !== -1) {
      index.agents[agentIndex] = agentMeta;
    } else {
      index.agents.push(agentMeta);
    }

    index.totalRules = index.agents.reduce((sum, a) => sum + a.ruleCount, 0);
    index.lastUpdated = now;

    await saveRulesIndex(index);

    console.log(`[Rules] Added ${added} new rules for agent ${agentId} (${duplicates} duplicates skipped)`);
  }

  return { added, duplicates };
}

/**
 * Simple similarity calculation using Jaccard index on words
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}
