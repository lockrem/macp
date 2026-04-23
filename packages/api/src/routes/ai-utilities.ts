/**
 * AI Utility Routes
 *
 * REST endpoints for testing and using AI capabilities.
 * Each endpoint is stateless and returns structured JSON.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  extractTask,
  extractNames,
  matchContact,
  detectCompletion,
  extractFacts,
  runTestBatch,
  type ExtractTaskInput,
  type ExtractNamesInput,
  type MatchContactInput,
  type DetectCompletionInput,
  type ExtractFactsInput,
  type TestCase,
} from '../services/ai-utilities.js';

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const extractTaskSchema = z.object({
  message: z.string().min(1).max(2000),
  conversationContext: z.array(z.string()).optional(),
  userMemories: z.array(z.string()).optional(),
  apiKey: z.string().min(1).optional(),  // Optional - can use server's key
  provider: z.string().optional(),
});

const extractNamesSchema = z.object({
  text: z.string().min(1).max(2000),
  context: z.string().optional(),
  apiKey: z.string().min(1).optional(),
  provider: z.string().optional(),
});

const matchContactSchema = z.object({
  personName: z.string().min(1).max(100),
  contacts: z.array(z.object({
    id: z.string(),
    name: z.string(),
    aliases: z.array(z.string()).optional(),
    relationship: z.string().optional(),
  })),
  apiKey: z.string().min(1).optional(),
  provider: z.string().optional(),
});

const detectCompletionSchema = z.object({
  taskDescription: z.string().min(1).max(500),
  agentResponse: z.string().min(1).max(2000),
  conversationContext: z.array(z.string()).optional(),
  apiKey: z.string().min(1).optional(),
  provider: z.string().optional(),
});

const extractFactsSchema = z.object({
  conversation: z.array(z.object({
    role: z.string(),
    content: z.string(),
    agentName: z.string().optional(),
  })),
  focusAreas: z.array(z.string()).optional(),
  apiKey: z.string().min(1).optional(),
  provider: z.string().optional(),
});

const batchTestSchema = z.object({
  endpoint: z.enum(['extract-task', 'extract-names', 'match-contact', 'detect-completion', 'extract-facts']),
  testCases: z.array(z.object({
    id: z.string(),
    input: z.any(),
    expectedOutput: z.any().optional(),
    tags: z.array(z.string()).optional(),
  })),
  apiKey: z.string().min(1).optional(),
  provider: z.string().optional(),
});

// -----------------------------------------------------------------------------
// Helper to get API key
// -----------------------------------------------------------------------------

async function getApiKey(providedKey: string | undefined, req: any): Promise<string> {
  if (providedKey) return providedKey;

  // Try to get from server's configured keys
  const serverKey = process.env.ANTHROPIC_API_KEY;
  if (serverKey) return serverKey;

  throw new Error('No API key provided and no server key configured');
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export function registerAIUtilityRoutes(app: FastifyInstance): void {
  // -------------------------------------------------------------------------
  // Extract Task
  // -------------------------------------------------------------------------

  app.post('/api/ai/extract-task', async (req, reply) => {
    try {
      const body = extractTaskSchema.parse(req.body);
      const apiKey = await getApiKey(body.apiKey, req);

      const input: ExtractTaskInput = {
        message: body.message,
        conversationContext: body.conversationContext,
        userMemories: body.userMemories,
      };

      const result = await extractTask(input, apiKey, body.provider);
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Validation error', details: error.errors };
      }
      console.error('[AI] extract-task error:', error);
      reply.code(500);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  // -------------------------------------------------------------------------
  // Extract Names
  // -------------------------------------------------------------------------

  app.post('/api/ai/extract-names', async (req, reply) => {
    try {
      const body = extractNamesSchema.parse(req.body);
      const apiKey = await getApiKey(body.apiKey, req);

      const input: ExtractNamesInput = {
        text: body.text,
        context: body.context,
      };

      const result = await extractNames(input, apiKey, body.provider);
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Validation error', details: error.errors };
      }
      console.error('[AI] extract-names error:', error);
      reply.code(500);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  // -------------------------------------------------------------------------
  // Match Contact
  // -------------------------------------------------------------------------

  app.post('/api/ai/match-contact', async (req, reply) => {
    try {
      const body = matchContactSchema.parse(req.body);
      const apiKey = await getApiKey(body.apiKey, req);

      const input: MatchContactInput = {
        personName: body.personName,
        contacts: body.contacts,
      };

      const result = await matchContact(input, apiKey, body.provider);
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Validation error', details: error.errors };
      }
      console.error('[AI] match-contact error:', error);
      reply.code(500);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  // -------------------------------------------------------------------------
  // Detect Completion
  // -------------------------------------------------------------------------

  app.post('/api/ai/detect-completion', async (req, reply) => {
    try {
      const body = detectCompletionSchema.parse(req.body);
      const apiKey = await getApiKey(body.apiKey, req);

      const input: DetectCompletionInput = {
        taskDescription: body.taskDescription,
        agentResponse: body.agentResponse,
        conversationContext: body.conversationContext,
      };

      const result = await detectCompletion(input, apiKey, body.provider);
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Validation error', details: error.errors };
      }
      console.error('[AI] detect-completion error:', error);
      reply.code(500);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  // -------------------------------------------------------------------------
  // Extract Facts
  // -------------------------------------------------------------------------

  app.post('/api/ai/extract-facts', async (req, reply) => {
    try {
      const body = extractFactsSchema.parse(req.body);
      const apiKey = await getApiKey(body.apiKey, req);

      const input: ExtractFactsInput = {
        conversation: body.conversation,
        focusAreas: body.focusAreas,
      };

      const result = await extractFacts(input, apiKey, body.provider);
      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Validation error', details: error.errors };
      }
      console.error('[AI] extract-facts error:', error);
      reply.code(500);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  // -------------------------------------------------------------------------
  // Batch Test Runner
  // -------------------------------------------------------------------------

  app.post('/api/ai/batch-test', async (req, reply) => {
    try {
      const body = batchTestSchema.parse(req.body);
      const apiKey = await getApiKey(body.apiKey, req);
      const provider = body.provider;

      // Map endpoint to function
      const endpointFns: Record<string, (input: any, key: string, prov?: string) => Promise<any>> = {
        'extract-task': extractTask,
        'extract-names': extractNames,
        'match-contact': matchContact,
        'detect-completion': detectCompletion,
        'extract-facts': extractFacts,
      };

      const testFn = endpointFns[body.endpoint];
      if (!testFn) {
        reply.code(400);
        return { error: `Unknown endpoint: ${body.endpoint}` };
      }

      const results = await runTestBatch(
        body.testCases as TestCase<any, any>[],
        testFn,
        apiKey,
        provider
      );

      return results;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Validation error', details: error.errors };
      }
      console.error('[AI] batch-test error:', error);
      reply.code(500);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  // -------------------------------------------------------------------------
  // Health Check / Capability List
  // -------------------------------------------------------------------------

  app.get('/api/ai/capabilities', async () => {
    return {
      endpoints: [
        {
          path: '/api/ai/extract-task',
          method: 'POST',
          description: 'Extract task information from a user message',
          input: {
            message: 'string (required)',
            conversationContext: 'string[] (optional)',
            userMemories: 'string[] (optional)',
          },
          output: {
            isTask: 'boolean',
            confidence: 'number (0-1)',
            task: 'object (if isTask)',
            reasoning: 'string',
          },
        },
        {
          path: '/api/ai/extract-names',
          method: 'POST',
          description: 'Extract person/entity names from text',
          input: {
            text: 'string (required)',
            context: 'string (optional)',
          },
          output: {
            names: 'array of {name, type, relationship, context, confidence}',
          },
        },
        {
          path: '/api/ai/match-contact',
          method: 'POST',
          description: 'Match a person name to a list of contacts',
          input: {
            personName: 'string (required)',
            contacts: 'array of {id, name, aliases?, relationship?}',
          },
          output: {
            matched: 'boolean',
            contactId: 'string (if matched)',
            confidence: 'number (0-1)',
            matchType: 'exact|alias|partial|fuzzy|none',
            reasoning: 'string',
          },
        },
        {
          path: '/api/ai/detect-completion',
          method: 'POST',
          description: 'Detect if a task was completed based on agent response',
          input: {
            taskDescription: 'string (required)',
            agentResponse: 'string (required)',
            conversationContext: 'string[] (optional)',
          },
          output: {
            completed: 'boolean',
            confidence: 'number (0-1)',
            summary: 'string (if completed)',
            outcome: 'success|partial|failed|pending',
            reasoning: 'string',
          },
        },
        {
          path: '/api/ai/extract-facts',
          method: 'POST',
          description: 'Extract facts from a conversation',
          input: {
            conversation: 'array of {role, content, agentName?}',
            focusAreas: 'string[] (optional)',
          },
          output: {
            facts: 'array of {fact, category, confidence, source}',
          },
        },
        {
          path: '/api/ai/batch-test',
          method: 'POST',
          description: 'Run batch tests against any AI endpoint',
          input: {
            endpoint: 'string (one of the above)',
            testCases: 'array of {id, input, expectedOutput?, tags?}',
          },
          output: {
            results: 'array of test results',
            summary: '{total, passed, failed, errors, avgDurationMs}',
          },
        },
      ],
    };
  });
}
