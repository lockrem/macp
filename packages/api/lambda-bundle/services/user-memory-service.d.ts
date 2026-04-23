/**
 * User Memory Service
 *
 * Saves facts about a user to their personal memory storage (PostgreSQL).
 * These memories persist across devices and can be accessed by any of the user's agents.
 *
 * Storage: user_memory_facts table
 */
export interface MemoryFact {
    id: string;
    userId: string;
    category: string;
    key: string;
    value: string | number | string[] | Record<string, unknown>;
    confidence: string;
    learnedFrom: string | null;
    learnedAt: Date;
    supersedes: string | null;
    createdAt: Date;
}
export interface ProfileSection {
    category: string;
    displayName: string;
    facts: MemoryFact[];
}
export interface UserProfile {
    userId: string;
    sections: ProfileSection[];
    totalFacts: number;
}
/**
 * Get all facts for a user, optionally filtered by category
 */
export declare function getUserFacts(userId: string, category?: string): Promise<MemoryFact[]>;
/**
 * Get user profile: facts grouped by category, formatted for display
 */
export declare function getUserProfile(userId: string): Promise<UserProfile>;
/**
 * Upsert facts in a category (for manual profile edits)
 */
export declare function upsertProfileFacts(userId: string, category: string, facts: Array<{
    key: string;
    value: string | number | string[] | Record<string, unknown>;
}>): Promise<number>;
/**
 * Delete a specific fact
 */
export declare function deleteFact(userId: string, factId: string): Promise<boolean>;
/**
 * Saves extracted facts to the user's personal memory storage.
 * Facts are automatically categorized and stored in appropriate categories.
 *
 * @param userId - The user's ID
 * @param facts - Array of fact strings (e.g., ["User's name is Arthur", "User has a gluten allergy"])
 * @param source - Where the facts were learned (e.g., "conversation with Mario's Ristorante")
 * @returns Number of facts saved
 */
export declare function saveFactsToUserMemory(userId: string, facts: string[], source: string): Promise<number>;
/**
 * Get all facts formatted as strings for agent prompt injection
 */
export declare function getFactsForPromptInjection(userId: string): Promise<string[]>;
//# sourceMappingURL=user-memory-service.d.ts.map