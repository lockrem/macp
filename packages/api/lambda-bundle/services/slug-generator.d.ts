/**
 * Checks if a slug is reserved
 */
export declare function isReservedSlug(slug: string): boolean;
/**
 * Checks if a slug already exists in S3
 */
export declare function slugExists(slug: string): Promise<boolean>;
/**
 * Validates a custom slug
 * Returns { valid: true } or { valid: false, error: string }
 */
export declare function validateSlug(slug: string): {
    valid: boolean;
    error?: string;
};
/**
 * Generates a unique slug for an agent
 *
 * @param agentName - The agent's display name
 * @param customPrefix - Optional custom prefix provided by user
 * @returns A unique slug (e.g., "dr-smith-intake-a3kF9x")
 */
export declare function generateUniqueSlug(agentName: string, customPrefix?: string): Promise<string>;
/**
 * Checks if a custom slug is available
 */
export declare function checkSlugAvailability(slug: string): Promise<{
    available: boolean;
    error?: string;
    suggestion?: string;
}>;
//# sourceMappingURL=slug-generator.d.ts.map