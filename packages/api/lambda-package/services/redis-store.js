"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationStore = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
// -----------------------------------------------------------------------------
// Redis Store
// -----------------------------------------------------------------------------
class ConversationStore {
    redis = null;
    keyPrefix = 'macp:conversation:';
    userConversationsPrefix = 'macp:user:conversations:';
    constructor() {
        this.initialize();
    }
    initialize() {
        const redisHost = process.env.REDIS_HOST;
        const redisPort = process.env.REDIS_PORT;
        if (redisHost) {
            try {
                this.redis = new ioredis_1.default({
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
            }
            catch (error) {
                console.warn('[Redis] Failed to initialize, falling back to in-memory store:', error);
                this.redis = null;
            }
        }
        else {
            console.log('[Redis] REDIS_HOST not set, using in-memory store');
        }
    }
    // In-memory fallback
    memoryStore = new Map();
    userConversations = new Map();
    async set(conversation) {
        if (this.redis) {
            const key = this.keyPrefix + conversation.id;
            await this.redis.set(key, JSON.stringify(conversation), 'EX', 86400 * 7); // 7 days TTL
            // Also track conversation for users
            const userIds = [conversation.initiatorId, ...conversation.participants.map(p => p.userId)];
            for (const userId of userIds) {
                await this.redis.sadd(this.userConversationsPrefix + userId, conversation.id);
            }
        }
        else {
            this.memoryStore.set(conversation.id, conversation);
            // Track for users
            const userIds = [conversation.initiatorId, ...conversation.participants.map(p => p.userId)];
            for (const userId of userIds) {
                if (!this.userConversations.has(userId)) {
                    this.userConversations.set(userId, new Set());
                }
                this.userConversations.get(userId).add(conversation.id);
            }
        }
    }
    async get(conversationId) {
        if (this.redis) {
            const key = this.keyPrefix + conversationId;
            const data = await this.redis.get(key);
            if (!data)
                return null;
            return JSON.parse(data);
        }
        else {
            return this.memoryStore.get(conversationId) || null;
        }
    }
    async getByUser(userId) {
        if (this.redis) {
            const conversationIds = await this.redis.smembers(this.userConversationsPrefix + userId);
            const conversations = [];
            for (const id of conversationIds) {
                const conversation = await this.get(id);
                if (conversation) {
                    conversations.push(conversation);
                }
            }
            return conversations;
        }
        else {
            const ids = this.userConversations.get(userId) || new Set();
            return Array.from(ids)
                .map(id => this.memoryStore.get(id))
                .filter((c) => c !== undefined);
        }
    }
    async addUserToConversation(userId, conversationId) {
        if (this.redis) {
            await this.redis.sadd(this.userConversationsPrefix + userId, conversationId);
        }
        else {
            if (!this.userConversations.has(userId)) {
                this.userConversations.set(userId, new Set());
            }
            this.userConversations.get(userId).add(conversationId);
        }
    }
    isConnected() {
        return this.redis?.status === 'ready';
    }
}
exports.conversationStore = new ConversationStore();
//# sourceMappingURL=redis-store.js.map