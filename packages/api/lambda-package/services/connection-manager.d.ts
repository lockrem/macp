import type { SocketStream } from '@fastify/websocket';
export interface ConnectedClient {
    userId: string;
    socket: SocketStream;
    connectedAt: Date;
    lastPingAt: Date;
    subscriptions: Set<string>;
}
export interface ConversationMessage {
    type: 'message' | 'typing' | 'turn_start' | 'turn_end' | 'conversation_start' | 'conversation_end' | 'conversation_update' | 'error';
    conversationId: string;
    payload: unknown;
    timestamp: Date;
}
/**
 * Manages WebSocket connections for real-time message delivery.
 * Tracks which users are online and routes messages to them.
 */
export declare class ConnectionManager {
    private connections;
    private conversationSubscribers;
    /**
     * Register a new WebSocket connection for a user
     */
    addConnection(userId: string, socket: SocketStream): void;
    /**
     * Remove a WebSocket connection
     */
    removeConnection(userId: string): void;
    /**
     * Check if a user is currently connected
     */
    isConnected(userId: string): boolean;
    /**
     * Subscribe a user to conversation updates
     */
    subscribeToConversation(userId: string, conversationId: string): void;
    /**
     * Unsubscribe a user from conversation updates
     */
    unsubscribeFromConversation(userId: string, conversationId: string): void;
    /**
     * Send a message to a specific user
     * Returns true if delivered via WebSocket, false if user is offline
     */
    sendToUser(userId: string, message: ConversationMessage): boolean;
    /**
     * Broadcast a message to all subscribers of a conversation
     * Returns array of userIds that were NOT reachable (need push notification)
     */
    broadcastToConversation(conversationId: string, message: ConversationMessage): string[];
    /**
     * Get list of users subscribed to a conversation
     */
    getConversationSubscribers(conversationId: string): string[];
    /**
     * Get all connected user IDs
     */
    getConnectedUsers(): string[];
    /**
     * Update last ping time for a user (for connection health tracking)
     */
    updatePing(userId: string): void;
    /**
     * Get connection stats
     */
    getStats(): {
        totalConnections: number;
        activeConversations: number;
    };
}
export declare const connectionManager: ConnectionManager;
//# sourceMappingURL=connection-manager.d.ts.map