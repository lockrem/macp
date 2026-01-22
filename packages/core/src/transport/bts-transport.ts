import type { Redis } from 'ioredis';
import type { BTSMessage } from '@macp/shared';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

export interface BTSTransportConfig {
  conversationStreamPrefix: string;
  agentStreamPrefix: string;
  orchestratorStreamPrefix: string;
  maxLen: number;
  blockTimeoutMs: number;
}

const DEFAULT_CONFIG: BTSTransportConfig = {
  conversationStreamPrefix: 'bts:conv:',
  agentStreamPrefix: 'bts:agent:',
  orchestratorStreamPrefix: 'bts:orch:',
  maxLen: 1000,
  blockTimeoutMs: 5000,
};

// -----------------------------------------------------------------------------
// BTS Transport (Redis Streams)
// -----------------------------------------------------------------------------

export class BTSTransport {
  private config: BTSTransportConfig;

  constructor(
    private redis: Redis,
    config: Partial<BTSTransportConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Publish a message to a conversation stream
   */
  async publishToConversation(
    conversationId: string,
    message: BTSMessage
  ): Promise<string> {
    const streamKey = `${this.config.conversationStreamPrefix}${conversationId}`;
    const messageId = await this.redis.xadd(
      streamKey,
      'MAXLEN',
      '~',
      String(this.config.maxLen),
      '*',
      'data',
      JSON.stringify(message)
    );
    return messageId!;
  }

  /**
   * Publish a message to a specific agent's stream
   */
  async publishToAgent(agentId: string, message: BTSMessage): Promise<string> {
    const streamKey = `${this.config.agentStreamPrefix}${agentId}`;
    const messageId = await this.redis.xadd(
      streamKey,
      'MAXLEN',
      '~',
      String(this.config.maxLen),
      '*',
      'data',
      JSON.stringify(message)
    );
    return messageId!;
  }

  /**
   * Publish a response to the orchestrator stream
   */
  async publishToOrchestrator(
    conversationId: string,
    message: BTSMessage
  ): Promise<string> {
    const streamKey = `${this.config.orchestratorStreamPrefix}${conversationId}`;
    const messageId = await this.redis.xadd(
      streamKey,
      'MAXLEN',
      '~',
      String(this.config.maxLen),
      '*',
      'data',
      JSON.stringify(message)
    );
    return messageId!;
  }

  /**
   * Subscribe to an agent's stream and process messages
   */
  async subscribeAgent(
    agentId: string,
    handler: (message: BTSMessage) => Promise<void>,
    signal?: AbortSignal
  ): Promise<void> {
    const streamKey = `${this.config.agentStreamPrefix}${agentId}`;
    let lastId = '$'; // Start from new messages

    while (!signal?.aborted) {
      try {
        const results = await this.redis.xread(
          'BLOCK',
          this.config.blockTimeoutMs,
          'STREAMS',
          streamKey,
          lastId
        );

        if (results) {
          for (const [, messages] of results) {
            for (const [id, fields] of messages as [string, string[]][]) {
              const data = fields[1]; // fields is [key, value]
              const message = JSON.parse(data) as BTSMessage;
              await handler(message);
              lastId = id;
            }
          }
        }
      } catch (error) {
        if (signal?.aborted) break;
        console.error('Error reading from stream:', error);
        await this.sleep(1000); // Back off on error
      }
    }
  }

  /**
   * Read messages from a conversation stream
   */
  async readConversationMessages(
    conversationId: string,
    fromId: string = '0',
    count: number = 100
  ): Promise<BTSMessage[]> {
    const streamKey = `${this.config.conversationStreamPrefix}${conversationId}`;
    const results = await this.redis.xrange(
      streamKey,
      fromId,
      '+',
      'COUNT',
      count
    );

    return results.map(([, fields]) => {
      const data = fields[1];
      return JSON.parse(data) as BTSMessage;
    });
  }

  /**
   * Wait for a response from the orchestrator stream
   */
  async awaitOrchestratorResponse(
    conversationId: string,
    timeoutMs: number
  ): Promise<BTSMessage | null> {
    const streamKey = `${this.config.orchestratorStreamPrefix}${conversationId}`;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const remainingTime = Math.max(100, deadline - Date.now());

      const results = await this.redis.xread(
        'BLOCK',
        Math.min(remainingTime, this.config.blockTimeoutMs),
        'STREAMS',
        streamKey,
        '$'
      );

      if (results && results.length > 0) {
        const [, messages] = results[0];
        if (messages.length > 0) {
          const [, fields] = messages[0] as [string, string[]];
          return JSON.parse(fields[1]) as BTSMessage;
        }
      }
    }

    return null;
  }

  /**
   * Delete a conversation's streams
   */
  async deleteConversationStreams(conversationId: string): Promise<void> {
    const keys = [
      `${this.config.conversationStreamPrefix}${conversationId}`,
      `${this.config.orchestratorStreamPrefix}${conversationId}`,
    ];
    await this.redis.del(...keys);
  }

  /**
   * Get stream info for monitoring
   */
  async getStreamInfo(
    conversationId: string
  ): Promise<{ length: number; firstId: string; lastId: string } | null> {
    const streamKey = `${this.config.conversationStreamPrefix}${conversationId}`;

    try {
      const info = await this.redis.xinfo('STREAM', streamKey) as unknown[];
      const infoMap = this.parseXInfoResponse(info);

      return {
        length: infoMap.get('length') as number,
        firstId: (infoMap.get('first-entry') as string[])?.[0] || '0',
        lastId: (infoMap.get('last-entry') as string[])?.[0] || '0',
      };
    } catch {
      return null;
    }
  }

  private parseXInfoResponse(info: unknown[]): Map<string, unknown> {
    const result = new Map<string, unknown>();
    for (let i = 0; i < info.length; i += 2) {
      result.set(info[i] as string, info[i + 1]);
    }
    return result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

export function createBTSTransport(
  redis: Redis,
  config?: Partial<BTSTransportConfig>
): BTSTransport {
  return new BTSTransport(redis, config);
}
