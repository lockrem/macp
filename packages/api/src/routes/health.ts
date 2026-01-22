import type { FastifyInstance } from 'fastify';
import { connectionManager } from '../services/connection-manager.js';
import { pushService } from '../services/push-service.js';

export function registerHealthRoutes(app: FastifyInstance): void {
  // Basic health check
  app.get('/health', async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    };
  });

  // Detailed status for monitoring
  app.get('/health/details', async () => {
    const wsStats = connectionManager.getStats();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      services: {
        websocket: {
          status: 'up',
          connections: wsStats.totalConnections,
          activeConversations: wsStats.activeConversations,
        },
        push: {
          status: pushService.isConfigured() ? 'configured' : 'not_configured',
        },
        database: {
          status: 'up', // Would add actual health check
        },
      },
    };
  });
}
