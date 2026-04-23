import type { Agent, BTSMessage } from '@macp/shared';
import { BTSTransport, AgentAdapter } from '@macp/core';
export interface P2PConversationConfig {
    topic: string;
    goal: string;
    maxTurns: number;
    maxTokens: number;
    perAgentTokenLimit: number;
    enableBidding: boolean;
    bidTimeoutMs: number;
    responseTimeoutMs: number;
}
export interface P2PConversationResult {
    conversationId: string;
    turns: BTSMessage[];
    finalSummary: string;
    totalTokensUsed: number;
    tokensByAgent: Record<string, number>;
    terminationReason: 'goal_achieved' | 'max_turns' | 'budget_exceeded' | 'stagnation' | 'error';
    durationMs: number;
}
export interface P2PAgent {
    agent: Agent;
    adapter: AgentAdapter;
}
export declare class P2PConversationRunner {
    private agent1;
    private agent2;
    private transport;
    private config;
    private contextManager;
    private tokenBudget;
    private totalTokensUsed;
    constructor(agent1: P2PAgent, agent2: P2PAgent, transport: BTSTransport, config?: P2PConversationConfig);
    /**
     * Run a P2P conversation between two agents
     */
    run(): Promise<P2PConversationResult>;
    /**
     * Create the conversation object
     */
    private createConversation;
    /**
     * Create the orchestrator
     */
    private createOrchestrator;
    /**
     * Request opening turn from Agent 1
     */
    private requestOpeningTurn;
    /**
     * Record token usage for budget tracking
     */
    private recordTokenUsage;
    /**
     * Check if we can continue within budget
     */
    private canContinue;
    /**
     * Check for termination signals in the conversation
     */
    private checkTerminationSignals;
    /**
     * Detect if the conversation is stagnating
     */
    private detectStagnation;
    /**
     * Calculate Jaccard similarity between two strings
     */
    private jaccardSimilarity;
}
export declare function createP2PConversation(agent1: P2PAgent, agent2: P2PAgent, transport: BTSTransport, config?: Partial<P2PConversationConfig>): P2PConversationRunner;
//# sourceMappingURL=p2p-conversation.d.ts.map