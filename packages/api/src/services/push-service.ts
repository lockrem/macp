import { SignJWT, importPKCS8 } from 'jose';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface APNsConfig {
  teamId: string;        // Apple Developer Team ID
  keyId: string;         // APNs Auth Key ID
  privateKey: string;    // APNs Auth Key (.p8 file contents)
  bundleId: string;      // iOS app bundle ID
  production: boolean;   // true for production, false for sandbox
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

// -----------------------------------------------------------------------------
// Push Service
// -----------------------------------------------------------------------------

/**
 * Sends push notifications via Apple Push Notification service (APNs).
 * Uses the modern token-based authentication (JWT).
 */
export class PushService {
  private config: APNsConfig | null = null;
  private jwtToken: string | null = null;
  private jwtExpiresAt: number = 0;

  /**
   * Initialize the push service with APNs credentials
   */
  configure(config: APNsConfig): void {
    this.config = config;
    this.jwtToken = null; // Reset token
    console.log('[Push] APNs configured for', config.production ? 'production' : 'sandbox');
  }

  /**
   * Check if push service is configured
   */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Send a push notification to a device
   */
  async sendPush(deviceToken: string, payload: PushPayload): Promise<PushResult> {
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

      const response = await fetch(
        `https://${apnsHost}/3/device/${deviceToken}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `bearer ${jwt}`,
            'apns-topic': this.config.bundleId,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'apns-expiration': '0',
          },
          body: JSON.stringify(apnsPayload),
        }
      );

      const apnsId = response.headers.get('apns-id') || undefined;

      if (response.ok) {
        return { success: true, apnsId };
      }

      const errorBody = await response.json() as { reason?: string };
      return {
        success: false,
        apnsId,
        error: `APNs error: ${response.status}`,
        reason: errorBody.reason,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send push notifications to multiple devices
   */
  async sendPushToMany(
    deviceTokens: Array<{ userId: string; token: string }>,
    payload: PushPayload
  ): Promise<Map<string, PushResult>> {
    const results = new Map<string, PushResult>();

    // Send in parallel with concurrency limit
    const batchSize = 10;
    for (let i = 0; i < deviceTokens.length; i += batchSize) {
      const batch = deviceTokens.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async ({ userId, token }) => {
          const result = await this.sendPush(token, payload);
          return { userId, result };
        })
      );

      for (const { userId, result } of batchResults) {
        results.set(userId, result);
      }
    }

    return results;
  }

  /**
   * Get or refresh JWT for APNs authentication
   */
  private async getJWT(): Promise<string> {
    if (!this.config) {
      throw new Error('Push service not configured');
    }

    // Return existing token if still valid (tokens last 1 hour, refresh at 50 min)
    const now = Math.floor(Date.now() / 1000);
    if (this.jwtToken && this.jwtExpiresAt > now + 600) {
      return this.jwtToken;
    }

    // Generate new JWT
    const privateKey = await importPKCS8(this.config.privateKey, 'ES256');

    this.jwtToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.config.keyId })
      .setIssuer(this.config.teamId)
      .setIssuedAt(now)
      .sign(privateKey);

    this.jwtExpiresAt = now + 3600; // 1 hour

    return this.jwtToken;
  }
}

// Singleton instance
export const pushService = new PushService();

// -----------------------------------------------------------------------------
// Delivery Coordinator
// -----------------------------------------------------------------------------

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

import { connectionManager } from './connection-manager.js';

export class DeliveryCoordinator {
  /**
   * Deliver a conversation message to all participants
   */
  async deliverToParticipants(
    conversationId: string,
    participants: Array<{ userId: string; apnsToken?: string | null }>,
    message: {
      type: 'message' | 'typing' | 'turn_start' | 'turn_end' | 'conversation_end';
      content: string;
      agentName: string;
      turnNumber: number;
      messageId: string;
    }
  ): Promise<DeliveryResult[]> {
    const results: DeliveryResult[] = [];

    for (const participant of participants) {
      // Try WebSocket first
      const wsDelivered = connectionManager.sendToUser(participant.userId, {
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
      if (participant.apnsToken && pushService.isConfigured()) {
        const pushResult = await pushService.sendPush(participant.apnsToken, {
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

export const deliveryCoordinator = new DeliveryCoordinator();
