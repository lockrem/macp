"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const fastify_1 = __importDefault(require("fastify"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const cors_1 = __importDefault(require("@fastify/cors"));
const handler_js_1 = require("./websocket/handler.js");
const conversations_js_1 = require("./routes/conversations.js");
const agents_js_1 = require("./routes/agents.js");
const health_js_1 = require("./routes/health.js");
const memories_js_1 = require("./routes/memories.js");
const auth_js_1 = require("./routes/auth.js");
const settings_js_1 = require("./routes/settings.js");
const archives_js_1 = require("./routes/archives.js");
const orchestration_js_1 = require("./routes/orchestration.js");
const rules_js_1 = require("./routes/rules.js");
const introductions_js_1 = require("./routes/introductions.js");
const public_agents_js_1 = require("./routes/public-agents.js");
const autonomous_conversation_js_1 = require("./routes/autonomous-conversation.js");
const audit_js_1 = require("./routes/audit.js");
const contacts_js_1 = require("./routes/contacts.js");
const tasks_js_1 = require("./routes/tasks.js");
const migrations_js_1 = require("./routes/migrations.js");
const ai_utilities_js_1 = require("./routes/ai-utilities.js");
const profile_js_1 = require("./routes/profile.js");
const forms_js_1 = require("./routes/forms.js");
const core_1 = require("@macp/core");
const drizzle_orm_1 = require("drizzle-orm");
const push_service_js_1 = require("./services/push-service.js");
const cognito_js_1 = require("./auth/cognito.js");
// -----------------------------------------------------------------------------
// Server Factory
// -----------------------------------------------------------------------------
async function createServer(config) {
    const app = (0, fastify_1.default)({
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
    await app.register(cors_1.default, {
        origin: true, // Configure properly for production
        credentials: true,
    });
    await app.register(websocket_1.default);
    // Initialize database
    const dbUrlForLogging = config.databaseUrl ? `${config.databaseUrl.substring(0, 30)}...` : 'EMPTY';
    console.log(`[Server] Initializing database with URL: ${dbUrlForLogging}`);
    (0, core_1.createDatabase)({ connectionString: config.databaseUrl });
    app.log.info('Database connection initialized');
    // Run pending migrations
    try {
        const db = (0, core_1.getDatabase)();
        // Create users table first (required for foreign keys)
        await db.execute((0, drizzle_orm_1.sql) `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        apple_id TEXT UNIQUE,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        apns_token TEXT,
        apns_token_updated_at TIMESTAMP,
        preferences JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
        last_active_at TIMESTAMP
      )
    `);
        await db.execute((0, drizzle_orm_1.sql) `
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
        await db.execute((0, drizzle_orm_1.sql) `CREATE INDEX IF NOT EXISTS idx_user_memory_facts_user_id ON user_memory_facts(user_id)`);
        await db.execute((0, drizzle_orm_1.sql) `CREATE INDEX IF NOT EXISTS idx_user_memory_facts_user_category ON user_memory_facts(user_id, category)`);
        await db.execute((0, drizzle_orm_1.sql) `CREATE INDEX IF NOT EXISTS idx_user_memory_facts_user_key ON user_memory_facts(user_id, key)`);
        // Forms tables
        await db.execute((0, drizzle_orm_1.sql) `
      DO $$ BEGIN
        CREATE TYPE form_field_type AS ENUM ('text', 'multiline', 'date', 'email', 'phone', 'select');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
        await db.execute((0, drizzle_orm_1.sql) `
      DO $$ BEGIN
        CREATE TYPE form_submission_status AS ENUM ('in_progress', 'completed');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
        await db.execute((0, drizzle_orm_1.sql) `
      DO $$ BEGIN
        CREATE TYPE form_response_source AS ENUM ('agent', 'user');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
        await db.execute((0, drizzle_orm_1.sql) `
      CREATE TABLE IF NOT EXISTS forms (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT,
        is_public BOOLEAN NOT NULL DEFAULT true,
        view_count INTEGER NOT NULL DEFAULT 0,
        submission_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
        await db.execute((0, drizzle_orm_1.sql) `CREATE INDEX IF NOT EXISTS idx_forms_user_id ON forms(user_id)`);
        await db.execute((0, drizzle_orm_1.sql) `
      CREATE TABLE IF NOT EXISTS form_fields (
        id TEXT PRIMARY KEY,
        form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        field_type form_field_type NOT NULL,
        required BOOLEAN NOT NULL DEFAULT false,
        placeholder TEXT,
        options JSONB,
        display_order INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
        await db.execute((0, drizzle_orm_1.sql) `CREATE INDEX IF NOT EXISTS idx_form_fields_form_id ON form_fields(form_id)`);
        await db.execute((0, drizzle_orm_1.sql) `
      CREATE TABLE IF NOT EXISTS form_submissions (
        id TEXT PRIMARY KEY,
        form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
        respondent_user_id TEXT REFERENCES users(id),
        respondent_name TEXT,
        respondent_email TEXT,
        status form_submission_status NOT NULL DEFAULT 'in_progress',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        submitted_at TIMESTAMP
      )
    `);
        await db.execute((0, drizzle_orm_1.sql) `CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id ON form_submissions(form_id)`);
        await db.execute((0, drizzle_orm_1.sql) `
      CREATE TABLE IF NOT EXISTS form_responses (
        id TEXT PRIMARY KEY,
        submission_id TEXT NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
        field_id TEXT NOT NULL REFERENCES form_fields(id) ON DELETE CASCADE,
        value TEXT NOT NULL,
        source form_response_source NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
        await db.execute((0, drizzle_orm_1.sql) `CREATE INDEX IF NOT EXISTS idx_form_responses_submission_id ON form_responses(submission_id)`);
        app.log.info('Database migrations applied');
    }
    catch (err) {
        app.log.error({ err }, 'Failed to run migrations (non-fatal)');
    }
    // Configure Cognito authentication if credentials provided
    if (config.cognito) {
        (0, cognito_js_1.configureCognito)(config.cognito);
        await app.register(cognito_js_1.cognitoAuth);
        app.log.info('Cognito authentication configured');
    }
    else {
        app.log.warn('Cognito not configured - running in development mode');
    }
    // Configure push notifications if credentials provided
    if (config.apns) {
        push_service_js_1.pushService.configure(config.apns);
        app.log.info('APNs push service configured');
    }
    // Register WebSocket handler
    (0, handler_js_1.registerWebSocketHandler)(app);
    app.log.info('WebSocket handler registered');
    // Register REST routes
    (0, health_js_1.registerHealthRoutes)(app);
    (0, auth_js_1.registerAuthRoutes)(app); // Auth routes (public, before auth middleware)
    (0, agents_js_1.registerAgentRoutes)(app);
    (0, conversations_js_1.registerConversationRoutes)(app);
    (0, memories_js_1.registerMemoryRoutes)(app);
    (0, settings_js_1.registerSettingsRoutes)(app);
    (0, archives_js_1.registerArchiveRoutes)(app);
    (0, orchestration_js_1.registerOrchestrationRoutes)(app);
    (0, rules_js_1.registerRulesRoutes)(app);
    (0, introductions_js_1.registerIntroductionRoutes)(app);
    (0, public_agents_js_1.registerPublicAgentRoutes)(app);
    (0, autonomous_conversation_js_1.registerAutonomousConversationRoutes)(app);
    (0, audit_js_1.registerAuditRoutes)(app);
    (0, contacts_js_1.registerContactRoutes)(app);
    (0, tasks_js_1.registerTaskRoutes)(app);
    (0, migrations_js_1.registerMigrationRoutes)(app);
    (0, ai_utilities_js_1.registerAIUtilityRoutes)(app);
    (0, profile_js_1.registerProfileRoutes)(app);
    (0, forms_js_1.registerFormRoutes)(app);
    app.log.info('REST routes registered');
    return app;
}
// -----------------------------------------------------------------------------
// Main Entry Point
// -----------------------------------------------------------------------------
async function main() {
    const config = {
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
    }
    catch (err) {
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
//# sourceMappingURL=server.js.map