"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWebSocketHandler = registerWebSocketHandler;
const connection_manager_js_1 = require("../services/connection-manager.js");
const auth_js_1 = require("../routes/auth.js");
// -----------------------------------------------------------------------------
// WebSocket Handler
// -----------------------------------------------------------------------------
function registerWebSocketHandler(app) {
    app.get('/ws', { websocket: true }, (connection, req) => {
        // Extract ticket from query string
        const ticket = req.query.ticket;
        if (!ticket) {
            connection.socket.close(4001, 'Authentication required: missing ticket');
            return;
        }
        // Validate the ticket (single-use, short-lived)
        const user = (0, auth_js_1.validateWSTicket)(ticket);
        if (!user) {
            connection.socket.close(4001, 'Authentication required: invalid or expired ticket');
            return;
        }
        const userId = user.userId;
        app.log.info({ userId }, 'WebSocket connection authenticated via ticket');
        // Register connection
        connection_manager_js_1.connectionManager.addConnection(userId, connection);
        // Handle incoming messages
        connection.socket.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                handleMessage(connection, userId, message);
            }
            catch {
                connection.socket.send(JSON.stringify({
                    type: 'error',
                    payload: { message: 'Invalid message format' },
                }));
            }
        });
        // Handle disconnection
        connection.socket.on('close', () => {
            connection_manager_js_1.connectionManager.removeConnection(userId);
        });
        // Handle errors
        connection.socket.on('error', (error) => {
            console.error(`[WS] Error for user ${userId}:`, error);
            connection_manager_js_1.connectionManager.removeConnection(userId);
        });
        // Send welcome message
        connection.socket.send(JSON.stringify({
            type: 'connected',
            payload: {
                userId,
                timestamp: new Date().toISOString(),
            },
        }));
    });
}
// -----------------------------------------------------------------------------
// Message Handlers
// -----------------------------------------------------------------------------
function handleMessage(connection, userId, message) {
    switch (message.type) {
        case 'ping':
            connection_manager_js_1.connectionManager.updatePing(userId);
            connection.socket.send(JSON.stringify({ type: 'pong', payload: { timestamp: Date.now() } }));
            break;
        case 'subscribe':
            handleSubscribe(userId, message.payload);
            break;
        case 'unsubscribe':
            handleUnsubscribe(userId, message.payload);
            break;
        case 'typing':
            handleTyping(userId, message.payload);
            break;
        default:
            connection.socket.send(JSON.stringify({
                type: 'error',
                payload: { message: `Unknown message type: ${message.type}` },
            }));
    }
}
function handleSubscribe(userId, payload) {
    if (!payload?.conversationId)
        return;
    // TODO: Verify user is a participant in this conversation
    connection_manager_js_1.connectionManager.subscribeToConversation(userId, payload.conversationId);
}
function handleUnsubscribe(userId, payload) {
    if (!payload?.conversationId)
        return;
    connection_manager_js_1.connectionManager.unsubscribeFromConversation(userId, payload.conversationId);
}
function handleTyping(userId, payload) {
    if (!payload?.conversationId)
        return;
    // Broadcast typing indicator to other participants
    connection_manager_js_1.connectionManager.broadcastToConversation(payload.conversationId, {
        type: 'typing',
        conversationId: payload.conversationId,
        payload: {
            userId,
            isTyping: payload.isTyping,
        },
        timestamp: new Date(),
    });
}
//# sourceMappingURL=handler.js.map