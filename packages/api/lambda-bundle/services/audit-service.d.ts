/**
 * Audit Service
 *
 * Provides structured logging for conversation events to enable
 * debugging and review of agent decision-making processes.
 */
export type AuditEventType = 'conversation_start' | 'user_message' | 'person_detected' | 'memory_lookup' | 'relationship_query' | 'memory_saved' | 'bidding_round' | 'orchestration_decision' | 'agent_response' | 'task_match' | 'task_created' | 'task_completed' | 'host_response' | 'conversation_end';
export interface BiddingResultAudit {
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
    hasMatchingTask: boolean;
    reasoning?: string;
}
export interface AuditEvent {
    id: string;
    timestamp: string;
    type: AuditEventType;
    conversationId: string;
    hostAgentId?: string;
    hostAgentName?: string;
    data: {
        message?: string;
        personName?: string;
        relationshipFound?: string;
        relationshipUnknown?: boolean;
        memoriesChecked?: string[];
        memoriesFound?: string[];
        biddingResults?: BiddingResultAudit[];
        participatingAgents?: string[];
        decision?: string;
        reason?: string;
        agentId?: string;
        agentName?: string;
        agentEmoji?: string;
        response?: string;
        taskId?: string;
        taskDescription?: string;
        matchedHostAgent?: string;
        task?: {
            id: string;
            description: string;
            category: string;
            status: string;
        };
        completionSummary?: string;
        hostResponse?: string;
        metadata?: Record<string, any>;
    };
}
export interface ConversationAudit {
    conversationId: string;
    startedAt: string;
    endedAt?: string;
    hostAgentId?: string;
    hostAgentName?: string;
    userAgentNames: string[];
    totalTurns: number;
    events: AuditEvent[];
}
/**
 * Start auditing a new conversation
 */
export declare function startConversationAudit(conversationId: string, hostAgentId?: string, hostAgentName?: string, userAgentNames?: string[]): void;
/**
 * Log an audit event for a conversation
 */
export declare function logAuditEvent(conversationId: string, type: AuditEventType, data: AuditEvent['data'], hostAgentId?: string, hostAgentName?: string): void;
/**
 * Log bidding results
 */
export declare function logBiddingResults(conversationId: string, results: BiddingResultAudit[], participatingAgents: string[]): void;
/**
 * Log a user message with person detection
 */
export declare function logUserMessage(conversationId: string, message: string, personDetection?: {
    personName?: string;
    relationshipFound?: string;
    relationshipUnknown?: boolean;
    memoriesChecked?: string[];
}): void;
/**
 * Log an agent response
 */
export declare function logAgentResponse(conversationId: string, agentId: string, agentName: string, agentEmoji: string, response: string): void;
/**
 * Log host response
 */
export declare function logHostResponse(conversationId: string, response: string): void;
/**
 * Log orchestration decision
 */
export declare function logOrchestrationDecision(conversationId: string, decision: string, reason: string): void;
/**
 * Log task match
 */
export declare function logTaskMatch(conversationId: string, taskId: string, taskDescription: string, matchedHostAgent: string): void;
/**
 * Log memory saved
 */
export declare function logMemorySaved(conversationId: string, memoryContent: string, category: string): void;
/**
 * End conversation audit and persist to S3
 */
export declare function endConversationAudit(conversationId: string): Promise<void>;
/**
 * Flush current buffer to S3 without ending (for long conversations)
 */
export declare function flushAuditBuffer(conversationId: string): Promise<void>;
/**
 * List all conversation audits
 */
export declare function listConversationAudits(limit?: number): Promise<Array<{
    conversationId: string;
    startedAt: string;
    hostAgentName?: string;
    totalTurns: number;
}>>;
/**
 * Get a specific conversation audit
 */
export declare function getConversationAudit(conversationId: string): Promise<ConversationAudit | null>;
//# sourceMappingURL=audit-service.d.ts.map