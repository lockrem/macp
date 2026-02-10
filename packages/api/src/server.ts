import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { registerWebSocketHandler } from './websocket/handler.js';
import { registerConversationRoutes } from './routes/conversations.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerMemoryRoutes } from './routes/memories.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerArchiveRoutes } from './routes/archives.js';
import { registerOrchestrationRoutes } from './routes/orchestration.js';
import { registerRulesRoutes } from './routes/rules.js';
import { registerIntroductionRoutes } from './routes/introductions.js';
import { registerPublicAgentRoutes } from './routes/public-agents.js';
import { registerAutonomousConversationRoutes } from './routes/autonomous-conversation.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerContactRoutes } from './routes/contacts.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerMigrationRoutes } from './routes/migrations.js';
import { registerAIUtilityRoutes } from './routes/ai-utilities.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerFormRoutes } from './routes/forms.js';
import { groundingRoutes } from './routes/grounding.js';
import { createDatabase, getDatabase } from '@macp/core';
import { sql } from 'drizzle-orm';
import { pushService } from './services/push-service.js';
import { cognitoAuth, configureCognito } from './auth/cognito.js';

// -----------------------------------------------------------------------------
// Server Configuration
// -----------------------------------------------------------------------------

export interface ServerConfig {
  port: number;
  host: string;
  databaseUrl: string;
  cognito?: {
    userPoolId: string;
    clientId: string;
    region?: string;
  };
  apns?: {
    teamId: string;
    keyId: string;
    privateKey: string;
    bundleId: string;
    production: boolean;
  };
}

// -----------------------------------------------------------------------------
// Server Factory
// -----------------------------------------------------------------------------

export async function createServer(config: ServerConfig) {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'production'
      ? { level: process.env.LOG_LEVEL || 'info' }
      : {
          level: process.env.LOG_LEVEL || 'info',
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
            },
          },
        },
  });

  // Register plugins
  await app.register(cors, {
    origin: true, // Configure properly for production
    credentials: true,
  });

  await app.register(websocket);

  // Initialize database
  const dbUrlForLogging = config.databaseUrl ? `${config.databaseUrl.substring(0, 30)}...` : 'EMPTY';
  console.log(`[Server] Initializing database with URL: ${dbUrlForLogging}`);
  createDatabase({ connectionString: config.databaseUrl });
  app.log.info('Database connection initialized');

  // Run pending migrations
  try {
    const db = getDatabase();

    // Create users table FIRST (required for foreign keys)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        apple_id TEXT UNIQUE,
        display_name TEXT NOT NULL DEFAULT 'User',
        avatar_url TEXT,
        apns_token TEXT,
        apns_token_updated_at TIMESTAMP,
        preferences JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        last_active_at TIMESTAMP
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_memory_facts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value JSONB NOT NULL,
        confidence TEXT DEFAULT 'high',
        learned_from TEXT,
        learned_at TIMESTAMP NOT NULL,
        supersedes TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_memory_facts_user_id ON user_memory_facts(user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_memory_facts_user_category ON user_memory_facts(user_id, category)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_user_memory_facts_user_key ON user_memory_facts(user_id, key)`);

    // Add record_type and submission_count columns to public_agents (for unified forms/agents)
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE public_agents ADD COLUMN record_type TEXT NOT NULL DEFAULT 'agent';
      EXCEPTION WHEN duplicate_column THEN null;
      END $$
    `);
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE public_agents ADD COLUMN submission_count INTEGER NOT NULL DEFAULT 0;
      EXCEPTION WHEN duplicate_column THEN null;
      END $$
    `);

    // Forms tables (form_fields and form_submissions now reference public_agents)
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE form_field_type AS ENUM ('text', 'multiline', 'date', 'email', 'phone', 'select');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE form_submission_status AS ENUM ('in_progress', 'completed');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE form_response_source AS ENUM ('agent', 'user');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    // form_fields - migrate from form_id to agent_id
    // First, create table if it doesn't exist (new installations)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS form_fields (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES public_agents(agent_id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        field_type form_field_type NOT NULL,
        required BOOLEAN NOT NULL DEFAULT false,
        placeholder TEXT,
        options JSONB,
        display_order INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    // For existing installations: add agent_id column if it doesn't exist
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE form_fields ADD COLUMN agent_id TEXT REFERENCES public_agents(agent_id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_column THEN null;
      END $$
    `);
    // Make old form_id column nullable (we're migrating to agent_id)
    await db.execute(sql`
      ALTER TABLE form_fields ALTER COLUMN form_id DROP NOT NULL
    `);
    // Migrate data from form_id to agent_id, but only where the agent exists in public_agents
    // (Old form_id values that reference the deprecated forms table won't be migrated)
    await db.execute(sql`
      UPDATE form_fields ff SET agent_id = ff.form_id
      WHERE ff.agent_id IS NULL
        AND ff.form_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public_agents pa WHERE pa.agent_id = ff.form_id)
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_form_fields_agent_id ON form_fields(agent_id)`);

    // form_submissions - migrate from form_id to agent_id
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS form_submissions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL REFERENCES public_agents(agent_id) ON DELETE CASCADE,
        respondent_user_id TEXT REFERENCES users(id),
        respondent_name TEXT,
        respondent_email TEXT,
        status form_submission_status NOT NULL DEFAULT 'in_progress',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        submitted_at TIMESTAMP
      )
    `);
    // For existing installations: add agent_id column if it doesn't exist
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE form_submissions ADD COLUMN agent_id TEXT REFERENCES public_agents(agent_id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_column THEN null;
      END $$
    `);
    // Make old form_id column nullable (we're migrating to agent_id)
    await db.execute(sql`
      ALTER TABLE form_submissions ALTER COLUMN form_id DROP NOT NULL
    `);
    // Migrate data from form_id to agent_id, but only where the agent exists in public_agents
    await db.execute(sql`
      UPDATE form_submissions fs SET agent_id = fs.form_id
      WHERE fs.agent_id IS NULL
        AND fs.form_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public_agents pa WHERE pa.agent_id = fs.form_id)
    `);
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE form_submissions ADD CONSTRAINT form_submissions_respondent_user_id_fkey FOREIGN KEY (respondent_user_id) REFERENCES users(id);
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_form_submissions_agent_id ON form_submissions(agent_id)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS form_responses (
        id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
        field_id TEXT NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
        value TEXT NOT NULL,
        source form_response_source NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_form_responses_submission_id ON form_responses(submission_id)`);

    // Backfill users table from existing data (idempotent)
    await db.execute(sql`
      INSERT INTO users (id, display_name, created_at, updated_at)
      SELECT DISTINCT user_id, 'User', NOW(), NOW()
      FROM (
        SELECT owner_id AS user_id FROM public_agents WHERE owner_id IS NOT NULL
        UNION
        SELECT user_id FROM contacts WHERE user_id IS NOT NULL
        UNION
        SELECT user_id FROM tasks WHERE user_id IS NOT NULL
        UNION
        SELECT user_id FROM user_memory_facts WHERE user_id IS NOT NULL
      ) AS all_users
      WHERE user_id IS NOT NULL
      ON CONFLICT (id) DO NOTHING
    `);

    app.log.info('Database migrations applied');
  } catch (err) {
    app.log.error({ err }, 'Failed to run migrations (non-fatal)');
  }

  // Configure Cognito authentication if credentials provided
  if (config.cognito) {
    configureCognito(config.cognito);
    await app.register(cognitoAuth);
    app.log.info('Cognito authentication configured');
  } else {
    app.log.warn('Cognito not configured - running in development mode');
  }

  // Configure push notifications if credentials provided
  if (config.apns) {
    pushService.configure(config.apns);
    app.log.info('APNs push service configured');
  }

  // Register WebSocket handler
  registerWebSocketHandler(app);
  app.log.info('WebSocket handler registered');

  // Register REST routes
  registerHealthRoutes(app);
  registerAuthRoutes(app); // Auth routes (public, before auth middleware)
  registerAgentRoutes(app);
  registerConversationRoutes(app);
  registerMemoryRoutes(app);
  registerSettingsRoutes(app);
  registerArchiveRoutes(app);
  registerOrchestrationRoutes(app);
  registerRulesRoutes(app);
  registerIntroductionRoutes(app);
  registerPublicAgentRoutes(app);
  registerAutonomousConversationRoutes(app);
  registerAuditRoutes(app);
  registerContactRoutes(app);
  registerTaskRoutes(app);
  registerMigrationRoutes(app);
  registerAIUtilityRoutes(app);
  registerProfileRoutes(app);
  registerFormRoutes(app);
  groundingRoutes(app);
  app.log.info('REST routes registered');

  return app;
}

// -----------------------------------------------------------------------------
// Main Entry Point
// -----------------------------------------------------------------------------

async function main() {
  const config: ServerConfig = {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://macp:macp@localhost:5432/macp',
  };

  // Cognito configuration (optional)
  if (process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID) {
    config.cognito = {
      userPoolId: process.env.COGNITO_USER_POOL_ID,
      clientId: process.env.COGNITO_CLIENT_ID,
      region: process.env.AWS_REGION || 'us-east-1',
    };
  }

  // APNs configuration (optional)
  if (process.env.APNS_TEAM_ID && process.env.APNS_KEY_ID && process.env.APNS_PRIVATE_KEY) {
    config.apns = {
      teamId: process.env.APNS_TEAM_ID,
      keyId: process.env.APNS_KEY_ID,
      privateKey: process.env.APNS_PRIVATE_KEY,
      bundleId: process.env.APNS_BUNDLE_ID || 'com.macp.app',
      production: process.env.NODE_ENV === 'production',
    };
  }

  const server = await createServer(config);

  try {
    await server.listen({ port: config.port, host: config.host });
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                    MACP P2P Server                        ║
╠════════════════════════════════════════════════════════════╣
║  REST API:    http://${config.host}:${config.port}                       ║
║  WebSocket:   ws://${config.host}:${config.port}/ws                      ║
║  Health:      http://${config.host}:${config.port}/health                ║
╚════════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Run if this is the main module (not when imported as a library)
// Check for common indicators that we're being run directly vs imported
const isDirectRun = !process.env.AWS_LAMBDA_FUNCTION_NAME &&
                    process.argv[1]?.includes('server');
if (isDirectRun) {
  main().catch(console.error);
}
