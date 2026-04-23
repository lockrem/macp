/**
 * User Memory Service
 *
 * Saves facts about a user to their personal memory storage.
 * These memories persist across devices and can be accessed by any of the user's agents.
 *
 * Storage: memories/{userId}/{category}.json
 */
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
//# sourceMappingURL=user-memory-service.d.ts.map