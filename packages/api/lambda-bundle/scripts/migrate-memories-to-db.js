"use strict";
/**
 * One-time migration script: S3 memories -> PostgreSQL user_memory_facts table
 *
 * Usage:
 *   DATABASE_URL=postgresql://... MEMORY_BUCKET=macp-dev-memories npx tsx src/scripts/migrate-memories-to-db.ts
 *
 * Steps:
 *   1. List all S3 keys under memories/
 *   2. For each user, load each category JSON
 *   3. Insert facts into user_memory_facts
 *   4. Verify counts match
 *   5. S3 files remain as cold backup but are never read
 */
Object.defineProperty(exports, "__esModule", { value: true });
const client_s3_1 = require("@aws-sdk/client-s3");
const core_1 = require("@macp/core");
const drizzle_orm_1 = require("drizzle-orm");
const ulid_1 = require("ulid");
const s3Client = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const MEMORY_BUCKET = process.env.MEMORY_BUCKET || 'macp-dev-memories';
async function listMemoryKeys() {
    const keys = [];
    let continuationToken;
    do {
        const response = await s3Client.send(new client_s3_1.ListObjectsV2Command({
            Bucket: MEMORY_BUCKET,
            Prefix: 'memories/',
            ContinuationToken: continuationToken,
        }));
        if (response.Contents) {
            for (const obj of response.Contents) {
                if (obj.Key && !obj.Key.endsWith('_index.json') && !obj.Key.endsWith('_cache.json')) {
                    keys.push(obj.Key);
                }
            }
        }
        continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    return keys;
}
async function loadCategoryFromS3(key) {
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
async function migrate() {
    // Initialize database
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('DATABASE_URL environment variable is required');
        process.exit(1);
    }
    (0, core_1.createDatabase)({ connectionString: databaseUrl });
    const db = (0, core_1.getDatabase)();
    console.log('[Migration] Starting S3 -> DB memory migration');
    console.log(`[Migration] Bucket: ${MEMORY_BUCKET}`);
    // List all memory files
    const keys = await listMemoryKeys();
    console.log(`[Migration] Found ${keys.length} category files in S3`);
    let totalFacts = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    const usersSeen = new Set();
    for (const key of keys) {
        // Parse user ID and category from key: memories/{userId}/{category}.json
        const parts = key.split('/');
        if (parts.length < 3)
            continue;
        const userId = parts[1];
        const categoryFile = parts[2];
        if (!categoryFile.endsWith('.json'))
            continue;
        usersSeen.add(userId);
        const category = await loadCategoryFromS3(key);
        if (!category || !category.facts || category.facts.length === 0) {
            console.log(`[Migration] Skipping empty: ${key}`);
            continue;
        }
        console.log(`[Migration] Processing ${key}: ${category.facts.length} facts`);
        totalFacts += category.facts.length;
        for (const fact of category.facts) {
            try {
                // Check if already migrated (idempotent)
                const existing = await db.select().from(core_1.userMemoryFacts)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.userMemoryFacts.id, fact.id), (0, drizzle_orm_1.eq)(core_1.userMemoryFacts.userId, userId)))
                    .limit(1);
                if (existing.length > 0) {
                    totalSkipped++;
                    continue;
                }
                await db.insert(core_1.userMemoryFacts).values({
                    id: fact.id || (0, ulid_1.ulid)(),
                    userId,
                    category: category.category,
                    key: fact.key,
                    value: fact.value,
                    confidence: fact.confidence || 'high',
                    learnedFrom: fact.learnedFrom || null,
                    learnedAt: new Date(fact.learnedAt),
                    supersedes: fact.supersedes || null,
                });
                totalInserted++;
            }
            catch (error) {
                console.error(`[Migration] Failed to insert fact ${fact.id} for user ${userId}: ${error.message}`);
            }
        }
    }
    console.log('\n[Migration] ========= RESULTS =========');
    console.log(`[Migration] Users processed: ${usersSeen.size}`);
    console.log(`[Migration] Total S3 facts: ${totalFacts}`);
    console.log(`[Migration] Inserted to DB: ${totalInserted}`);
    console.log(`[Migration] Skipped (already exist): ${totalSkipped}`);
    console.log(`[Migration] Failed: ${totalFacts - totalInserted - totalSkipped}`);
    console.log('[Migration] ============================\n');
    // Verify
    for (const userId of usersSeen) {
        const dbCount = await db.select().from(core_1.userMemoryFacts)
            .where((0, drizzle_orm_1.eq)(core_1.userMemoryFacts.userId, userId));
        console.log(`[Migration] User ${userId}: ${dbCount.length} facts in DB`);
    }
    console.log('[Migration] Done. S3 files left as cold backup.');
    process.exit(0);
}
migrate().catch(err => {
    console.error('[Migration] Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=migrate-memories-to-db.js.map