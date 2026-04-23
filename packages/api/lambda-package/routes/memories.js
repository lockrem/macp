"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMemoryRoutes = registerMemoryRoutes;
const zod_1 = require("zod");
const client_s3_1 = require("@aws-sdk/client-s3");
const shared_1 = require("@macp/shared");
// S3 client - uses default credentials from environment/IAM role
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
});
const MEMORY_BUCKET = process.env.MEMORY_BUCKET || 'macp-dev-memories';
// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------
const memoryFactSchema = zod_1.z.object({
    id: zod_1.z.string(),
    key: zod_1.z.string(),
    value: zod_1.z.union([
        zod_1.z.string(),
        zod_1.z.number(),
        zod_1.z.array(zod_1.z.string()),
        zod_1.z.record(zod_1.z.unknown()),
    ]),
    confidence: zod_1.z.enum(['high', 'medium', 'low']),
    learnedFrom: zod_1.z.string(),
    learnedAt: zod_1.z.string(),
    supersedes: zod_1.z.string().optional(),
});
const memoryCategorySchema = zod_1.z.object({
    category: zod_1.z.string(),
    displayName: zod_1.z.string(),
    userId: zod_1.z.string(),
    lastUpdated: zod_1.z.string(),
    summary: zod_1.z.string(),
    facts: zod_1.z.array(memoryFactSchema),
});
// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------
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
        Metadata: {
            'user-id': category.userId,
            'category': category.category,
            'updated-at': category.lastUpdated,
        },
    }));
}
// -----------------------------------------------------------------------------
// Cache Functions
// -----------------------------------------------------------------------------
async function getMemoryCache(userId) {
    const key = `memories/${userId}/_cache.json`;
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
async function saveMemoryCache(cache) {
    const key = `memories/${cache.userId}/_cache.json`;
    await s3Client.send(new client_s3_1.PutObjectCommand({
        Bucket: MEMORY_BUCKET,
        Key: key,
        Body: JSON.stringify(cache, null, 2),
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
    }));
}
/**
 * Regenerates the memory cache from all category files
 */
async function regenerateCache(userId) {
    const index = await getMemoryIndex(userId);
    const now = new Date().toISOString();
    if (!index || index.categories.length === 0) {
        const emptyCache = {
            userId,
            version: 1,
            generatedAt: now,
            factIndex: {},
            semanticTags: {},
            availableCategories: [],
            quickSummary: 'No information recorded yet.',
            totalFacts: 0,
        };
        await saveMemoryCache(emptyCache);
        return emptyCache;
    }
    // Load all categories and build the fact index
    const factIndex = {};
    const categorySummaries = [];
    for (const catMeta of index.categories) {
        const category = await getMemoryCategory(userId, catMeta.name);
        if (!category)
            continue;
        for (const fact of category.facts) {
            factIndex[fact.key] = {
                category: catMeta.name,
                confidence: fact.confidence,
                updatedAt: fact.learnedAt,
                valueType: getValueType(fact.value),
                preview: getValuePreview(fact.value),
            };
        }
        if (category.summary) {
            categorySummaries.push(category.summary);
        }
    }
    // Build semantic tags based on available facts
    const semanticTags = {};
    const factKeys = Object.keys(factIndex);
    for (const [tag, relatedKeys] of Object.entries(shared_1.DEFAULT_SEMANTIC_TAGS)) {
        const matchingKeys = relatedKeys.filter(k => factKeys.includes(k));
        if (matchingKeys.length > 0) {
            semanticTags[tag] = matchingKeys;
        }
    }
    const cache = {
        userId,
        version: 1,
        generatedAt: now,
        factIndex,
        semanticTags,
        availableCategories: index.categories.map(c => c.name),
        quickSummary: categorySummaries.join(' ') || 'Information available across multiple categories.',
        totalFacts: index.totalFacts,
    };
    await saveMemoryCache(cache);
    return cache;
}
function getValueType(value) {
    if (Array.isArray(value))
        return 'array';
    if (typeof value === 'number')
        return 'number';
    if (typeof value === 'object' && value !== null)
        return 'object';
    return 'string';
}
function getValuePreview(value) {
    if (Array.isArray(value)) {
        if (value.length === 0)
            return '[]';
        if (value.length <= 3)
            return value.join(', ');
        return `${value.slice(0, 2).join(', ')} (+${value.length - 2} more)`;
    }
    if (typeof value === 'object' && value !== null) {
        const keys = Object.keys(value);
        return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
    }
    const str = String(value);
    return str.length > 50 ? str.slice(0, 47) + '...' : str;
}
/**
 * Checks fact availability against the cache
 */
function checkFactAvailability(cache, queries) {
    const availability = {};
    const categoriesToLoad = new Set();
    const unavailable = [];
    for (const query of queries) {
        const normalizedQuery = query.toLowerCase().replace(/\s+/g, '_');
        // Direct fact key match
        if (cache.factIndex[normalizedQuery]) {
            const entry = cache.factIndex[normalizedQuery];
            availability[query] = {
                available: true,
                category: entry.category,
                confidence: entry.confidence,
                preview: entry.preview,
            };
            categoriesToLoad.add(entry.category);
            continue;
        }
        // Semantic tag match
        if (cache.semanticTags[normalizedQuery]) {
            const relatedKeys = cache.semanticTags[normalizedQuery];
            // Return the first available fact from the semantic group
            for (const key of relatedKeys) {
                if (cache.factIndex[key]) {
                    const entry = cache.factIndex[key];
                    availability[query] = {
                        available: true,
                        category: entry.category,
                        confidence: entry.confidence,
                        preview: `Via ${key}: ${entry.preview}`,
                    };
                    categoriesToLoad.add(entry.category);
                    break;
                }
            }
            if (!availability[query]) {
                availability[query] = { available: false };
                unavailable.push(query);
            }
            continue;
        }
        // Partial match on fact keys
        const partialMatches = Object.keys(cache.factIndex).filter(k => k.includes(normalizedQuery) || normalizedQuery.includes(k));
        if (partialMatches.length > 0) {
            const key = partialMatches[0];
            const entry = cache.factIndex[key];
            availability[query] = {
                available: true,
                category: entry.category,
                confidence: entry.confidence,
                preview: `Via ${key}: ${entry.preview}`,
            };
            categoriesToLoad.add(entry.category);
            continue;
        }
        // Not found
        availability[query] = { available: false };
        unavailable.push(query);
    }
    return {
        availability,
        categoriesToLoad: Array.from(categoriesToLoad),
        unavailable,
    };
}
// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
function registerMemoryRoutes(app) {
    // -------------------------------------------------------------------------
    // Get memory index (list all categories)
    // -------------------------------------------------------------------------
    app.get('/api/memories', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        try {
            const index = await getMemoryIndex(userId);
            if (!index) {
                // Return empty index for new users
                return {
                    userId,
                    categories: [],
                    totalFacts: 0,
                    lastUpdated: new Date().toISOString(),
                };
            }
            return index;
        }
        catch (error) {
            app.log.error({ err: error, userId }, 'Failed to get memory index');
            reply.code(500);
            return { error: 'Failed to retrieve memory index' };
        }
    });
    // -------------------------------------------------------------------------
    // Get a specific memory category
    // -------------------------------------------------------------------------
    app.get('/api/memories/:category', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { category } = req.params;
        try {
            const memoryCategory = await getMemoryCategory(userId, category);
            if (!memoryCategory) {
                reply.code(404);
                return { error: 'Memory category not found' };
            }
            return memoryCategory;
        }
        catch (error) {
            app.log.error({ err: error, userId, category }, 'Failed to get memory category');
            reply.code(500);
            return { error: 'Failed to retrieve memory category' };
        }
    });
    // -------------------------------------------------------------------------
    // Get multiple memory categories (for context injection)
    // -------------------------------------------------------------------------
    app.post('/api/memories/bulk', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { categories } = zod_1.z.object({
            categories: zod_1.z.array(zod_1.z.string()),
        }).parse(req.body);
        try {
            const results = {};
            await Promise.all(categories.map(async (category) => {
                results[category] = await getMemoryCategory(userId, category);
            }));
            // Build combined summary for prompt injection
            const summaries = Object.entries(results)
                .filter(([_, cat]) => cat !== null)
                .map(([name, cat]) => `### ${cat.displayName}\n${cat.summary}`)
                .join('\n\n');
            return {
                categories: results,
                combinedSummary: summaries || 'No memory available.',
            };
        }
        catch (error) {
            app.log.error({ err: error, userId }, 'Failed to get bulk memories');
            reply.code(500);
            return { error: 'Failed to retrieve memories' };
        }
    });
    // -------------------------------------------------------------------------
    // Add facts to a category (creates category if doesn't exist)
    // -------------------------------------------------------------------------
    app.post('/api/memories/:category/facts', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { category } = req.params;
        const body = zod_1.z.object({
            displayName: zod_1.z.string().optional(),
            facts: zod_1.z.array(memoryFactSchema),
            regenerateSummary: zod_1.z.boolean().default(true),
        }).parse(req.body);
        try {
            const now = new Date().toISOString();
            // Get or create category
            let memoryCategory = await getMemoryCategory(userId, category);
            if (!memoryCategory) {
                memoryCategory = {
                    category,
                    displayName: body.displayName || formatCategoryName(category),
                    userId,
                    lastUpdated: now,
                    summary: '',
                    facts: [],
                };
            }
            // Add new facts (handling supersedes for updates)
            for (const newFact of body.facts) {
                // If this fact supersedes another, mark old one
                if (newFact.supersedes) {
                    const oldIndex = memoryCategory.facts.findIndex(f => f.id === newFact.supersedes);
                    if (oldIndex !== -1) {
                        memoryCategory.facts.splice(oldIndex, 1);
                    }
                }
                // Check if fact with same key exists
                const existingIndex = memoryCategory.facts.findIndex(f => f.key === newFact.key);
                if (existingIndex !== -1) {
                    // Update existing fact
                    memoryCategory.facts[existingIndex] = newFact;
                }
                else {
                    // Add new fact
                    memoryCategory.facts.push(newFact);
                }
            }
            memoryCategory.lastUpdated = now;
            // Regenerate summary if requested
            if (body.regenerateSummary) {
                memoryCategory.summary = generateCategorySummary(memoryCategory);
            }
            // Save category
            await saveMemoryCategory(memoryCategory);
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
            // Update category in index
            const catIndex = index.categories.findIndex(c => c.name === category);
            const catMeta = {
                name: category,
                displayName: memoryCategory.displayName,
                factCount: memoryCategory.facts.length,
                lastUpdated: now,
            };
            if (catIndex !== -1) {
                index.categories[catIndex] = catMeta;
            }
            else {
                index.categories.push(catMeta);
            }
            index.totalFacts = index.categories.reduce((sum, c) => sum + c.factCount, 0);
            index.lastUpdated = now;
            await saveMemoryIndex(index);
            // Regenerate cache with new facts
            const cache = await regenerateCache(userId);
            app.log.info({ userId, category, factCount: body.facts.length }, 'Added facts to memory');
            return {
                category: memoryCategory,
                index,
                cache,
            };
        }
        catch (error) {
            app.log.error({ err: error, userId, category }, 'Failed to add facts');
            reply.code(500);
            return { error: 'Failed to add facts to memory' };
        }
    });
    // -------------------------------------------------------------------------
    // Update category summary
    // -------------------------------------------------------------------------
    app.post('/api/memories/:category/summary', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { category } = req.params;
        const body = zod_1.z.object({
            summary: zod_1.z.string(),
        }).parse(req.body);
        try {
            const memoryCategory = await getMemoryCategory(userId, category);
            if (!memoryCategory) {
                reply.code(404);
                return { error: 'Memory category not found' };
            }
            memoryCategory.summary = body.summary;
            memoryCategory.lastUpdated = new Date().toISOString();
            await saveMemoryCategory(memoryCategory);
            return { success: true, summary: memoryCategory.summary };
        }
        catch (error) {
            app.log.error({ err: error, userId, category }, 'Failed to update summary');
            reply.code(500);
            return { error: 'Failed to update summary' };
        }
    });
    // -------------------------------------------------------------------------
    // Delete a memory category
    // -------------------------------------------------------------------------
    app.delete('/api/memories/:category', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { category } = req.params;
        try {
            const key = `memories/${userId}/${category}.json`;
            await s3Client.send(new client_s3_1.DeleteObjectCommand({
                Bucket: MEMORY_BUCKET,
                Key: key,
            }));
            // Update index
            const index = await getMemoryIndex(userId);
            if (index) {
                index.categories = index.categories.filter(c => c.name !== category);
                index.totalFacts = index.categories.reduce((sum, c) => sum + c.factCount, 0);
                index.lastUpdated = new Date().toISOString();
                await saveMemoryIndex(index);
            }
            app.log.info({ userId, category }, 'Deleted memory category');
            return { success: true };
        }
        catch (error) {
            app.log.error({ err: error, userId, category }, 'Failed to delete memory category');
            reply.code(500);
            return { error: 'Failed to delete memory category' };
        }
    });
    // -------------------------------------------------------------------------
    // Delete a specific fact from a category
    // -------------------------------------------------------------------------
    app.delete('/api/memories/:category/facts/:factId', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { category, factId } = req.params;
        try {
            const memoryCategory = await getMemoryCategory(userId, category);
            if (!memoryCategory) {
                reply.code(404);
                return { error: 'Memory category not found' };
            }
            const factIndex = memoryCategory.facts.findIndex(f => f.id === factId);
            if (factIndex === -1) {
                reply.code(404);
                return { error: 'Fact not found' };
            }
            memoryCategory.facts.splice(factIndex, 1);
            memoryCategory.lastUpdated = new Date().toISOString();
            memoryCategory.summary = generateCategorySummary(memoryCategory);
            await saveMemoryCategory(memoryCategory);
            // Update index
            const index = await getMemoryIndex(userId);
            if (index) {
                const catIndex = index.categories.findIndex(c => c.name === category);
                if (catIndex !== -1) {
                    index.categories[catIndex].factCount = memoryCategory.facts.length;
                    index.categories[catIndex].lastUpdated = memoryCategory.lastUpdated;
                }
                index.totalFacts = index.categories.reduce((sum, c) => sum + c.factCount, 0);
                index.lastUpdated = memoryCategory.lastUpdated;
                await saveMemoryIndex(index);
            }
            return { success: true };
        }
        catch (error) {
            app.log.error({ err: error, userId, category, factId }, 'Failed to delete fact');
            reply.code(500);
            return { error: 'Failed to delete fact' };
        }
    });
    // -------------------------------------------------------------------------
    // Cache Routes - Fast Fact Lookup
    // -------------------------------------------------------------------------
    // Get the memory cache (fast lookup index)
    app.get('/api/memories/cache', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        try {
            let cache = await getMemoryCache(userId);
            if (!cache) {
                // Generate cache on first request
                cache = await regenerateCache(userId);
            }
            return cache;
        }
        catch (error) {
            app.log.error({ err: error, userId }, 'Failed to get memory cache');
            reply.code(500);
            return { error: 'Failed to retrieve memory cache' };
        }
    });
    // Regenerate the cache (call after bulk updates)
    app.post('/api/memories/cache/regenerate', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        try {
            const cache = await regenerateCache(userId);
            app.log.info({ userId, totalFacts: cache.totalFacts }, 'Regenerated memory cache');
            return cache;
        }
        catch (error) {
            app.log.error({ err: error, userId }, 'Failed to regenerate cache');
            reply.code(500);
            return { error: 'Failed to regenerate cache' };
        }
    });
    // Check fact availability (pre-flight for questionnaires)
    app.post('/api/memories/cache/check', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { queries } = zod_1.z.object({
            queries: zod_1.z.array(zod_1.z.string()),
        }).parse(req.body);
        try {
            let cache = await getMemoryCache(userId);
            if (!cache) {
                cache = await regenerateCache(userId);
            }
            const availability = checkFactAvailability(cache, queries);
            return availability;
        }
        catch (error) {
            app.log.error({ err: error, userId }, 'Failed to check fact availability');
            reply.code(500);
            return { error: 'Failed to check fact availability' };
        }
    });
    // Smart fact lookup - returns facts based on queries
    app.post('/api/memories/lookup', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { queries, includeContext } = zod_1.z.object({
            queries: zod_1.z.array(zod_1.z.string()),
            includeContext: zod_1.z.boolean().default(true),
        }).parse(req.body);
        try {
            let cache = await getMemoryCache(userId);
            if (!cache) {
                cache = await regenerateCache(userId);
            }
            const availability = checkFactAvailability(cache, queries);
            // Load the required categories
            const facts = {};
            const loadedCategories = {};
            for (const categoryName of availability.categoriesToLoad) {
                const category = await getMemoryCategory(userId, categoryName);
                if (category) {
                    loadedCategories[categoryName] = category;
                }
            }
            // Extract the relevant facts
            for (const [query, info] of Object.entries(availability.availability)) {
                if (info.available && info.category) {
                    const category = loadedCategories[info.category];
                    if (category) {
                        // Find the matching fact
                        const normalizedQuery = query.toLowerCase().replace(/\s+/g, '_');
                        const fact = category.facts.find(f => f.key === normalizedQuery ||
                            f.key.includes(normalizedQuery) ||
                            normalizedQuery.includes(f.key));
                        if (fact) {
                            facts[query] = fact.value;
                        }
                    }
                }
            }
            // Build context string if requested
            let contextString = '';
            if (includeContext) {
                const summaries = Object.values(loadedCategories)
                    .map(c => `### ${c.displayName}\n${c.summary}`)
                    .join('\n\n');
                contextString = summaries || 'No relevant information found.';
            }
            return {
                facts,
                availability: availability.availability,
                unavailable: availability.unavailable,
                context: includeContext ? contextString : undefined,
            };
        }
        catch (error) {
            app.log.error({ err: error, userId }, 'Failed to lookup facts');
            reply.code(500);
            return { error: 'Failed to lookup facts' };
        }
    });
    // -------------------------------------------------------------------------
    // Legacy routes for backward compatibility
    // -------------------------------------------------------------------------
    // Get memory for an agent (legacy - maps to user's memories)
    app.get('/api/memories/:userId/:agentId', async (req, reply) => {
        const { userId, agentId } = req.params;
        const requestUserId = req.user?.userId || 'demo-user';
        // Verify user can only access their own memories
        if (userId !== requestUserId && requestUserId !== 'demo-user') {
            reply.code(403);
            return { error: 'Access denied' };
        }
        // Return the full memory index for backward compatibility
        const index = await getMemoryIndex(userId);
        return index || { userId, categories: [], totalFacts: 0, lastUpdated: new Date().toISOString() };
    });
}
// -----------------------------------------------------------------------------
// Utility Functions
// -----------------------------------------------------------------------------
function formatCategoryName(category) {
    return category
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
/**
 * Generates a simple summary from facts.
 * In production, this would use an LLM for better natural language.
 */
function generateCategorySummary(category) {
    if (category.facts.length === 0) {
        return `No information recorded for ${category.displayName}.`;
    }
    const factStrings = category.facts.map(fact => {
        const value = Array.isArray(fact.value)
            ? fact.value.join(', ')
            : typeof fact.value === 'object'
                ? JSON.stringify(fact.value)
                : String(fact.value);
        return `${formatFactKey(fact.key)}: ${value}`;
    });
    return factStrings.join('. ') + '.';
}
function formatFactKey(key) {
    return key
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
//# sourceMappingURL=memories.js.map