/**
 * Visitor Memory Service
 *
 * Manages per-visitor memories for public agents.
 * Each public agent can remember facts about individual visitors,
 * enabling personalized experiences on return visits.
 *
 * Storage structure: visitor-memories/{agentId}/{visitorId}.json
 */
export interface VisitorMemory {
    visitorId: string;
    agentId: string;
    displayName?: string;
    memories: VisitorMemoryEntry[];
    preferences: Record<string, string>;
    visitCount: number;
    firstVisit: string;
    lastVisit: string;
    updatedAt: string;
}
export interface VisitorMemoryEntry {
    id: string;
    content: string;
    category: string;
    confidence: 'high' | 'medium' | 'low';
    source: 'conversation' | 'explicit' | 'inferred';
    createdAt: string;
    sessionId?: string;
}
/**
 * Gets visitor memory for a specific visitor at a specific public agent
 */
export declare function getVisitorMemory(agentId: string, visitorId: string): Promise<VisitorMemory | null>;
/**
 * Saves visitor memory
 */
export declare function saveVisitorMemory(memory: VisitorMemory): Promise<void>;
/**
 * Creates or updates visitor memory with new entries from a conversation
 */
export declare function updateVisitorMemoryFromSession(agentId: string, visitorId: string, sessionId: string, extractedMemories: string[], extractedPreferences: Record<string, string>, visitorName?: string): Promise<VisitorMemory>;
/**
 * Formats visitor memory as context for the host agent
 */
export declare function formatVisitorMemoryAsContext(memory: VisitorMemory): string;
export interface MemoryDistribution {
    fact: string;
    agentId: string;
    agentName: string;
    category: string;
    reasoning: string;
}
/**
 * Determines which of the user's agents should store each extracted fact
 */
export declare function distributeMemoriesToAgents(facts: string[], userAgents: Array<{
    id: string;
    name: string;
    description?: string;
    intents: string[];
    memoryCategories?: string[];
}>, apiKey: string): Promise<MemoryDistribution[]>;
//# sourceMappingURL=visitor-memory-service.d.ts.map