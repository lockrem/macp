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
import { createDatabase } from '@macp/core';
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
    logger: {
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
  createDatabase({ connectionString: config.databaseUrl });
  app.log.info('Database connection initialized');

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

// Run if this is the main module
main().catch(console.error);
