/**
 * Bidding Engine Service
 *
 * Implements the multi-factor bidding system from ARCHITECTURE.md for intelligent
 * agent participation in orchestrated conversations.
 *
 * Bid calculation:
 * FinalBid = (RelevanceBid × 0.4) + (ExpertiseBid × 0.3) + (NoveltyBid × 0.15) + (RecencyPenalty × 0.15)
 */
export interface AgentTaskForBidding {
    id: string;
    description: string;
    keywords: string[];
    category: string;
}
export interface AgentForBidding {
    id: string;
    name: string;
    emoji: string;
    personality: string;
    description?: string;
    intents: string[];
    memoryCategories?: string[];
    memories?: string[];
    tasks?: AgentTaskForBidding[];
}
export interface Bid {
    agentId: string;
    agentName: string;
    agentEmoji: string;
    relevanceScore: number;
    confidenceScore: number;
    noveltyScore: number;
    expertiseScore: number;
    pass: boolean;
    reasoning?: string;
    hasMatchingTask?: boolean;
    matchingTaskDescription?: string;
}
export interface BidResult {
    agentId: string;
    agentName: string;
    agentEmoji: string;
    relevanceScore: number;
    confidenceScore: number;
    noveltyScore: number;
    expertiseScore: number;
    finalScore: number;
    pass: boolean;
    shouldParticipate: boolean;
    reasoning?: string;
    hasMatchingTask?: boolean;
    matchingTaskDescription?: string;
}
export interface ConversationContext {
    hostAgentName: string;
    recentMessages: Array<{
        role: 'host' | 'user' | 'agent';
        agentName?: string;
        content: string;
    }>;
    currentTopic?: string;
    participationHistory: Map<string, number>;
    totalTurns: number;
}
/**
 * Collects bids from all available agents for a given conversation context
 */
export declare function collectBids(agents: AgentForBidding[], context: ConversationContext, userMessage: string, apiKey: string, provider?: 'anthropic' | 'openai' | 'gemini' | 'groq'): Promise<Bid[]>;
/**
 * Evaluates bids and determines which agents should participate
 * Implements the full bidding algorithm with anti-monopoly constraints
 * Agents with matching tasks get PRIORITY and should lead the conversation
 */
export declare function evaluateBids(bids: Bid[], context: ConversationContext): BidResult[];
/**
 * Fast keyword-based bidding when API calls are not desired
 * Used as a fallback or for quick pre-filtering
 */
export declare function quickKeywordBid(agents: AgentForBidding[], userMessage: string, context: ConversationContext): BidResult[];
/**
 * Generates a response from a participating agent
 * Agent speaks ON BEHALF of the user, sharing relevant information with the host
 * If agent has a matching task, they should LEAD with that task
 */
export declare function generateAgentResponse(agent: AgentForBidding, context: ConversationContext, userMessageOrHostContext: string, apiKey: string, provider?: 'anthropic' | 'openai' | 'gemini' | 'groq', userMemories?: string[], matchingTask?: {
    description: string;
}): Promise<string>;
//# sourceMappingURL=bidding-engine.d.ts.map