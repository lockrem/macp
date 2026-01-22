import Redis from 'ioredis';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface StoredConversation {
  id: string;
  topic: string;
  goal?: string;
  mode: 'bts' | 'campfire' | 'solo';
  maxTurns: number;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'cancelled';
  currentTurn: number;
  initiatorId: string;
  isArchived?: boolean;
  // Solo mode options
  memoryCategories?: string[]; // Categories to inject into agent context
  extractFacts?: boolean; // Whether to extract facts after completion
  memoryContext?: string; // Pre-loaded memory context for agent
  participants: Array<{
    id: string;
    userId: string;
    agentId: string;
    apiKey: string;
    agentConfig: {
      displayName: string;
      provider: 'anthropic' | 'openai' | 'gemini' | 'groq';
      modelId: string;
      systemPrompt?: string;
      personality?: string;
    };
  }>;
  messages: Array<{
    id: string;
    turnNumber: number;
    agentId: string;
    agentName: string;
    content: string;
    isHuman?: boolean; // True if this is a human message in solo mode
    createdAt: string; // ISO string for Redis
  }>;
  createdAt: string; // ISO string for Redis
}

// -----------------------------------------------------------------------------
// Redis Store
// -----------------------------------------------------------------------------

class ConversationStore {
  private redis: Redis | null = null;
  private readonly keyPrefix = 'macp:conversation:';
  private readonly userConversationsPrefix = 'macp:user:conversations:';

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT;

    if (redisHost) {
      try {
        this.redis = new Redis({
          host: redisHost,
          port: redisPort ? parseInt(redisPort, 10) : 6379,
          retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
        });

        this.redis.on('connect', () => {
          console.log('[Redis] Connected to Redis');
        });

        this.redis.on('error', (error) => {
          console.error('[Redis] Connection error:', error.message);
        });
      } catch (error) {
        console.warn('[Redis] Failed to initialize, falling back to in-memory store:', error);
        this.redis = null;
      }
    } else {
      console.log('[Redis] REDIS_HOST not set, using in-memory store');
    }
  }

  // In-memory fallback
  private memoryStore = new Map<string, StoredConversation>();
  private userConversations = new Map<string, Set<string>>();

  async set(conversation: StoredConversation): Promise<void> {
    if (this.redis) {
      const key = this.keyPrefix + conversation.id;
      await this.redis.set(key, JSON.stringify(conversation), 'EX', 86400 * 7); // 7 days TTL

      // Also track conversation for users
      const userIds = [conversation.initiatorId, ...conversation.participants.map(p => p.userId)];
      for (const userId of userIds) {
        await this.redis.sadd(this.userConversationsPrefix + userId, conversation.id);
      }
    } else {
      this.memoryStore.set(conversation.id, conversation);
      // Track for users
      const userIds = [conversation.initiatorId, ...conversation.participants.map(p => p.userId)];
      for (const userId of userIds) {
        if (!this.userConversations.has(userId)) {
          this.userConversations.set(userId, new Set());
        }
        this.userConversations.get(userId)!.add(conversation.id);
      }
    }
  }

  async get(conversationId: string): Promise<StoredConversation | null> {
    if (this.redis) {
      const key = this.keyPrefix + conversationId;
      const data = await this.redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as StoredConversation;
    } else {
      return this.memoryStore.get(conversationId) || null;
    }
  }

  async getByUser(userId: string): Promise<StoredConversation[]> {
    if (this.redis) {
      const conversationIds = await this.redis.smembers(this.userConversationsPrefix + userId);
      const conversations: StoredConversation[] = [];

      for (const id of conversationIds) {
        const conversation = await this.get(id);
        if (conversation) {
          conversations.push(conversation);
        }
      }

      return conversations;
    } else {
      const ids = this.userConversations.get(userId) || new Set();
      return Array.from(ids)
        .map(id => this.memoryStore.get(id))
        .filter((c): c is StoredConversation => c !== undefined);
    }
  }

  async addUserToConversation(userId: string, conversationId: string): Promise<void> {
    if (this.redis) {
      await this.redis.sadd(this.userConversationsPrefix + userId, conversationId);
    } else {
      if (!this.userConversations.has(userId)) {
        this.userConversations.set(userId, new Set());
      }
      this.userConversations.get(userId)!.add(conversationId);
    }
  }

  isConnected(): boolean {
    return this.redis?.status === 'ready';
  }
}

export const conversationStore = new ConversationStore();
