/**
 * WebSocket handler for real-time autonomous agent conversations
 *
 * Handles: $connect, $disconnect, and message routing
 * Uses Redis for connection and conversation state management
 */
import { APIGatewayProxyWebsocketEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
export declare function handler(event: APIGatewayProxyWebsocketEventV2): Promise<APIGatewayProxyResultV2>;
//# sourceMappingURL=websocket-handler.d.ts.map