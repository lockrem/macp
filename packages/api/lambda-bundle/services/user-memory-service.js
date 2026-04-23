"use strict";
/**
 * User Memory Service
 *
 * Saves facts about a user to their personal memory storage (PostgreSQL).
 * These memories persist across devices and can be accessed by any of the user's agents.
 *
 * Storage: user_memory_facts table
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserFacts = getUserFacts;
exports.getUserProfile = getUserProfile;
exports.upsertProfileFacts = upsertProfileFacts;
exports.deleteFact = deleteFact;
exports.saveFactsToUserMemory = saveFactsToUserMemory;
exports.getFactsForPromptInjection = getFactsForPromptInjection;
const core_1 = require("@macp/core");
const drizzle_orm_1 = require("drizzle-orm");
const ulid_1 = require("ulid");
// -----------------------------------------------------------------------------
// Category Mapping
// -----------------------------------------------------------------------------
const CATEGORY_DISPLAY_NAMES = {
    identity: 'Personal Info',
    dietary: 'Dietary Preferences',
    health: 'Health Information',
    preferences: 'General Preferences',
    wishlist: 'Wishlist',
    financial: 'Financial Information',
    schedule: 'Scheduling Preferences',
    family: 'Family Information',
    work: 'Work & Career',
    general: 'General Information',
};
const FACT_CATEGORY_PATTERNS = [
    {
        category: 'identity',
        patterns: [
            /name\s*(is|:|=)/i,
            /called\s+\w+/i,
            /my name/i,
            /\bI'm\s+\w+\b/i,
            /phone|email|address|contact/i,
        ],
    },
    {
        category: 'dietary',
        patterns: [
            /allerg/i,
            /vegetarian|vegan|pescatarian/i,
            /gluten|dairy|nut|shellfish/i,
            /diet|eating|food preference/i,
            /kosher|halal/i,
            /seed oil/i,
            /intoleran/i,
        ],
    },
    {
        category: 'health',
        patterns: [
            /health|medical|condition/i,
            /medication|medicine|prescription/i,
            /doctor|physician|hospital/i,
            /symptom|diagnosis|treatment/i,
            /blood type/i,
            /health insurance|medical insurance/i,
        ],
    },
    {
        category: 'financial',
        patterns: [
            /mortgage|escrow|loan|refinance/i,
            /bank|banking|account/i,
            /invest|investment|portfolio|stock/i,
            /credit|debt|payment/i,
            /budget|savings|retirement/i,
            /insurance(?!\s*(health|medical))/i,
            /property|real estate|home buying/i,
            /interest rate|down payment|closing cost/i,
        ],
    },
    {
        category: 'wishlist',
        patterns: [
            /want(?:s|ed)?\s+(?:a|an|to)/i,
            /wish(?:list|es)?/i,
            /would love/i,
            /been wanting/i,
            /looking for.*to buy/i,
        ],
    },
    {
        category: 'preferences',
        patterns: [
            /prefer|like|enjoy|favorite/i,
            /love|hate|dislike/i,
            /style|taste/i,
            /morning person|night owl/i,
        ],
    },
    {
        category: 'schedule',
        patterns: [
            /schedule|availability/i,
            /morning|afternoon|evening/i,
            /weekend|weekday/i,
            /time zone|busy/i,
            /appointment|meeting/i,
        ],
    },
    {
        category: 'family',
        patterns: [
            /family|spouse|wife|husband|partner/i,
            /child|kid|son|daughter/i,
            /parent|mother|father|mom|dad/i,
            /sibling|brother|sister/i,
            /pet|dog|cat/i,
        ],
    },
    {
        category: 'work',
        patterns: [
            /work|job|career|profession/i,
            /company|employer|business/i,
            /office|remote|hybrid/i,
            /salary|income/i,
            /colleague|coworker|boss/i,
        ],
    },
];
/**
 * Determines the category for a fact based on its content
 */
function categorizeFact(factContent) {
    for (const cat of FACT_CATEGORY_PATTERNS) {
        if (cat.patterns.some(pattern => pattern.test(factContent))) {
            return cat.category;
        }
    }
    return 'general';
}
/**
 * Extracts a key from a fact string (e.g., "User's name is Arthur" -> "name")
 */
function extractFactKey(factContent) {
    const patterns = [
        /(?:user(?:'s)?|their|my)\s+(\w+(?:\s+\w+)?)\s+(?:is|are|=|:)/i,
        /has\s+(?:a|an)?\s*(\w+(?:\s+\w+)?)/i,
        /prefers?\s+(\w+(?:\s+\w+)?)/i,
        /(?:likes?|loves?|enjoys?)\s+(\w+(?:\s+\w+)?)/i,
        /allergic\s+to\s+(\w+)/i,
    ];
    for (const pattern of patterns) {
        const match = factContent.match(pattern);
        if (match && match[1]) {
            return match[1].toLowerCase().replace(/\s+/g, '_');
        }
    }
    const words = factContent.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => !['user', 'the', 'a', 'an', 'is', 'are', 'has', 'have', 'their', 'my'].includes(w))
        .slice(0, 3);
    return words.join('_') || 'unknown';
}
function getCategoryDisplayName(category) {
    return CATEGORY_DISPLAY_NAMES[category] || category
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
// -----------------------------------------------------------------------------
// Database Operations
// -----------------------------------------------------------------------------
/**
 * Get all facts for a user, optionally filtered by category
 */
async function getUserFacts(userId, category) {
    const db = (0, core_1.getDatabase)();
    const conditions = category
        ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.userMemoryFacts.userId, userId), (0, drizzle_orm_1.eq)(core_1.userMemoryFacts.category, category))
        : (0, drizzle_orm_1.eq)(core_1.userMemoryFacts.userId, userId);
    const rows = await db.select().from(core_1.userMemoryFacts)
        .where(conditions)
        .orderBy((0, drizzle_orm_1.desc)(core_1.userMemoryFacts.learnedAt));
    return rows;
}
/**
 * Get user profile: facts grouped by category, formatted for display
 */
async function getUserProfile(userId) {
    const facts = await getUserFacts(userId);
    // Group by category
    const byCategory = new Map();
    for (const fact of facts) {
        if (!byCategory.has(fact.category)) {
            byCategory.set(fact.category, []);
        }
        byCategory.get(fact.category).push(fact);
    }
    // Build sections in a consistent order
    const categoryOrder = ['identity', 'dietary', 'wishlist', 'preferences', 'health', 'family', 'work', 'financial', 'schedule', 'general'];
    const sections = [];
    for (const cat of categoryOrder) {
        const catFacts = byCategory.get(cat);
        if (catFacts && catFacts.length > 0) {
            sections.push({
                category: cat,
                displayName: getCategoryDisplayName(cat),
                facts: catFacts,
            });
        }
    }
    // Add any remaining categories not in the order
    for (const [cat, catFacts] of byCategory) {
        if (!categoryOrder.includes(cat) && catFacts.length > 0) {
            sections.push({
                category: cat,
                displayName: getCategoryDisplayName(cat),
                facts: catFacts,
            });
        }
    }
    return {
        userId,
        sections,
        totalFacts: facts.length,
    };
}
/**
 * Upsert facts in a category (for manual profile edits)
 */
async function upsertProfileFacts(userId, category, facts) {
    const db = (0, core_1.getDatabase)();
    const now = new Date();
    let saved = 0;
    for (const { key, value } of facts) {
        // Check if fact with same key exists in this category
        const existing = await db.select().from(core_1.userMemoryFacts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.userMemoryFacts.userId, userId), (0, drizzle_orm_1.eq)(core_1.userMemoryFacts.category, category), (0, drizzle_orm_1.eq)(core_1.userMemoryFacts.key, key)))
            .limit(1);
        if (existing.length > 0) {
            // Update existing fact
            await db.update(core_1.userMemoryFacts)
                .set({
                value: value,
                learnedAt: now,
            })
                .where((0, drizzle_orm_1.eq)(core_1.userMemoryFacts.id, existing[0].id));
        }
        else {
            // Insert new fact
            await db.insert(core_1.userMemoryFacts).values({
                id: (0, ulid_1.ulid)(),
                userId,
                category,
                key,
                value: value,
                confidence: 'high',
                learnedFrom: 'manual edit',
                learnedAt: now,
            });
        }
        saved++;
    }
    console.log(`[UserMemory] Upserted ${saved} facts for user ${userId} in category ${category}`);
    return saved;
}
/**
 * Delete a specific fact
 */
async function deleteFact(userId, factId) {
    const db = (0, core_1.getDatabase)();
    const result = await db.delete(core_1.userMemoryFacts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.userMemoryFacts.id, factId), (0, drizzle_orm_1.eq)(core_1.userMemoryFacts.userId, userId)));
    return true;
}
/**
 * Saves extracted facts to the user's personal memory storage.
 * Facts are automatically categorized and stored in appropriate categories.
 *
 * @param userId - The user's ID
 * @param facts - Array of fact strings (e.g., ["User's name is Arthur", "User has a gluten allergy"])
 * @param source - Where the facts were learned (e.g., "conversation with Mario's Ristorante")
 * @returns Number of facts saved
 */
async function saveFactsToUserMemory(userId, facts, source) {
    if (!userId || facts.length === 0) {
        return 0;
    }
    const db = (0, core_1.getDatabase)();
    const now = new Date();
    let totalSaved = 0;
    for (const factContent of facts) {
        const category = categorizeFact(factContent);
        const factKey = extractFactKey(factContent);
        // Check for existing fact with same key in same category
        const existing = await db.select().from(core_1.userMemoryFacts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.userMemoryFacts.userId, userId), (0, drizzle_orm_1.eq)(core_1.userMemoryFacts.category, category), (0, drizzle_orm_1.eq)(core_1.userMemoryFacts.key, factKey)))
            .limit(1);
        if (existing.length > 0) {
            // Update existing fact
            await db.update(core_1.userMemoryFacts)
                .set({
                value: factContent,
                learnedFrom: source,
                learnedAt: now,
                supersedes: existing[0].id,
            })
                .where((0, drizzle_orm_1.eq)(core_1.userMemoryFacts.id, existing[0].id));
        }
        else {
            // Insert new fact
            await db.insert(core_1.userMemoryFacts).values({
                id: (0, ulid_1.ulid)(),
                userId,
                category,
                key: factKey,
                value: factContent,
                confidence: 'high',
                learnedFrom: source,
                learnedAt: now,
            });
        }
        totalSaved++;
    }
    console.log(`[UserMemory] Saved ${totalSaved} facts for user ${userId}`);
    return totalSaved;
}
/**
 * Get all facts formatted as strings for agent prompt injection
 */
async function getFactsForPromptInjection(userId) {
    const facts = await getUserFacts(userId);
    return facts.map(f => typeof f.value === 'string' ? f.value : `${f.key}: ${JSON.stringify(f.value)}`);
}
//# sourceMappingURL=user-memory-service.js.map