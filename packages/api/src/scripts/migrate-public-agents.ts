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

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import { createDatabase, getDatabase, publicAgents } from '@macp/core';
import type { PublishedAgent, PublicIntroductionQuestion } from '@macp/shared';

// Configuration
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const MEMORY_BUCKET = process.env.MEMORY_BUCKET || 'macp-dev-memories';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://macp:macp@localhost:5432/macp';

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// S3 client
const s3Client = new S3Client({ region: AWS_REGION });

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  errors: Array<{ agentId: string; error: string }>;
}

/**
 * Lists all public agent files in S3
 */
async function listS3PublicAgents(): Promise<string[]> {
  const agentIds: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: MEMORY_BUCKET,
      Prefix: 'public-agents/',
      ContinuationToken: continuationToken,
    }));

    for (const obj of response.Contents || []) {
      const key = obj.Key;
      if (key && key.endsWith('.json') && !key.includes('/_index/')) {
        // Extract agent ID from key: public-agents/{agentId}.json
        const agentId = key.replace('public-agents/', '').replace('.json', '');
        agentIds.push(agentId);
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return agentIds;
}

/**
 * Gets a public agent from S3
 */
async function getS3PublicAgent(agentId: string): Promise<PublishedAgent | null> {
  const key = `public-agents/${agentId}.json`;

  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: MEMORY_BUCKET,
      Key: key,
    }));

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return JSON.parse(body) as PublishedAgent;
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Checks if an agent already exists in the database
 */
async function agentExistsInDB(agentId: string): Promise<boolean> {
  const db = getDatabase();
  const result = await db
    .select({ agentId: publicAgents.agentId })
    .from(publicAgents)
    .where(eq(publicAgents.agentId, agentId))
    .limit(1);

  return result.length > 0;
}

/**
 * Inserts a public agent into the database
 */
async function insertAgentToDB(agent: PublishedAgent): Promise<void> {
  const db = getDatabase();
  const now = new Date();

  await db.insert(publicAgents).values({
    agentId: agent.agentId,
    ownerId: agent.ownerId,
    ownerName: agent.ownerName,
    name: agent.name,
    emoji: agent.emoji,
    description: agent.description,
    personality: agent.personality,
    greeting: agent.greeting,
    accentColor: agent.accentColor,
    introductionGreeting: agent.introductionGreeting,
    introductionQuestions: agent.introductionQuestions as PublicIntroductionQuestion[],
    voiceId: agent.voiceId,
    voiceSpeed: agent.voiceSpeed,
    isActive: agent.isActive,
    allowDirectChat: agent.allowDirectChat,
    allowAgentToAgent: agent.allowAgentToAgent,
    allowAccompaniedChat: agent.allowAccompaniedChat,
    viewCount: agent.viewCount || 0,
    sessionCount: 0, // S3 version doesn't track this at agent level
    createdAt: agent.createdAt ? new Date(agent.createdAt) : now,
    updatedAt: agent.updatedAt ? new Date(agent.updatedAt) : now,
  });
}

/**
 * Runs the migration
 */
async function migrate(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  console.log('='.repeat(60));
  console.log('Public Agents Migration: S3 -> PostgreSQL');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`S3 Bucket: ${MEMORY_BUCKET}`);
  console.log(`Database: ${DATABASE_URL.replace(/:[^@]+@/, ':****@')}`);
  console.log('='.repeat(60));
  console.log();

  // List all agents in S3
  console.log('Scanning S3 for public agents...');
  const agentIds = await listS3PublicAgents();
  stats.total = agentIds.length;
  console.log(`Found ${stats.total} public agents in S3\n`);

  if (stats.total === 0) {
    console.log('No agents to migrate.');
    return stats;
  }

  // Process each agent
  for (const agentId of agentIds) {
    process.stdout.write(`Processing ${agentId}... `);

    try {
      // Check if already in DB
      const exists = await agentExistsInDB(agentId);
      if (exists) {
        console.log('SKIPPED (already exists)');
        stats.skipped++;
        continue;
      }

      // Get from S3
      const agent = await getS3PublicAgent(agentId);
      if (!agent) {
        console.log('SKIPPED (not found in S3)');
        stats.skipped++;
        continue;
      }

      // Insert to DB (unless dry run)
      if (DRY_RUN) {
        console.log(`WOULD MIGRATE (owner: ${agent.ownerId}, name: "${agent.name}")`);
        stats.migrated++;
      } else {
        await insertAgentToDB(agent);
        console.log(`MIGRATED (owner: ${agent.ownerId}, name: "${agent.name}")`);
        stats.migrated++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`FAILED: ${errorMessage}`);
      stats.failed++;
      stats.errors.push({ agentId, error: errorMessage });
    }
  }

  return stats;
}

/**
 * Prints final statistics
 */
function printStats(stats: MigrationStats): void {
  console.log();
  console.log('='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total agents found:  ${stats.total}`);
  console.log(`Successfully ${DRY_RUN ? 'would migrate' : 'migrated'}: ${stats.migrated}`);
  console.log(`Skipped (existing):  ${stats.skipped}`);
  console.log(`Failed:              ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log();
    console.log('Errors:');
    for (const { agentId, error } of stats.errors) {
      console.log(`  - ${agentId}: ${error}`);
    }
  }

  console.log('='.repeat(60));

  if (DRY_RUN && stats.migrated > 0) {
    console.log();
    console.log('This was a dry run. To perform the actual migration, run:');
    console.log('  npx tsx src/scripts/migrate-public-agents.ts');
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Initialize database
    console.log('Initializing database connection...');
    createDatabase({ connectionString: DATABASE_URL });
    console.log('Database connection established.\n');

    // Run migration
    const stats = await migrate();

    // Print results
    printStats(stats);

    // Exit with appropriate code
    if (stats.failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\nMigration failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run
main();
