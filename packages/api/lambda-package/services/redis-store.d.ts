export interface StoredConversation {
    id: string;
    topic: string;
    goal?: string;
    mode: 'bts' | 'campfire' | 'solo' | 'universal' | 'introduction';
    maxTurns: number;
    status: 'pending' | 'active' | 'paused' | 'completed' | 'cancelled';
    currentTurn: number;
    initiatorId: string;
    isArchived?: boolean;
    memoryCategories?: string[];
    extractFacts?: boolean;
    memoryContext?: string;
    orchestrationConfig?: {
        apiKey: string;
        provider: 'anthropic' | 'openai' | 'gemini' | 'groq';
        agents: Array<{
            id: string;
            displayName: string;
            emoji: string;
            provider: string;
            modelId: string;
            personality?: string;
            intents: string[];
            memoryCategories: string[];
        }>;
    };
    introductionConfig?: {
        agentId: string;
        apiKey: string;
        provider: 'anthropic' | 'openai' | 'gemini' | 'groq';
        agentName: string;
        agentEmoji: string;
        isCustomAgent?: boolean;
        customQuestions?: Array<{
            id: string;
            question: string;
            followUp?: string;
            extractsMemory?: string[];
            extractsRules?: boolean;
            priority?: number;
        }>;
        responderType?: 'human' | 'agent';
        respondingAgentId?: string;
        respondingAgentName?: string;
    };
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
        agentEmoji?: string;
        intent?: string;
        content: string;
        isHuman?: boolean;
        createdAt: string;
    }>;
    createdAt: string;
}
declare class ConversationStore {
    private redis;
    private readonly keyPrefix;
    private readonly userConversationsPrefix;
    constructor();
    private initialize;
    private memoryStore;
    private userConversations;
    set(conversation: StoredConversation): Promise<void>;
    get(conversationId: string): Promise<StoredConversation | null>;
    getByUser(userId: string): Promise<StoredConversation[]>;
    addUserToConversation(userId: string, conversationId: string): Promise<void>;
    isConnected(): boolean;
}
export declare const conversationStore: ConversationStore;
export {};
//# sourceMappingURL=redis-store.d.ts.map