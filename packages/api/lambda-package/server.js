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
const core_1 = require("@macp/core");
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
    (0, core_1.createDatabase)({ connectionString: config.databaseUrl });
    app.log.info('Database connection initialized');
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
// Run if this is the main module
main().catch(console.error);
//# sourceMappingURL=server.js.map