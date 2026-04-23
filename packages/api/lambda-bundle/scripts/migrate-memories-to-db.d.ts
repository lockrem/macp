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
export {};
//# sourceMappingURL=migrate-memories-to-db.d.ts.map