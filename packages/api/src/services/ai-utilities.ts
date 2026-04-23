/**
 * AI Utility Service
 *
 * Centralized AI capabilities that can be:
 * - Called via REST API for testing
 * - Called internally by other services
 * - Tested with thousands of test cases
 *
 * Each function is stateless and returns structured data.
 */

import {
  createClaudeAdapter,
  createOpenAIAdapter,
  createGeminiAdapter,
  createGroqAdapter,
  type AgentAdapter,
} from '@macp/core';

// Default model configuration
const DEFAULT_PROVIDER = 'anthropic';
const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ExtractTaskInput {
  message: string;
  conversationContext?: string[];
  userMemories?: string[];
}

export interface ExtractTaskResult {
  isTask: boolean;
  confidence: number;
  task?: {
    description: string;
    category: string;
    keywords: string[];
    peopleInvolved: Array<{
      name: string;
      relationship?: string;
      role?: string;  // "target", "mentioned", etc.
    }>;
    details: Record<string, string>;
    assumptions: string[];
  };
  reasoning: string;
}

export interface ExtractNamesInput {
  text: string;
  context?: string;
}

export interface ExtractNamesResult {
  names: Array<{
    name: string;
    type: 'person' | 'organization' | 'place' | 'other';
    relationship?: string;
    context: string;  // How the name was used
    confidence: number;
  }>;
}

export interface MatchContactInput {
  personName: string;
  contacts: Array<{
    id: string;
    name: string;
    aliases?: string[];
    relationship?: string;
  }>;
}

export interface MatchContactResult {
  matched: boolean;
  contactId?: string;
  contactName?: string;
  confidence: number;
  matchType: 'exact' | 'alias' | 'partial' | 'fuzzy' | 'none';
  reasoning: string;
}

export interface DetectCompletionInput {
  taskDescription: string;
  agentResponse: string;
  conversationContext?: string[];
}

export interface DetectCompletionResult {
  completed: boolean;
  confidence: number;
  summary?: string;
  outcome?: 'success' | 'partial' | 'failed' | 'pending';
  reasoning: string;
}

export interface ExtractFactsInput {
  conversation: Array<{
    role: string;
    content: string;
    agentName?: string;
  }>;
  focusAreas?: string[];  // e.g., ["preferences", "personal info", "decisions"]
}

export interface ExtractFactsResult {
  facts: Array<{
    fact: string;
    category: string;
    confidence: number;
    source: string;  // Which message it came from
  }>;
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

function getAdapter(apiKey: string, provider: string = DEFAULT_PROVIDER): AgentAdapter {
  switch (provider) {
    case 'anthropic':
      return createClaudeAdapter(apiKey, DEFAULT_MODEL);
    case 'openai':
      return createOpenAIAdapter(apiKey);
    case 'gemini':
      return createGeminiAdapter(apiKey);
    case 'groq':
      return createGroqAdapter(apiKey);
    default:
      return createClaudeAdapter(apiKey, DEFAULT_MODEL);
  }
}

function parseJsonResponse(response: string): any {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }
  return JSON.parse(jsonMatch[0]);
}

// -----------------------------------------------------------------------------
// AI Functions
// -----------------------------------------------------------------------------

/**
 * Extracts task information from a user message
 */
export async function extractTask(
  input: ExtractTaskInput,
  apiKey: string,
  provider: string = DEFAULT_PROVIDER
): Promise<ExtractTaskResult> {
  const adapter = getAdapter(apiKey, provider);

  const contextStr = input.conversationContext?.slice(-5).join('\n') || '(none)';
  const memoriesStr = input.userMemories?.map(m => `- ${m}`).join('\n') || '(none)';

  const prompt = `Analyze this user message to determine if it contains a TASK request.

A TASK is something requiring external action:
- Making reservations, appointments, bookings
- Communicating with someone else (ask, tell, invite, check with)
- Researching or finding specific information
- Purchasing or ordering something
- Scheduling or coordinating

NOT a task (just conversation):
- Asking the AI questions about general topics
- Sharing feelings or experiences
- Casual chat

User memories:
${memoriesStr}

Recent conversation:
${contextStr}

User message: "${input.message}"

Respond with JSON:
{
  "isTask": true/false,
  "confidence": 0.0-1.0,
  "task": {
    "description": "Clear description of the task",
    "category": "restaurant|health|finance|travel|shopping|research|appointment|social|communication|other",
    "keywords": ["relevant", "keywords"],
    "peopleInvolved": [{"name": "Jane", "relationship": "girlfriend", "role": "target"}],
    "details": {"time": "5:30 PM", "date": "tonight"},
    "assumptions": ["Assumed 2 people for reservation"]
  },
  "reasoning": "Brief explanation of analysis"
}

If not a task, omit the "task" field.
JSON only:`;

  try {
    const response = await adapter.generate({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You extract task information from messages. Return only valid JSON.',
      maxTokens: 500,
      temperature: 0.1,
    });

    const result = parseJsonResponse(response.content);

    return {
      isTask: result.isTask ?? false,
      confidence: result.confidence ?? 0,
      task: result.task,
      reasoning: result.reasoning ?? '',
    };
  } catch (error) {
    console.error('[AI] extractTask error:', error);
    return {
      isTask: false,
      confidence: 0,
      reasoning: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Extracts person/entity names from text
 */
export async function extractNames(
  input: ExtractNamesInput,
  apiKey: string,
  provider: string = DEFAULT_PROVIDER
): Promise<ExtractNamesResult> {
  const adapter = getAdapter(apiKey, provider);

  const prompt = `Extract all names (people, organizations, places) from this text.

${input.context ? `Context: ${input.context}\n` : ''}
Text: "${input.text}"

For each name, determine:
- The type (person, organization, place, other)
- Any relationship mentioned (e.g., "my girlfriend", "our doctor")
- How the name is used in context

Respond with JSON:
{
  "names": [
    {
      "name": "Jane",
      "type": "person",
      "relationship": "girlfriend",
      "context": "mentioned as someone to contact",
      "confidence": 0.95
    }
  ]
}

Return empty array if no names found.
JSON only:`;

  try {
    const response = await adapter.generate({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You extract names from text. Return only valid JSON.',
      maxTokens: 300,
      temperature: 0.1,
    });

    const result = parseJsonResponse(response.content);

    return {
      names: result.names ?? [],
    };
  } catch (error) {
    console.error('[AI] extractNames error:', error);
    return { names: [] };
  }
}

/**
 * Matches a person name to a list of contacts
 */
export async function matchContact(
  input: MatchContactInput,
  apiKey: string,
  provider: string = DEFAULT_PROVIDER
): Promise<MatchContactResult> {
  const adapter = getAdapter(apiKey, provider);

  const contactsList = input.contacts.map(c => {
    const aliases = c.aliases?.length ? ` (aliases: ${c.aliases.join(', ')})` : '';
    const rel = c.relationship ? ` [${c.relationship}]` : '';
    return `- ID: ${c.id}, Name: ${c.name}${aliases}${rel}`;
  }).join('\n');

  const prompt = `Match this person name to the most likely contact.

Person to match: "${input.personName}"

Available contacts:
${contactsList || '(no contacts)'}

Consider:
- Exact name matches (highest confidence)
- Alias matches
- Partial matches (first name only, nickname)
- Phonetic similarity

Respond with JSON:
{
  "matched": true/false,
  "contactId": "id if matched",
  "contactName": "full name if matched",
  "confidence": 0.0-1.0,
  "matchType": "exact|alias|partial|fuzzy|none",
  "reasoning": "Why this match was chosen"
}

JSON only:`;

  try {
    const response = await adapter.generate({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You match person names to contacts. Return only valid JSON.',
      maxTokens: 200,
      temperature: 0.1,
    });

    const result = parseJsonResponse(response.content);

    return {
      matched: result.matched ?? false,
      contactId: result.contactId,
      contactName: result.contactName,
      confidence: result.confidence ?? 0,
      matchType: result.matchType ?? 'none',
      reasoning: result.reasoning ?? '',
    };
  } catch (error) {
    console.error('[AI] matchContact error:', error);
    return {
      matched: false,
      confidence: 0,
      matchType: 'none',
      reasoning: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Detects if a task was completed based on agent response
 */
export async function detectCompletion(
  input: DetectCompletionInput,
  apiKey: string,
  provider: string = DEFAULT_PROVIDER
): Promise<DetectCompletionResult> {
  const adapter = getAdapter(apiKey, provider);

  const contextStr = input.conversationContext?.slice(-5).join('\n') || '(none)';

  const prompt = `Determine if this task was completed based on the agent's response.

Task: "${input.taskDescription}"

Recent conversation:
${contextStr}

Agent's response: "${input.agentResponse}"

Look for:
- Explicit confirmations ("reservation confirmed", "done", "scheduled")
- Specific details that indicate completion (confirmation numbers, times, etc.)
- Clear positive outcomes

Respond with JSON:
{
  "completed": true/false,
  "confidence": 0.0-1.0,
  "summary": "Brief summary of outcome if completed",
  "outcome": "success|partial|failed|pending",
  "reasoning": "Why you determined this"
}

JSON only:`;

  try {
    const response = await adapter.generate({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You detect task completion. Return only valid JSON.',
      maxTokens: 200,
      temperature: 0.1,
    });

    const result = parseJsonResponse(response.content);

    return {
      completed: result.completed ?? false,
      confidence: result.confidence ?? 0,
      summary: result.summary,
      outcome: result.outcome ?? 'pending',
      reasoning: result.reasoning ?? '',
    };
  } catch (error) {
    console.error('[AI] detectCompletion error:', error);
    return {
      completed: false,
      confidence: 0,
      outcome: 'pending',
      reasoning: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Extracts facts from a conversation
 */
export async function extractFacts(
  input: ExtractFactsInput,
  apiKey: string,
  provider: string = DEFAULT_PROVIDER
): Promise<ExtractFactsResult> {
  const adapter = getAdapter(apiKey, provider);

  const conversationText = input.conversation.map((m, i) => {
    const speaker = m.agentName || m.role;
    return `[${i + 1}] ${speaker}: ${m.content}`;
  }).join('\n');

  const focusStr = input.focusAreas?.length
    ? `Focus on: ${input.focusAreas.join(', ')}`
    : 'Extract all notable facts';

  const prompt = `Extract factual information from this conversation.

${focusStr}

Conversation:
${conversationText}

Extract facts that are:
- Explicitly stated or clearly implied
- About the user, their preferences, relationships, or decisions
- Worth remembering for future interactions

Respond with JSON:
{
  "facts": [
    {
      "fact": "User is allergic to shellfish",
      "category": "health|preference|personal|relationship|decision|other",
      "confidence": 0.9,
      "source": "Message 3"
    }
  ]
}

JSON only:`;

  try {
    const response = await adapter.generate({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You extract facts from conversations. Return only valid JSON.',
      maxTokens: 500,
      temperature: 0.1,
    });

    const result = parseJsonResponse(response.content);

    return {
      facts: result.facts ?? [],
    };
  } catch (error) {
    console.error('[AI] extractFacts error:', error);
    return { facts: [] };
  }
}

// -----------------------------------------------------------------------------
// Batch Testing Support
// -----------------------------------------------------------------------------

export interface TestCase<I, O> {
  id: string;
  input: I;
  expectedOutput?: Partial<O>;  // Optional - for validation
  tags?: string[];
}

export interface TestResult<I, O> {
  id: string;
  input: I;
  output: O;
  durationMs: number;
  passed?: boolean;
  error?: string;
}

/**
 * Run a batch of test cases against an AI function
 */
export async function runTestBatch<I, O>(
  testCases: TestCase<I, O>[],
  testFn: (input: I, apiKey: string, provider: string) => Promise<O>,
  apiKey: string,
  provider: string = DEFAULT_PROVIDER
): Promise<{
  results: TestResult<I, O>[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    avgDurationMs: number;
  };
}> {
  const results: TestResult<I, O>[] = [];

  for (const testCase of testCases) {
    const startTime = Date.now();
    try {
      const output = await testFn(testCase.input, apiKey, provider);
      const durationMs = Date.now() - startTime;

      // Simple validation if expected output provided
      let passed: boolean | undefined;
      if (testCase.expectedOutput) {
        passed = Object.entries(testCase.expectedOutput).every(([key, value]) => {
          const actual = (output as any)[key];
          return JSON.stringify(actual) === JSON.stringify(value);
        });
      }

      results.push({
        id: testCase.id,
        input: testCase.input,
        output,
        durationMs,
        passed,
      });
    } catch (error) {
      results.push({
        id: testCase.id,
        input: testCase.input,
        output: {} as O,
        durationMs: Date.now() - startTime,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const passed = results.filter(r => r.passed === true).length;
  const failed = results.filter(r => r.passed === false && !r.error).length;
  const errors = results.filter(r => r.error).length;
  const avgDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;

  return {
    results,
    summary: {
      total: testCases.length,
      passed,
      failed,
      errors,
      avgDurationMs: Math.round(avgDurationMs),
    },
  };
}
