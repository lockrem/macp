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
            role?: string;
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
        context: string;
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
    focusAreas?: string[];
}
export interface ExtractFactsResult {
    facts: Array<{
        fact: string;
        category: string;
        confidence: number;
        source: string;
    }>;
}
/**
 * Extracts task information from a user message
 */
export declare function extractTask(input: ExtractTaskInput, apiKey: string, provider?: string): Promise<ExtractTaskResult>;
/**
 * Extracts person/entity names from text
 */
export declare function extractNames(input: ExtractNamesInput, apiKey: string, provider?: string): Promise<ExtractNamesResult>;
/**
 * Matches a person name to a list of contacts
 */
export declare function matchContact(input: MatchContactInput, apiKey: string, provider?: string): Promise<MatchContactResult>;
/**
 * Detects if a task was completed based on agent response
 */
export declare function detectCompletion(input: DetectCompletionInput, apiKey: string, provider?: string): Promise<DetectCompletionResult>;
/**
 * Extracts facts from a conversation
 */
export declare function extractFacts(input: ExtractFactsInput, apiKey: string, provider?: string): Promise<ExtractFactsResult>;
export interface TestCase<I, O> {
    id: string;
    input: I;
    expectedOutput?: Partial<O>;
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
export declare function runTestBatch<I, O>(testCases: TestCase<I, O>[], testFn: (input: I, apiKey: string, provider: string) => Promise<O>, apiKey: string, provider?: string): Promise<{
    results: TestResult<I, O>[];
    summary: {
        total: number;
        passed: number;
        failed: number;
        errors: number;
        avgDurationMs: number;
    };
}>;
//# sourceMappingURL=ai-utilities.d.ts.map