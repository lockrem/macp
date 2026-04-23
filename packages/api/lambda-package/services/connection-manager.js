"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionManager = exports.ConnectionManager = void 0;
// -----------------------------------------------------------------------------
// Connection Manager
// -----------------------------------------------------------------------------
/**
 * Manages WebSocket connections for real-time message delivery.
 * Tracks which users are online and routes messages to them.
 */
class ConnectionManager {
    connections = new Map();
    conversationSubscribers = new Map(); // conversationId -> userIds
    /**
     * Register a new WebSocket connection for a user
     */
    addConnection(userId, socket) {
        // Close existing connection if any
        const existing = this.connections.get(userId);
        if (existing) {
            try {
                existing.socket.socket.close(1000, 'New connection established');
            }
            catch {
                // Ignore close errors
            }
        }
        const client = {
            userId,
            socket,
            connectedAt: new Date(),
            lastPingAt: new Date(),
            subscriptions: new Set(),
        };
        this.connections.set(userId, client);
        console.log(`[WS] User ${userId} connected. Total connections: ${this.connections.size}`);
    }
    /**
     * Remove a WebSocket connection
     */
    removeConnection(userId) {
        const client = this.connections.get(userId);
        if (client) {
            // Unsubscribe from all conversations
            for (const conversationId of client.subscriptions) {
                this.unsubscribeFromConversation(userId, conversationId);
            }
            this.connections.delete(userId);
            console.log(`[WS] User ${userId} disconnected. Total connections: ${this.connections.size}`);
        }
    }
    /**
     * Check if a user is currently connected
     */
    isConnected(userId) {
        const client = this.connections.get(userId);
        if (!client)
            return false;
        // Check if socket is still open
        return client.socket.socket.readyState === 1; // WebSocket.OPEN
    }
    /**
     * Subscribe a user to conversation updates
     */
    subscribeToConversation(userId, conversationId) {
        const client = this.connections.get(userId);
        if (!client)
            return;
        client.subscriptions.add(conversationId);
        if (!this.conversationSubscribers.has(conversationId)) {
            this.conversationSubscribers.set(conversationId, new Set());
        }
        this.conversationSubscribers.get(conversationId).add(userId);
        console.log(`[WS] User ${userId} subscribed to conversation ${conversationId}`);
    }
    /**
     * Unsubscribe a user from conversation updates
     */
    unsubscribeFromConversation(userId, conversationId) {
        const client = this.connections.get(userId);
        if (client) {
            client.subscriptions.delete(conversationId);
        }
        const subscribers = this.conversationSubscribers.get(conversationId);
        if (subscribers) {
            subscribers.delete(userId);
            if (subscribers.size === 0) {
                this.conversationSubscribers.delete(conversationId);
            }
        }
    }
    /**
     * Send a message to a specific user
     * Returns true if delivered via WebSocket, false if user is offline
     */
    sendToUser(userId, message) {
        const client = this.connections.get(userId);
        if (!client || client.socket.socket.readyState !== 1) {
            return false;
        }
        try {
            client.socket.socket.send(JSON.stringify(message));
            return true;
        }
        catch (error) {
            console.error(`[WS] Failed to send to user ${userId}:`, error);
            this.removeConnection(userId);
            return false;
        }
    }
    /**
     * Broadcast a message to all subscribers of a conversation
     * Returns array of userIds that were NOT reachable (need push notification)
     */
    broadcastToConversation(conversationId, message) {
        const subscribers = this.conversationSubscribers.get(conversationId);
        if (!subscribers) {
            return [];
        }
        const unreachable = [];
        for (const userId of subscribers) {
            const delivered = this.sendToUser(userId, message);
            if (!delivered) {
                unreachable.push(userId);
            }
        }
        return unreachable;
    }
    /**
     * Get list of users subscribed to a conversation
     */
    getConversationSubscribers(conversationId) {
        const subscribers = this.conversationSubscribers.get(conversationId);
        return subscribers ? Array.from(subscribers) : [];
    }
    /**
     * Get all connected user IDs
     */
    getConnectedUsers() {
        return Array.from(this.connections.keys());
    }
    /**
     * Update last ping time for a user (for connection health tracking)
     */
    updatePing(userId) {
        const client = this.connections.get(userId);
        if (client) {
            client.lastPingAt = new Date();
        }
    }
    /**
     * Get connection stats
     */
    getStats() {
        return {
            totalConnections: this.connections.size,
            activeConversations: this.conversationSubscribers.size,
        };
    }
}
exports.ConnectionManager = ConnectionManager;
// Singleton instance
exports.connectionManager = new ConnectionManager();
//# sourceMappingURL=connection-manager.js.map