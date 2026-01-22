import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { connectionManager } from '../services/connection-manager.js';
import { validateWSTicket } from '../routes/auth.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface WSMessage {
  type: string;
  payload?: unknown;
}

// -----------------------------------------------------------------------------
// WebSocket Handler
// -----------------------------------------------------------------------------

export function registerWebSocketHandler(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (connection: SocketStream, req) => {
    // Extract ticket from query string
    const ticket = (req.query as { ticket?: string }).ticket;

    if (!ticket) {
      connection.socket.close(4001, 'Authentication required: missing ticket');
      return;
    }

    // Validate the ticket (single-use, short-lived)
    const user = validateWSTicket(ticket);
    if (!user) {
      connection.socket.close(4001, 'Authentication required: invalid or expired ticket');
      return;
    }

    const userId = user.userId;
    app.log.info({ userId }, 'WebSocket connection authenticated via ticket');

    // Register connection
    connectionManager.addConnection(userId, connection);

    // Handle incoming messages
    connection.socket.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;
        handleMessage(connection, userId, message);
      } catch {
        connection.socket.send(JSON.stringify({
          type: 'error',
          payload: { message: 'Invalid message format' },
        }));
      }
    });

    // Handle disconnection
    connection.socket.on('close', () => {
      connectionManager.removeConnection(userId);
    });

    // Handle errors
    connection.socket.on('error', (error: Error) => {
      console.error(`[WS] Error for user ${userId}:`, error);
      connectionManager.removeConnection(userId);
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

function handleMessage(connection: SocketStream, userId: string, message: WSMessage): void {
  switch (message.type) {
    case 'ping':
      connectionManager.updatePing(userId);
      connection.socket.send(JSON.stringify({ type: 'pong', payload: { timestamp: Date.now() } }));
      break;

    case 'subscribe':
      handleSubscribe(userId, message.payload as { conversationId: string });
      break;

    case 'unsubscribe':
      handleUnsubscribe(userId, message.payload as { conversationId: string });
      break;

    case 'typing':
      handleTyping(userId, message.payload as { conversationId: string; isTyping: boolean });
      break;

    default:
      connection.socket.send(JSON.stringify({
        type: 'error',
        payload: { message: `Unknown message type: ${message.type}` },
      }));
  }
}

function handleSubscribe(userId: string, payload: { conversationId: string }): void {
  if (!payload?.conversationId) return;

  // TODO: Verify user is a participant in this conversation
  connectionManager.subscribeToConversation(userId, payload.conversationId);
}

function handleUnsubscribe(userId: string, payload: { conversationId: string }): void {
  if (!payload?.conversationId) return;

  connectionManager.unsubscribeFromConversation(userId, payload.conversationId);
}

function handleTyping(userId: string, payload: { conversationId: string; isTyping: boolean }): void {
  if (!payload?.conversationId) return;

  // Broadcast typing indicator to other participants
  connectionManager.broadcastToConversation(payload.conversationId, {
    type: 'typing',
    conversationId: payload.conversationId,
    payload: {
      userId,
      isTyping: payload.isTyping,
    },
    timestamp: new Date(),
  });
}
