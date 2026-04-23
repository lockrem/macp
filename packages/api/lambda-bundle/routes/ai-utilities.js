"use strict";
/**
 * AI Utility Routes
 *
 * REST endpoints for testing and using AI capabilities.
 * Each endpoint is stateless and returns structured JSON.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAIUtilityRoutes = registerAIUtilityRoutes;
const zod_1 = require("zod");
const ai_utilities_js_1 = require("../services/ai-utilities.js");
// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------
const extractTaskSchema = zod_1.z.object({
    message: zod_1.z.string().min(1).max(2000),
    conversationContext: zod_1.z.array(zod_1.z.string()).optional(),
    userMemories: zod_1.z.array(zod_1.z.string()).optional(),
    apiKey: zod_1.z.string().min(1).optional(), // Optional - can use server's key
    provider: zod_1.z.string().optional(),
});
const extractNamesSchema = zod_1.z.object({
    text: zod_1.z.string().min(1).max(2000),
    context: zod_1.z.string().optional(),
    apiKey: zod_1.z.string().min(1).optional(),
    provider: zod_1.z.string().optional(),
});
const matchContactSchema = zod_1.z.object({
    personName: zod_1.z.string().min(1).max(100),
    contacts: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        name: zod_1.z.string(),
        aliases: zod_1.z.array(zod_1.z.string()).optional(),
        relationship: zod_1.z.string().optional(),
    })),
    apiKey: zod_1.z.string().min(1).optional(),
    provider: zod_1.z.string().optional(),
});
const detectCompletionSchema = zod_1.z.object({
    taskDescription: zod_1.z.string().min(1).max(500),
    agentResponse: zod_1.z.string().min(1).max(2000),
    conversationContext: zod_1.z.array(zod_1.z.string()).optional(),
    apiKey: zod_1.z.string().min(1).optional(),
    provider: zod_1.z.string().optional(),
});
const extractFactsSchema = zod_1.z.object({
    conversation: zod_1.z.array(zod_1.z.object({
        role: zod_1.z.string(),
        content: zod_1.z.string(),
        agentName: zod_1.z.string().optional(),
    })),
    focusAreas: zod_1.z.array(zod_1.z.string()).optional(),
    apiKey: zod_1.z.string().min(1).optional(),
    provider: zod_1.z.string().optional(),
});
const batchTestSchema = zod_1.z.object({
    endpoint: zod_1.z.enum(['extract-task', 'extract-names', 'match-contact', 'detect-completion', 'extract-facts']),
    testCases: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        input: zod_1.z.any(),
        expectedOutput: zod_1.z.any().optional(),
        tags: zod_1.z.array(zod_1.z.string()).optional(),
    })),
    apiKey: zod_1.z.string().min(1).optional(),
    provider: zod_1.z.string().optional(),
});
// -----------------------------------------------------------------------------
// Helper to get API key
// -----------------------------------------------------------------------------
async function getApiKey(providedKey, req) {
    if (providedKey)
        return providedKey;
    // Try to get from server's configured keys
    const serverKey = process.env.ANTHROPIC_API_KEY;
    if (serverKey)
        return serverKey;
    throw new Error('No API key provided and no server key configured');
}
// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
function registerAIUtilityRoutes(app) {
    // -------------------------------------------------------------------------
    // Extract Task
    // -------------------------------------------------------------------------
    app.post('/api/ai/extract-task', async (req, reply) => {
        try {
            const body = extractTaskSchema.parse(req.body);
            const apiKey = await getApiKey(body.apiKey, req);
            const input = {
                message: body.message,
                conversationContext: body.conversationContext,
                userMemories: body.userMemories,
            };
            const result = await (0, ai_utilities_js_1.extractTask)(input, apiKey, body.provider);
            return result;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
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
            const input = {
                text: body.text,
                context: body.context,
            };
            const result = await (0, ai_utilities_js_1.extractNames)(input, apiKey, body.provider);
            return result;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
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
            const input = {
                personName: body.personName,
                contacts: body.contacts,
            };
            const result = await (0, ai_utilities_js_1.matchContact)(input, apiKey, body.provider);
            return result;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
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
            const input = {
                taskDescription: body.taskDescription,
                agentResponse: body.agentResponse,
                conversationContext: body.conversationContext,
            };
            const result = await (0, ai_utilities_js_1.detectCompletion)(input, apiKey, body.provider);
            return result;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
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
            const input = {
                conversation: body.conversation,
                focusAreas: body.focusAreas,
            };
            const result = await (0, ai_utilities_js_1.extractFacts)(input, apiKey, body.provider);
            return result;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
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
            const endpointFns = {
                'extract-task': ai_utilities_js_1.extractTask,
                'extract-names': ai_utilities_js_1.extractNames,
                'match-contact': ai_utilities_js_1.matchContact,
                'detect-completion': ai_utilities_js_1.detectCompletion,
                'extract-facts': ai_utilities_js_1.extractFacts,
            };
            const testFn = endpointFns[body.endpoint];
            if (!testFn) {
                reply.code(400);
                return { error: `Unknown endpoint: ${body.endpoint}` };
            }
            const results = await (0, ai_utilities_js_1.runTestBatch)(body.testCases, testFn, apiKey, provider);
            return results;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
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
//# sourceMappingURL=ai-utilities.js.map