"use strict";
/**
 * User Memory Service
 *
 * Saves facts about a user to their personal memory storage.
 * These memories persist across devices and can be accessed by any of the user's agents.
 *
 * Storage: memories/{userId}/{category}.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveFactsToUserMemory = saveFactsToUserMemory;
const client_s3_1 = require("@aws-sdk/client-s3");
const ulid_1 = require("ulid");
const s3Client = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const MEMORY_BUCKET = process.env.MEMORY_BUCKET || 'macp-dev-memories';
// -----------------------------------------------------------------------------
// Category Mapping
// -----------------------------------------------------------------------------
const FACT_CATEGORY_PATTERNS = [
    {
        category: 'identity',
        displayName: 'Personal Identity',
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
        displayName: 'Dietary Preferences',
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
        displayName: 'Health Information',
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
        displayName: 'Financial Information',
        patterns: [
            /mortgage|escrow|loan|refinance/i,
            /bank|banking|account/i,
            /invest|investment|portfolio|stock/i,
            /credit|debt|payment/i,
            /budget|savings|retirement/i,
            /insurance(?!\s*(health|medical))/i, // insurance but not health/medical insurance
            /property|real estate|home buying/i,
            /interest rate|down payment|closing cost/i,
        ],
    },
    {
        category: 'preferences',
        displayName: 'General Preferences',
        patterns: [
            /prefer|like|enjoy|favorite/i,
            /love|hate|dislike/i,
            /style|taste/i,
            /morning person|night owl/i,
        ],
    },
    {
        category: 'schedule',
        displayName: 'Scheduling Preferences',
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
        displayName: 'Family Information',
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
        displayName: 'Work & Career',
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
function categorizeФact(factContent) {
    for (const cat of FACT_CATEGORY_PATTERNS) {
        if (cat.patterns.some(pattern => pattern.test(factContent))) {
            return { category: cat.category, displayName: cat.displayName };
        }
    }
    return { category: 'general', displayName: 'General Information' };
}
/**
 * Extracts a key from a fact string (e.g., "User's name is Arthur" -> "name")
 */
function extractFactKey(factContent) {
    // Common patterns
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
    // Fallback: use first few significant words
    const words = factContent.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => !['user', 'the', 'a', 'an', 'is', 'are', 'has', 'have', 'their', 'my'].includes(w))
        .slice(0, 3);
    return words.join('_') || 'unknown';
}
// -----------------------------------------------------------------------------
// Storage Operations
// -----------------------------------------------------------------------------
async function getMemoryCategory(userId, category) {
    const key = `memories/${userId}/${category}.json`;
    try {
        const response = await s3Client.send(new client_s3_1.GetObjectCommand({
            Bucket: MEMORY_BUCKET,
            Key: key,
        }));
        const body = await response.Body?.transformToString();
        if (!body)
            return null;
        return JSON.parse(body);
    }
    catch (error) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
            return null;
        }
        throw error;
    }
}
async function saveMemoryCategory(category) {
    const key = `memories/${category.userId}/${category.category}.json`;
    await s3Client.send(new client_s3_1.PutObjectCommand({
        Bucket: MEMORY_BUCKET,
        Key: key,
        Body: JSON.stringify(category, null, 2),
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
    }));
}
async function getMemoryIndex(userId) {
    const key = `memories/${userId}/_index.json`;
    try {
        const response = await s3Client.send(new client_s3_1.GetObjectCommand({
            Bucket: MEMORY_BUCKET,
            Key: key,
        }));
        const body = await response.Body?.transformToString();
        if (!body)
            return null;
        return JSON.parse(body);
    }
    catch (error) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
            return null;
        }
        throw error;
    }
}
async function saveMemoryIndex(index) {
    const key = `memories/${index.userId}/_index.json`;
    await s3Client.send(new client_s3_1.PutObjectCommand({
        Bucket: MEMORY_BUCKET,
        Key: key,
        Body: JSON.stringify(index, null, 2),
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
    }));
}
// -----------------------------------------------------------------------------
// Main Export
// -----------------------------------------------------------------------------
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
    const now = new Date().toISOString();
    // Group facts by category
    const factsByCategory = new Map();
    for (const factContent of facts) {
        const { category, displayName } = categorizeФact(factContent);
        const factKey = extractFactKey(factContent);
        const fact = {
            id: (0, ulid_1.ulid)(),
            key: factKey,
            value: factContent,
            confidence: 'high',
            learnedFrom: source,
            learnedAt: now,
        };
        if (!factsByCategory.has(category)) {
            factsByCategory.set(category, { displayName, facts: [] });
        }
        factsByCategory.get(category).facts.push(fact);
    }
    // Save each category
    let totalSaved = 0;
    for (const [categoryName, { displayName, facts: newFacts }] of factsByCategory) {
        // Get or create category
        let category = await getMemoryCategory(userId, categoryName);
        if (!category) {
            category = {
                category: categoryName,
                displayName,
                userId,
                lastUpdated: now,
                summary: '',
                facts: [],
            };
        }
        // Add new facts (avoid duplicates by key)
        const existingKeys = new Set(category.facts.map(f => f.key));
        for (const newFact of newFacts) {
            if (!existingKeys.has(newFact.key)) {
                category.facts.push(newFact);
                existingKeys.add(newFact.key);
                totalSaved++;
            }
            else {
                // Update existing fact with newer value
                const existingIndex = category.facts.findIndex(f => f.key === newFact.key);
                if (existingIndex !== -1) {
                    category.facts[existingIndex] = newFact;
                    totalSaved++;
                }
            }
        }
        category.lastUpdated = now;
        // Generate summary
        const factSummaries = category.facts.map(f => typeof f.value === 'string' ? f.value : JSON.stringify(f.value));
        category.summary = factSummaries.slice(0, 5).join('. ') + (factSummaries.length > 5 ? '...' : '');
        await saveMemoryCategory(category);
    }
    // Update index
    let index = await getMemoryIndex(userId);
    if (!index) {
        index = {
            userId,
            categories: [],
            totalFacts: 0,
            lastUpdated: now,
        };
    }
    // Update category entries in index
    for (const [categoryName, { displayName }] of factsByCategory) {
        const category = await getMemoryCategory(userId, categoryName);
        if (!category)
            continue;
        const existingIndex = index.categories.findIndex(c => c.name === categoryName);
        const catMeta = {
            name: categoryName,
            displayName,
            factCount: category.facts.length,
            lastUpdated: now,
        };
        if (existingIndex !== -1) {
            index.categories[existingIndex] = catMeta;
        }
        else {
            index.categories.push(catMeta);
        }
    }
    index.totalFacts = index.categories.reduce((sum, c) => sum + c.factCount, 0);
    index.lastUpdated = now;
    await saveMemoryIndex(index);
    console.log(`[UserMemory] Saved ${totalSaved} facts for user ${userId} across ${factsByCategory.size} categories`);
    return totalSaved;
}
//# sourceMappingURL=user-memory-service.js.map