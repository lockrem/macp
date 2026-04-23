export interface APNsConfig {
    teamId: string;
    keyId: string;
    privateKey: string;
    bundleId: string;
    production: boolean;
}
export interface PushPayload {
    title: string;
    body: string;
    conversationId: string;
    messageId?: string;
    data?: Record<string, string>;
}
export interface PushResult {
    success: boolean;
    apnsId?: string;
    error?: string;
    reason?: string;
}
/**
 * Sends push notifications via Apple Push Notification service (APNs).
 * Uses the modern token-based authentication (JWT).
 */
export declare class PushService {
    private config;
    private jwtToken;
    private jwtExpiresAt;
    /**
     * Initialize the push service with APNs credentials
     */
    configure(config: APNsConfig): void;
    /**
     * Check if push service is configured
     */
    isConfigured(): boolean;
    /**
     * Send a push notification to a device
     */
    sendPush(deviceToken: string, payload: PushPayload): Promise<PushResult>;
    /**
     * Send push notifications to multiple devices
     */
    sendPushToMany(deviceTokens: Array<{
        userId: string;
        token: string;
    }>, payload: PushPayload): Promise<Map<string, PushResult>>;
    /**
     * Get or refresh JWT for APNs authentication
     */
    private getJWT;
}
export declare const pushService: PushService;
/**
 * Coordinates message delivery between WebSocket and Push notifications.
 * Tries WebSocket first, falls back to push for offline users.
 */
export interface DeliveryResult {
    userId: string;
    delivered: boolean;
    via: 'websocket' | 'push' | 'none';
    apnsId?: string;
    error?: string;
}
export declare class DeliveryCoordinator {
    /**
     * Deliver a conversation message to all participants
     */
    deliverToParticipants(conversationId: string, participants: Array<{
        userId: string;
        apnsToken?: string | null;
    }>, message: {
        type: 'message' | 'typing' | 'turn_start' | 'turn_end' | 'conversation_end';
        content: string;
        agentName: string;
        turnNumber: number;
        messageId: string;
    }): Promise<DeliveryResult[]>;
}
export declare const deliveryCoordinator: DeliveryCoordinator;
//# sourceMappingURL=push-service.d.ts.map