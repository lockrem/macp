"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHealthRoutes = registerHealthRoutes;
const connection_manager_js_1 = require("../services/connection-manager.js");
const push_service_js_1 = require("../services/push-service.js");
function registerHealthRoutes(app) {
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
        const wsStats = connection_manager_js_1.connectionManager.getStats();
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
                    status: push_service_js_1.pushService.isConfigured() ? 'configured' : 'not_configured',
                },
                database: {
                    status: 'up', // Would add actual health check
                },
            },
        };
    });
}
//# sourceMappingURL=health.js.map