"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMigrationRoutes = registerMigrationRoutes;
const core_1 = require("@macp/core");
const drizzle_orm_1 = require("drizzle-orm");
// Migration SQL for contacts and public_agents tables
// Note: Foreign key constraints are omitted for now since users table may not exist
const MIGRATION_0001_SQL = `
-- Create public_agents table first (referenced by contact_agents)
CREATE TABLE IF NOT EXISTS public_agents (
  agent_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_name TEXT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  description TEXT NOT NULL,
  personality TEXT NOT NULL,
  greeting TEXT NOT NULL,
  accent_color TEXT NOT NULL,
  introduction_greeting TEXT,
  introduction_questions JSONB DEFAULT '[]'::jsonb,
  voice_id TEXT,
  voice_speed INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  allow_direct_chat BOOLEAN NOT NULL DEFAULT false,
  allow_agent_to_agent BOOLEAN NOT NULL DEFAULT false,
  allow_accompanied_chat BOOLEAN NOT NULL DEFAULT false,
  view_count INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for public_agents
CREATE INDEX IF NOT EXISTS idx_public_agents_owner_id ON public_agents(owner_id);

-- Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases JSONB DEFAULT '[]'::jsonb,
  relationship TEXT,
  relationship_started TIMESTAMP,
  birthday TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for contacts
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_aliases ON contacts USING GIN (aliases);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN (tags);

-- Create contact_agents junction table
CREATE TABLE IF NOT EXISTS contact_agents (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  public_agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_emoji TEXT,
  role TEXT,
  discovered_via TEXT,
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_contact_agent UNIQUE (contact_id, public_agent_id)
);

-- Create indexes for contact_agents
CREATE INDEX IF NOT EXISTS idx_contact_agents_contact_id ON contact_agents(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_agents_public_agent_id ON contact_agents(public_agent_id);
`;
// Migration SQL for tasks table - split into separate arrays for better control
const MIGRATION_0002_STATEMENTS = [
    // Create task status enum
    `DO $$ BEGIN CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'waiting', 'completed', 'cancelled', 'failed'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    // Create task priority enum
    `DO $$ BEGIN CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    // Create tasks table
    `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'pending',
    priority task_priority NOT NULL DEFAULT 'medium',
    contact_id TEXT,
    target_person_name TEXT,
    assigned_agent_id TEXT,
    assigned_agent_name TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    source_conversation_id TEXT,
    source_message_content TEXT,
    resolution TEXT,
    resolved_at TIMESTAMP,
    due_date TIMESTAMP,
    reminder_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
    // Create indexes for tasks
    `CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON tasks(contact_id)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`,
    `CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status)`,
];
function registerMigrationRoutes(app) {
    // Run database migrations (protected endpoint)
    app.post('/api/admin/migrate', async (req, reply) => {
        // Check for admin secret in header
        const adminSecret = req.headers['x-admin-secret'];
        const expectedSecret = process.env.ADMIN_MIGRATION_SECRET || 'migrate-contacts-2026';
        if (adminSecret !== expectedSecret) {
            reply.code(401);
            return { error: 'Unauthorized' };
        }
        try {
            const db = (0, core_1.getDatabase)();
            const results = [];
            // Helper function to run a migration from SQL string
            async function runMigrationSql(name, migrationSql) {
                console.log(`[Migration] Starting migration: ${name}`);
                // Clean and split the SQL by semicolon
                const cleanedSql = migrationSql
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && !line.startsWith('--'))
                    .join('\n');
                const statements = cleanedSql
                    .split(';')
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
                await runStatements(name, statements);
            }
            // Helper function to run an array of statements
            async function runStatements(name, statements) {
                console.log(`[Migration] Starting migration: ${name} (${statements.length} statements)`);
                let successCount = 0;
                for (let i = 0; i < statements.length; i++) {
                    const statement = statements[i];
                    console.log(`[Migration] Running statement ${i + 1}/${statements.length}: ${statement.substring(0, 60)}...`);
                    try {
                        await db.execute(drizzle_orm_1.sql.raw(statement));
                        console.log(`[Migration] SUCCESS: Statement ${i + 1}`);
                        successCount++;
                    }
                    catch (err) {
                        // Ignore "already exists" errors
                        if (err.message?.includes('already exists') || err.cause?.message?.includes('already exists')) {
                            console.log(`[Migration] Skipped (already exists): Statement ${i + 1}`);
                            successCount++;
                        }
                        else {
                            console.error(`[Migration] FAILED: Statement ${i + 1}: ${err.message || err.cause?.message}`);
                            throw err;
                        }
                    }
                }
                console.log(`[Migration] ${name}: Completed ${successCount}/${statements.length} statements`);
                results.push(`${name}: ${successCount}/${statements.length} statements`);
            }
            // Run all migrations in order
            await runMigrationSql('0001_contacts_and_public_agents', MIGRATION_0001_SQL);
            await runStatements('0002_tasks', MIGRATION_0002_STATEMENTS);
            console.log('[Migration] All migrations completed successfully');
            return {
                success: true,
                migrations: results,
                message: 'All migrations completed successfully',
            };
        }
        catch (error) {
            console.error('[Migration] Migration failed:', error);
            reply.code(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    });
    // Check migration status
    app.get('/api/admin/migrate/status', async (req, reply) => {
        try {
            const db = (0, core_1.getDatabase)();
            // Check which tables exist
            const result = await db.execute((0, drizzle_orm_1.sql) `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('public_agents', 'contacts', 'contact_agents', 'tasks')
        ORDER BY table_name
      `);
            // db.execute returns { rows: [...] } in drizzle-orm with postgres-js
            const rows = result.rows || result;
            const existingTables = Array.isArray(rows) ? rows.map((r) => r.table_name) : [];
            const expectedTables = ['contacts', 'contact_agents', 'public_agents', 'tasks'];
            const missingTables = expectedTables.filter(t => !existingTables.includes(t));
            return {
                existingTables,
                missingTables,
                migrated: missingTables.length === 0,
                status: missingTables.length === 0 ? 'complete' : 'pending',
            };
        }
        catch (error) {
            console.error('[Migration] Status check failed:', error);
            reply.code(500);
            return {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
            };
        }
    });
    // Migrate public agents from S3 to database
    app.post('/api/admin/migrate/public-agents', async (req, reply) => {
        const adminSecret = req.headers['x-admin-secret'];
        const expectedSecret = process.env.ADMIN_MIGRATION_SECRET || 'migrate-contacts-2026';
        if (adminSecret !== expectedSecret) {
            reply.code(401);
            return { error: 'Unauthorized' };
        }
        const { S3Client, ListObjectsV2Command, GetObjectCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-s3')));
        const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
        const bucket = process.env.MEMORY_BUCKET || 'macp-dev-memories-297723897117';
        try {
            const db = (0, core_1.getDatabase)();
            const stats = { total: 0, migrated: 0, skipped: 0, failed: 0, errors: [] };
            // List all public agent files
            const listResponse = await s3.send(new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: 'public-agents/',
            }));
            const agentKeys = (listResponse.Contents || [])
                .filter(obj => obj.Key?.endsWith('.json') && !obj.Key.includes('/_index/'))
                .map(obj => obj.Key);
            stats.total = agentKeys.length;
            console.log(`[Migration] Found ${stats.total} public agents in S3`);
            for (const key of agentKeys) {
                const agentId = key.replace('public-agents/', '').replace('.json', '');
                try {
                    // Check if already in DB
                    const existing = await db.execute((0, drizzle_orm_1.sql) `SELECT agent_id FROM public_agents WHERE agent_id = ${agentId}`);
                    const existingRows = existing.rows || existing;
                    if (Array.isArray(existingRows) && existingRows.length > 0) {
                        stats.skipped++;
                        continue;
                    }
                    // Get from S3
                    const getResponse = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
                    const body = await getResponse.Body?.transformToString();
                    if (!body) {
                        stats.failed++;
                        stats.errors.push(`${agentId}: empty body`);
                        continue;
                    }
                    const agent = JSON.parse(body);
                    // Prepare values - convert dates to ISO strings for PostgreSQL
                    const createdAt = agent.createdAt ? new Date(agent.createdAt).toISOString() : new Date().toISOString();
                    const updatedAt = agent.updatedAt ? new Date(agent.updatedAt).toISOString() : new Date().toISOString();
                    const introQuestions = JSON.stringify(agent.introductionQuestions || []);
                    // Insert into DB using parameterized query
                    await db.execute((0, drizzle_orm_1.sql) `
            INSERT INTO public_agents (
              agent_id, owner_id, owner_name, name, emoji, description, personality,
              greeting, accent_color, introduction_greeting, introduction_questions,
              voice_id, voice_speed, is_active, allow_direct_chat, allow_agent_to_agent,
              allow_accompanied_chat, view_count, session_count, created_at, updated_at
            ) VALUES (
              ${agent.agentId}, ${agent.ownerId}, ${agent.ownerName || null}, ${agent.name},
              ${agent.emoji}, ${agent.description}, ${agent.personality}, ${agent.greeting},
              ${agent.accentColor}, ${agent.introductionGreeting || null},
              ${introQuestions}::jsonb,
              ${agent.voiceId || null}, ${agent.voiceSpeed || null}, ${agent.isActive ?? true},
              ${agent.allowDirectChat ?? false}, ${agent.allowAgentToAgent ?? false},
              ${agent.allowAccompaniedChat ?? false}, ${agent.viewCount || 0}, 0,
              ${createdAt}::timestamp, ${updatedAt}::timestamp
            )
          `);
                    stats.migrated++;
                    console.log(`[Migration] Migrated: ${agentId}`);
                }
                catch (err) {
                    stats.failed++;
                    // Capture full error details from postgres driver
                    const errMsg = err.cause?.message || err.message || String(err);
                    const errCode = err.code || err.cause?.code || 'unknown';
                    stats.errors.push(`${agentId}: [${errCode}] ${errMsg}`);
                    console.error(`[Migration] Failed: ${agentId}: [${errCode}] ${errMsg}`);
                }
            }
            console.log(`[Migration] Complete: ${stats.migrated} migrated, ${stats.skipped} skipped, ${stats.failed} failed`);
            return { success: true, stats };
        }
        catch (error) {
            console.error('[Migration] Public agents migration failed:', error);
            reply.code(500);
            return { error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });
}
//# sourceMappingURL=migrations.js.map