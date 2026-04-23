"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isReservedSlug = isReservedSlug;
exports.slugExists = slugExists;
exports.validateSlug = validateSlug;
exports.generateUniqueSlug = generateUniqueSlug;
exports.checkSlugAvailability = checkSlugAvailability;
const client_s3_1 = require("@aws-sdk/client-s3");
// S3 client - uses default credentials from environment/IAM role
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
});
const MEMORY_BUCKET = process.env.MEMORY_BUCKET || 'macp-dev-memories';
// -----------------------------------------------------------------------------
// Reserved Slugs
// -----------------------------------------------------------------------------
const RESERVED_SLUGS = new Set([
    'help',
    'about',
    'support',
    'admin',
    'api',
    'app',
    'auth',
    'login',
    'signup',
    'register',
    'settings',
    'profile',
    'dashboard',
    'agents',
    'agent',
    'public',
    'private',
    'shared',
    'macp',
    'null',
    'undefined',
    'test',
    'demo',
    'example',
    'system',
    'health',
    'status',
]);
// -----------------------------------------------------------------------------
// Slug Generation
// -----------------------------------------------------------------------------
/**
 * Generates a random alphanumeric string
 */
function generateRandomSuffix(length = 6) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
/**
 * Converts a string to a URL-friendly slug
 */
function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '') // Remove non-word chars (except spaces and hyphens)
        .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .replace(/^-+|-+$/g, '') // Trim hyphens from start and end
        .substring(0, 30); // Limit length
}
/**
 * Checks if a slug is reserved
 */
function isReservedSlug(slug) {
    return RESERVED_SLUGS.has(slug.toLowerCase());
}
/**
 * Checks if a slug already exists in S3
 */
async function slugExists(slug) {
    const key = `public-agents/${slug}.json`;
    try {
        await s3Client.send(new client_s3_1.HeadObjectCommand({
            Bucket: MEMORY_BUCKET,
            Key: key,
        }));
        return true;
    }
    catch (error) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            return false;
        }
        throw error;
    }
}
/**
 * Validates a custom slug
 * Returns { valid: true } or { valid: false, error: string }
 */
function validateSlug(slug) {
    // Check length
    if (slug.length < 3) {
        return { valid: false, error: 'Slug must be at least 3 characters' };
    }
    if (slug.length > 50) {
        return { valid: false, error: 'Slug must be 50 characters or less' };
    }
    // Check format (alphanumeric, hyphens, no leading/trailing hyphens)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/.test(slug) && slug.length > 2) {
        return { valid: false, error: 'Slug can only contain letters, numbers, and hyphens (not at start/end)' };
    }
    if (slug.length <= 2 && !/^[a-zA-Z0-9]+$/.test(slug)) {
        return { valid: false, error: 'Slug can only contain letters and numbers' };
    }
    // Check for reserved slugs
    if (isReservedSlug(slug)) {
        return { valid: false, error: 'This slug is reserved' };
    }
    return { valid: true };
}
/**
 * Generates a unique slug for an agent
 *
 * @param agentName - The agent's display name
 * @param customPrefix - Optional custom prefix provided by user
 * @returns A unique slug (e.g., "dr-smith-intake-a3kF9x")
 */
async function generateUniqueSlug(agentName, customPrefix) {
    const maxAttempts = 10;
    let attempts = 0;
    // Use custom prefix or derive from agent name
    const prefix = customPrefix ? slugify(customPrefix) : slugify(agentName);
    while (attempts < maxAttempts) {
        const suffix = generateRandomSuffix(6);
        const slug = prefix ? `${prefix}-${suffix}` : suffix;
        // Check if it's valid and available
        const validation = validateSlug(slug);
        if (!validation.valid) {
            attempts++;
            continue;
        }
        const exists = await slugExists(slug);
        if (!exists) {
            return slug;
        }
        attempts++;
    }
    // Fallback: use just a longer random string
    const fallbackSlug = `agent-${generateRandomSuffix(10)}`;
    return fallbackSlug;
}
/**
 * Checks if a custom slug is available
 */
async function checkSlugAvailability(slug) {
    // Validate format
    const validation = validateSlug(slug);
    if (!validation.valid) {
        // Generate a suggestion
        const suggestion = await generateUniqueSlug(slug);
        return {
            available: false,
            error: validation.error,
            suggestion,
        };
    }
    // Check if exists
    const exists = await slugExists(slug);
    if (exists) {
        const suggestion = await generateUniqueSlug(slug);
        return {
            available: false,
            error: 'This slug is already taken',
            suggestion,
        };
    }
    return { available: true };
}
//# sourceMappingURL=slug-generator.js.map