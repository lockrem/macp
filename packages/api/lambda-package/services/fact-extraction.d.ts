import type { ExtractedFact, FactExtractionResult } from '@macp/shared';
interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}
/**
 * Extracts facts from a conversation using an LLM
 */
export declare function extractFactsFromConversation(conversationId: string, messages: ConversationMessage[], apiKey?: string): Promise<FactExtractionResult>;
/**
 * Generates a natural language summary for a memory category using LLM
 */
export declare function generateLLMSummary(categoryName: string, displayName: string, facts: Array<{
    key: string;
    value: unknown;
}>, apiKey?: string): Promise<string>;
/**
 * Extracts facts from an introduction conversation with enhanced extraction
 * Uses higher confidence and extracts more facts since user is deliberately sharing
 */
export declare function extractFactsFromIntroduction(conversationId: string, messages: ConversationMessage[], apiKey?: string): Promise<FactExtractionResult>;
/**
 * Converts extracted facts to MemoryFact format with IDs
 */
export declare function extractedFactsToMemoryFacts(extractedFacts: ExtractedFact[], conversationId: string): Array<{
    id: string;
    key: string;
    value: string | number | string[] | Record<string, unknown>;
    confidence: 'high' | 'medium' | 'low';
    learnedFrom: string;
    learnedAt: string;
}>;
export {};
//# sourceMappingURL=fact-extraction.d.ts.map