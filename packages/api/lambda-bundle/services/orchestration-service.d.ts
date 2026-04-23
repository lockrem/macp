export interface OrchestrationResult {
    selectedAgentId: string;
    agentName: string;
    agentEmoji: string;
    intent: string;
    confidence: number;
    memoryCategoriesToLoad: string[];
    reasoning?: string;
}
export interface AgentDispatch {
    agentId: string;
    agentName: string;
    agentEmoji: string;
    intent: string;
    relevance: number;
    shouldRespond: boolean;
    memoryCategories: string[];
    extractionOnly: boolean;
}
export interface MultiAgentAnalysis {
    primaryAgent: AgentDispatch;
    supportingAgents: AgentDispatch[];
    allIntents: string[];
    reasoning?: string;
}
export interface AgentConfig {
    id: string;
    displayName: string;
    emoji: string;
    provider: 'anthropic' | 'openai' | 'gemini' | 'groq';
    modelId: string;
    systemPrompt?: string;
    personality?: string;
    intents: string[];
    memoryCategories: string[];
}
interface Message {
    role: 'user' | 'assistant';
    content: string;
    agentName?: string;
}
/**
 * Analyzes user message and routes to the appropriate specialist agent
 */
export declare function analyzeAndRoute(userId: string, message: string, conversationHistory: Message[], availableAgents: AgentConfig[], apiKey?: string): Promise<OrchestrationResult>;
/**
 * Analyzes message for multi-agent dispatch - identifies ALL relevant agents
 * Returns primary agent + supporting agents that should contribute
 */
export declare function analyzeForMultiAgent(userId: string, message: string, conversationHistory: Message[], availableAgents: AgentConfig[], apiKey?: string): Promise<MultiAgentAnalysis>;
/**
 * Determines if a handoff to a different agent is needed mid-conversation
 */
export declare function shouldHandoff(currentAgentId: string, newRouting: OrchestrationResult): boolean;
/**
 * Gets the default orchestration agent configs
 */
export declare function getDefaultAgentConfigs(): AgentConfig[];
export {};
//# sourceMappingURL=orchestration-service.d.ts.map