interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}
export interface ExtractedRule {
    content: string;
    confidence: 'high' | 'medium' | 'low';
    source: string;
}
export interface RuleExtractionResult {
    conversationId: string;
    agentId: string;
    agentName: string;
    extractedAt: string;
    rules: ExtractedRule[];
}
/**
 * Extracts rules/preferences from a conversation using an LLM
 */
export declare function extractRulesFromConversation(conversationId: string, agentId: string, agentName: string, messages: ConversationMessage[], apiKey?: string): Promise<RuleExtractionResult>;
/**
 * Extracts rules/preferences from an introduction conversation
 * Uses enhanced extraction since user is deliberately sharing preferences
 */
export declare function extractRulesFromIntroduction(conversationId: string, agentId: string, agentName: string, messages: ConversationMessage[], apiKey?: string): Promise<RuleExtractionResult>;
/**
 * Converts extracted rules to the storage format with IDs
 */
export declare function extractedRulesToAgentRules(extractedRules: ExtractedRule[], conversationId: string): Array<{
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    source?: string;
    confidence?: string;
}>;
export {};
//# sourceMappingURL=rule-extraction.d.ts.map