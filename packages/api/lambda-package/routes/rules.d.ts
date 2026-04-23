import type { FastifyInstance } from 'fastify';
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
export declare function registerRulesRoutes(app: FastifyInstance): void;
/**
 * Gets rules for an agent and formats them for system prompt injection
 */
export declare function getRulesForPrompt(userId: string, agentId: string): Promise<string>;
/**
 * Gets rules for multiple agents
 */
export declare function getBulkRulesForPrompt(userId: string, agentIds: string[]): Promise<Record<string, string>>;
/**
 * Saves extracted rules from a conversation
 * Returns the number of new rules added
 */
export declare function saveExtractedRules(userId: string, agentId: string, agentName: string, extractedRules: Array<{
    content: string;
    confidence?: string;
    source?: string;
}>): Promise<{
    added: number;
    duplicates: number;
}>;
//# sourceMappingURL=rules.d.ts.map