export type IntroductionState = 'not_started' | 'in_progress' | 'completed' | 'skipped';
export interface AgentIntroductionStatus {
    agentId: string;
    status: IntroductionState;
    questionsAsked: string[];
    questionsAnswered: string[];
    startedAt?: string;
    completedAt?: string;
    factsLearned: number;
    rulesLearned: number;
}
export interface IntroductionStatus {
    userId: string;
    agents: Record<string, AgentIntroductionStatus>;
    lastUpdated: string;
}
export interface IntroductionSummary {
    agentId: string;
    agentName: string;
    factsLearned: number;
    rulesLearned: number;
    completedAt: string;
}
/**
 * Gets the introduction status for all agents for a user
 */
export declare function getIntroductionStatus(userId: string): Promise<IntroductionStatus>;
/**
 * Gets introduction status for a specific agent
 */
export declare function getAgentIntroductionStatus(userId: string, agentId: string): Promise<AgentIntroductionStatus>;
/**
 * Updates introduction status for a specific agent
 */
export declare function updateAgentIntroductionStatus(userId: string, agentId: string, update: Partial<AgentIntroductionStatus>): Promise<IntroductionStatus>;
/**
 * Marks introduction as started for an agent
 */
export declare function startIntroduction(userId: string, agentId: string): Promise<AgentIntroductionStatus>;
/**
 * Marks a question as asked in the introduction
 */
export declare function markQuestionAsked(userId: string, agentId: string, questionId: string): Promise<void>;
/**
 * Marks a question as answered in the introduction
 */
export declare function markQuestionAnswered(userId: string, agentId: string, questionId: string): Promise<void>;
/**
 * Marks introduction as completed for an agent
 */
export declare function completeIntroduction(userId: string, agentId: string, factsLearned: number, rulesLearned: number): Promise<IntroductionSummary>;
/**
 * Skips introduction for an agent
 */
export declare function skipIntroduction(userId: string, agentId: string): Promise<AgentIntroductionStatus>;
/**
 * Checks if an agent needs introduction
 */
export declare function needsIntroduction(userId: string, agentId: string): Promise<boolean>;
/**
 * Gets the next question to ask during introduction
 */
export declare function getNextQuestion(agentId: string, questionsAsked: string[]): {
    id: string;
    question: string;
    followUp?: string;
} | null;
/**
 * Checks if all questions have been asked
 */
export declare function isIntroductionComplete(agentId: string, questionsAsked: string[]): boolean;
/**
 * Gets introduction progress (e.g., "2 of 5")
 */
export declare function getIntroductionProgress(agentId: string, questionsAsked: string[]): {
    current: number;
    total: number;
};
//# sourceMappingURL=introduction-service.d.ts.map