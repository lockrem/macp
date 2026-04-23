"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryCoordinator = exports.DeliveryCoordinator = exports.pushService = exports.PushService = void 0;
const jose_1 = require("jose");
// -----------------------------------------------------------------------------
// Push Service
// -----------------------------------------------------------------------------
/**
 * Sends push notifications via Apple Push Notification service (APNs).
 * Uses the modern token-based authentication (JWT).
 */
class PushService {
    config = null;
    jwtToken = null;
    jwtExpiresAt = 0;
    /**
     * Initialize the push service with APNs credentials
     */
    configure(config) {
        this.config = config;
        this.jwtToken = null; // Reset token
        console.log('[Push] APNs configured for', config.production ? 'production' : 'sandbox');
    }
    /**
     * Check if push service is configured
     */
    isConfigured() {
        return this.config !== null;
    }
    /**
     * Send a push notification to a device
     */
    async sendPush(deviceToken, payload) {
        if (!this.config) {
            return { success: false, error: 'Push service not configured' };
        }
        try {
            const jwt = await this.getJWT();
            const apnsHost = this.config.production
                ? 'api.push.apple.com'
                : 'api.sandbox.push.apple.com';
            const apnsPayload = {
                aps: {
                    alert: {
                        title: payload.title,
                        body: payload.body,
                    },
                    sound: 'default',
                    badge: 1,
                    'mutable-content': 1,
                    'thread-id': payload.conversationId,
                },
                conversationId: payload.conversationId,
                messageId: payload.messageId,
                ...payload.data,
            };
            const response = await fetch(`https://${apnsHost}/3/device/${deviceToken}`, {
                method: 'POST',
                headers: {
                    'Authorization': `bearer ${jwt}`,
                    'apns-topic': this.config.bundleId,
                    'apns-push-type': 'alert',
                    'apns-priority': '10',
                    'apns-expiration': '0',
                },
                body: JSON.stringify(apnsPayload),
            });
            const apnsId = response.headers.get('apns-id') || undefined;
            if (response.ok) {
                return { success: true, apnsId };
            }
            const errorBody = await response.json();
            return {
                success: false,
                apnsId,
                error: `APNs error: ${response.status}`,
                reason: errorBody.reason,
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    /**
     * Send push notifications to multiple devices
     */
    async sendPushToMany(deviceTokens, payload) {
        const results = new Map();
        // Send in parallel with concurrency limit
        const batchSize = 10;
        for (let i = 0; i < deviceTokens.length; i += batchSize) {
            const batch = deviceTokens.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(async ({ userId, token }) => {
                const result = await this.sendPush(token, payload);
                return { userId, result };
            }));
            for (const { userId, result } of batchResults) {
                results.set(userId, result);
            }
        }
        return results;
    }
    /**
     * Get or refresh JWT for APNs authentication
     */
    async getJWT() {
        if (!this.config) {
            throw new Error('Push service not configured');
        }
        // Return existing token if still valid (tokens last 1 hour, refresh at 50 min)
        const now = Math.floor(Date.now() / 1000);
        if (this.jwtToken && this.jwtExpiresAt > now + 600) {
            return this.jwtToken;
        }
        // Generate new JWT
        const privateKey = await (0, jose_1.importPKCS8)(this.config.privateKey, 'ES256');
        this.jwtToken = await new jose_1.SignJWT({})
            .setProtectedHeader({ alg: 'ES256', kid: this.config.keyId })
            .setIssuer(this.config.teamId)
            .setIssuedAt(now)
            .sign(privateKey);
        this.jwtExpiresAt = now + 3600; // 1 hour
        return this.jwtToken;
    }
}
exports.PushService = PushService;
// Singleton instance
exports.pushService = new PushService();
const connection_manager_js_1 = require("./connection-manager.js");
class DeliveryCoordinator {
    /**
     * Deliver a conversation message to all participants
     */
    async deliverToParticipants(conversationId, participants, message) {
        const results = [];
        for (const participant of participants) {
            // Try WebSocket first
            const wsDelivered = connection_manager_js_1.connectionManager.sendToUser(participant.userId, {
                type: message.type,
                conversationId,
                payload: message,
                timestamp: new Date(),
            });
            if (wsDelivered) {
                results.push({
                    userId: participant.userId,
                    delivered: true,
                    via: 'websocket',
                });
                continue;
            }
            // Fall back to push notification if user has token
            if (participant.apnsToken && exports.pushService.isConfigured()) {
                const pushResult = await exports.pushService.sendPush(participant.apnsToken, {
                    title: message.agentName,
                    body: message.content.slice(0, 100) + (message.content.length > 100 ? '...' : ''),
                    conversationId,
                    messageId: message.messageId,
                });
                results.push({
                    userId: participant.userId,
                    delivered: pushResult.success,
                    via: pushResult.success ? 'push' : 'none',
                    apnsId: pushResult.apnsId,
                    error: pushResult.error,
                });
                continue;
            }
            // User unreachable
            results.push({
                userId: participant.userId,
                delivered: false,
                via: 'none',
                error: 'User offline and no push token',
            });
        }
        return results;
    }
}
exports.DeliveryCoordinator = DeliveryCoordinator;
exports.deliveryCoordinator = new DeliveryCoordinator();
//# sourceMappingURL=push-service.js.map