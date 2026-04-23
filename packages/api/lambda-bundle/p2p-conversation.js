"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.P2PConversationRunner = void 0;
exports.createP2PConversation = createP2PConversation;
const ulid_1 = require("ulid");
const core_1 = require("@macp/core");
const DEFAULT_CONFIG = {
    topic: 'General Discussion',
    goal: 'Have a productive conversation',
    maxTurns: 20,
    maxTokens: 50000,
    perAgentTokenLimit: 25000,
    enableBidding: true,
    bidTimeoutMs: 1000,
    responseTimeoutMs: 30000,
};
// -----------------------------------------------------------------------------
// P2P Conversation Runner
// -----------------------------------------------------------------------------
class P2PConversationRunner {
    agent1;
    agent2;
    transport;
    config;
    contextManager;
    tokenBudget = new Map();
    totalTokensUsed = 0;
    constructor(agent1, agent2, transport, config = DEFAULT_CONFIG) {
        this.agent1 = agent1;
        this.agent2 = agent2;
        this.transport = transport;
        this.config = config;
        this.contextManager = new core_1.ContextManager();
    }
    /**
     * Run a P2P conversation between two agents
     */
    async run() {
        const startTime = Date.now();
        const conversationId = (0, ulid_1.ulid)();
        // Initialize conversation
        const conversation = this.createConversation(conversationId);
        const orchestrator = this.createOrchestrator(conversation);
        // Initialize context
        let context = this.contextManager.createInitialContext(conversationId, this.config.topic, this.config.goal, [this.agent1.agent.id, this.agent2.agent.id]);
        const turns = [];
        let terminationReason = 'max_turns';
        try {
            // Opening turn: Agent 1 starts
            const openingTurn = await this.requestOpeningTurn(context);
            turns.push(openingTurn);
            context = await this.contextManager.updateContext(context, openingTurn);
            this.recordTokenUsage(openingTurn);
            // Main conversation loop
            while (context.currentTurn < this.config.maxTurns) {
                // Check budget
                if (!this.canContinue()) {
                    terminationReason = 'budget_exceeded';
                    break;
                }
                // Get next turn
                const turn = await orchestrator.processNextTurn(context);
                turns.push(turn);
                // Update context
                context = await this.contextManager.updateContext(context, turn);
                this.recordTokenUsage(turn);
                // Check for termination signals
                const shouldTerminate = this.checkTerminationSignals(turn, turns);
                if (shouldTerminate) {
                    terminationReason = shouldTerminate;
                    break;
                }
            }
        }
        catch (error) {
            console.error('P2P conversation error:', error);
            terminationReason = 'error';
        }
        return {
            conversationId,
            turns,
            finalSummary: context.sum,
            totalTokensUsed: this.totalTokensUsed,
            tokensByAgent: Object.fromEntries(this.tokenBudget),
            terminationReason,
            durationMs: Date.now() - startTime,
        };
    }
    /**
     * Create the conversation object
     */
    createConversation(id) {
        const now = new Date();
        const createParticipant = (agent) => ({
            agentId: agent.id,
            role: 'active',
            joinedAt: now,
            stats: {
                turnsTaken: 0,
                tokensUsed: 0,
                avgBidScore: 0,
            },
        });
        return {
            id,
            title: this.config.topic,
            mode: 'rapid',
            topology: 'linear',
            participants: [
                createParticipant(this.agent1.agent),
                createParticipant(this.agent2.agent),
            ],
            state: {
                status: 'active',
                currentTurn: 0,
            },
            config: {
                maxTurns: this.config.maxTurns,
                bidTimeoutMs: this.config.bidTimeoutMs,
                responseTimeoutMs: this.config.responseTimeoutMs,
                minParticipants: 2,
                maxParticipants: 2,
                requireHumanApproval: false,
                autoSummarizeInterval: 5,
            },
            context: {
                topic: this.config.topic,
                goals: [this.config.goal],
                constraints: [],
                tokenBudget: {
                    totalLimit: this.config.maxTokens,
                    totalUsed: 0,
                    perAgentLimit: this.config.perAgentTokenLimit,
                    perAgentUsed: {},
                },
            },
            createdAt: now,
            updatedAt: now,
        };
    }
    /**
     * Create the orchestrator
     */
    createOrchestrator(conversation) {
        const orchestrator = new core_1.Orchestrator(conversation, this.transport, {
            bidTimeoutMs: this.config.bidTimeoutMs,
            responseTimeoutMs: this.config.responseTimeoutMs,
            maxTurns: this.config.maxTurns,
            enableBidding: this.config.enableBidding,
        });
        // Register adapters
        orchestrator.registerAdapter(this.agent1.agent.id, this.agent1.adapter);
        orchestrator.registerAdapter(this.agent2.agent.id, this.agent2.adapter);
        return orchestrator;
    }
    /**
     * Request opening turn from Agent 1
     */
    async requestOpeningTurn(context) {
        const response = await this.agent1.adapter.generate({
            messages: [
                {
                    role: 'user',
                    content: `You are starting a conversation about: ${context.topic}

Goal: ${context.goal}

You are speaking with: ${this.agent2.agent.displayName}

Please begin the conversation with an opening statement or question.`,
                },
            ],
            systemPrompt: `You are ${this.agent1.agent.displayName}. Be concise and focused.`,
            maxTokens: 1000,
        });
        return {
            id: (0, ulid_1.ulid)(),
            cid: context.conversationId,
            t: 1,
            a: this.agent1.agent.id,
            type: 'res',
            p: {
                content: response.content,
                meta: {
                    tokens: { in: response.tokensUsed.input, out: response.tokensUsed.output },
                    model: response.model,
                    latency: 0,
                },
            },
            ts: Date.now(),
        };
    }
    /**
     * Record token usage for budget tracking
     */
    recordTokenUsage(turn) {
        const tokens = (turn.p.meta?.tokens.in || 0) + (turn.p.meta?.tokens.out || 0);
        const currentUsage = this.tokenBudget.get(turn.a) || 0;
        this.tokenBudget.set(turn.a, currentUsage + tokens);
        this.totalTokensUsed += tokens;
    }
    /**
     * Check if we can continue within budget
     */
    canContinue() {
        // Check total budget
        if (this.totalTokensUsed >= this.config.maxTokens) {
            return false;
        }
        // Check per-agent budgets
        for (const [agentId, used] of this.tokenBudget) {
            if (used >= this.config.perAgentTokenLimit) {
                return false;
            }
        }
        return true;
    }
    /**
     * Check for termination signals in the conversation
     */
    checkTerminationSignals(latestTurn, allTurns) {
        const content = latestTurn.p.content?.toLowerCase() || '';
        // Check for explicit completion signals
        const completionPhrases = [
            'we have reached a conclusion',
            'i think we\'ve covered',
            'that concludes our discussion',
            'we\'re in agreement',
            'final answer:',
            'in conclusion,',
        ];
        if (completionPhrases.some((phrase) => content.includes(phrase))) {
            return 'goal_achieved';
        }
        // Check for stagnation (similar responses)
        if (allTurns.length >= 4) {
            const recentResponses = allTurns.slice(-4).map((t) => t.p.content || '');
            if (this.detectStagnation(recentResponses)) {
                return 'stagnation';
            }
        }
        return null;
    }
    /**
     * Detect if the conversation is stagnating
     */
    detectStagnation(responses) {
        // Simple heuristic: check if responses are getting very similar
        const normalize = (s) => s
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .sort()
            .join(' ');
        const normalized = responses.map(normalize);
        // Check pairwise similarity
        let similarPairs = 0;
        for (let i = 0; i < normalized.length; i++) {
            for (let j = i + 1; j < normalized.length; j++) {
                if (this.jaccardSimilarity(normalized[i], normalized[j]) > 0.7) {
                    similarPairs++;
                }
            }
        }
        // If more than half of pairs are similar, we're stagnating
        const totalPairs = (normalized.length * (normalized.length - 1)) / 2;
        return similarPairs / totalPairs > 0.5;
    }
    /**
     * Calculate Jaccard similarity between two strings
     */
    jaccardSimilarity(a, b) {
        const setA = new Set(a.split(' '));
        const setB = new Set(b.split(' '));
        const intersection = new Set([...setA].filter((x) => setB.has(x)));
        const union = new Set([...setA, ...setB]);
        return intersection.size / union.size;
    }
}
exports.P2PConversationRunner = P2PConversationRunner;
// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------
function createP2PConversation(agent1, agent2, transport, config) {
    return new P2PConversationRunner(agent1, agent2, transport, {
        ...DEFAULT_CONFIG,
        ...config,
    });
}
//# sourceMappingURL=p2p-conversation.js.map