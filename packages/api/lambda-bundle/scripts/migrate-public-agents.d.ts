/**
 * Migration Script: S3 Public Agents to Database
 *
 * This script migrates all public agents from S3 JSON storage to PostgreSQL.
 *
 * Usage:
 *   npx tsx src/scripts/migrate-public-agents.ts [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be migrated without making changes
 *
 * Environment:
 *   DATABASE_URL         PostgreSQL connection string
 *   AWS_REGION          AWS region (default: us-east-1)
 *   MEMORY_BUCKET       S3 bucket name (default: macp-dev-memories)
 */
export {};
//# sourceMappingURL=migrate-public-agents.d.ts.map