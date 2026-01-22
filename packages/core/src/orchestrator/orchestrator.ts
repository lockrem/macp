import { EventEmitter } from 'events';
import { ulid } from 'ulid';
import type {
  Conversation,
  CompactContext,
  BTSMessage,
  Bid,
  BidResult,
  ParticipantStats,
  Participant,
} from '@macp/shared';
import { TimeoutError } from '@macp/shared';
import { BiddingEngine } from './bidding-engine.js';
import { ContextManager } from './context-manager.js';
import type { BTSTransport } from '../transport/bts-transport.js';
import type { AgentAdapter } from '../adapters/base-adapter.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type OrchestratorState =
  | 'idle'
  | 'collecting_bids'
  | 'evaluating_bids'
  | 'awaiting_response'
  | 'processing_response';

export interface OrchestratorConfig {
  bidTimeoutMs: number;
  responseTimeoutMs: number;
  maxTurns: number;
  enableBidding: boolean; // false for simple round-robin
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  bidTimeoutMs: 1000,
  responseTimeoutMs: 30000,
  maxTurns: 50,
  enableBidding: true,
};

// -----------------------------------------------------------------------------
// Orchestrator
// -----------------------------------------------------------------------------

export class Orchestrator extends EventEmitter {
  private state: OrchestratorState = 'idle';
  private biddingEngine: BiddingEngine;
  private contextManager: ContextManager;
  private adapters: Map<string, AgentAdapter> = new Map();
  private pendingBids: Map<string, Bid> = new Map();

  constructor(
    private conversation: Conversation,
    private transport: BTSTransport,
    private config: OrchestratorConfig = DEFAULT_CONFIG
  ) {
    super();
    this.biddingEngine = new BiddingEngine();
    this.contextManager = new ContextManager();
  }

  /**
   * Register an agent adapter
   */
  registerAdapter(agentId: string, adapter: AgentAdapter): void {
    this.adapters.set(agentId, adapter);
  }

  /**
   * Get current orchestrator state
   */
  getState(): OrchestratorState {
    return this.state;
  }

  /**
   * Process the next turn in the conversation
   */
  async processNextTurn(context: CompactContext): Promise<BTSMessage> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot start turn in state: ${this.state}`);
    }

    try {
      let winner: BidResult;

      if (this.config.enableBidding) {
        // Phase 1: Collect bids
        this.state = 'collecting_bids';
        const bids = await this.collectBids(context);

        // Phase 2: Evaluate bids
        this.state = 'evaluating_bids';
        const participantStats = this.getParticipantStats();
        winner = this.biddingEngine.evaluateBids(
          bids,
          this.conversation.state,
          participantStats
        );

        this.emit('bids_evaluated', { winner, allBids: bids });
      } else {
        // Simple round-robin
        winner = this.roundRobinSelect(context);
      }

      // Phase 3: Request response from winner
      this.state = 'awaiting_response';
      const response = await this.requestResponse(winner.winner, context);

      // Phase 4: Process response
      this.state = 'processing_response';
      const message = this.createMessage(response, winner.winner, context);

      this.emit('turn_completed', { message, winner });

      return message;
    } finally {
      this.state = 'idle';
    }
  }

  /**
   * Collect bids from all active participants
   */
  private async collectBids(context: CompactContext): Promise<Map<string, Bid>> {
    const activeParticipants = this.conversation.participants.filter(
      (p) => p.role === 'active'
    );

    const deadline = Date.now() + this.config.bidTimeoutMs;
    this.pendingBids.clear();

    // Request bids from all agents in parallel
    const bidPromises = activeParticipants.map(async (participant) => {
      try {
        const bid = await this.requestBid(participant.agentId, context, deadline);
        this.pendingBids.set(participant.agentId, bid);
      } catch (error) {
        // Agent didn't respond - create implicit pass
        const passBid = this.biddingEngine.createPassBid(
          participant.agentId,
          context.conversationId,
          context.currentTurn
        );
        this.pendingBids.set(participant.agentId, passBid);
      }
    });

    await Promise.allSettled(bidPromises);

    return this.pendingBids;
  }

  /**
   * Request a bid from a specific agent
   */
  private async requestBid(
    agentId: string,
    context: CompactContext,
    deadline: number
  ): Promise<Bid> {
    const adapter = this.adapters.get(agentId);
    if (!adapter) {
      throw new Error(`No adapter registered for agent: ${agentId}`);
    }

    const timeout = deadline - Date.now();
    if (timeout <= 0) {
      throw new TimeoutError('bid_request', this.config.bidTimeoutMs);
    }

    // Request bid via adapter
    const bidScores = await Promise.race([
      adapter.generateBid(context),
      this.createTimeout(timeout, 'bid'),
    ]);

    return {
      id: ulid(),
      conversationId: context.conversationId,
      turnNumber: context.currentTurn,
      agentId,
      scores: bidScores,
      decision: { action: 'bid' },
      submittedAt: new Date(),
    };
  }

  /**
   * Request a response from the winning agent
   */
  private async requestResponse(
    agentId: string,
    context: CompactContext
  ): Promise<string> {
    const adapter = this.adapters.get(agentId);
    if (!adapter) {
      throw new Error(`No adapter registered for agent: ${agentId}`);
    }

    const response = await Promise.race([
      adapter.generate({
        messages: this.buildMessagesFromContext(context),
        systemPrompt: this.buildSystemPrompt(context),
        maxTokens: 2000,
      }),
      this.createTimeout(this.config.responseTimeoutMs, 'response'),
    ]);

    return response.content;
  }

  /**
   * Simple round-robin selection (when bidding disabled)
   */
  private roundRobinSelect(context: CompactContext): BidResult {
    const activeParticipants = this.conversation.participants
      .filter((p) => p.role === 'active')
      .map((p) => p.agentId);

    // Find next agent in rotation
    const currentIndex = context.currentTurn % activeParticipants.length;
    const winner = activeParticipants[currentIndex];

    return {
      winner,
      finalScores: { [winner]: 1 },
      fairnessAdjustments: {},
    };
  }

  /**
   * Create a BTSMessage from a response
   */
  private createMessage(
    content: string,
    agentId: string,
    context: CompactContext
  ): BTSMessage {
    return {
      id: ulid(),
      cid: context.conversationId,
      t: context.currentTurn + 1,
      a: agentId,
      type: 'res',
      p: {
        content,
        meta: {
          tokens: { in: 0, out: this.estimateTokens(content) },
          model: 'unknown',
          latency: 0,
        },
      },
      ts: Date.now(),
    };
  }

  /**
   * Build messages array from context for the adapter
   */
  private buildMessagesFromContext(
    context: CompactContext
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    // Add summary as context
    if (context.sum) {
      messages.push({
        role: 'user',
        content: `[Conversation Summary]\n${context.sum}`,
      });
    }

    // Add recent turns
    for (const turn of context.last) {
      messages.push({
        role: 'user',
        content: `[${turn.a}]: ${turn.key}`,
      });
    }

    // Add current task/goal
    messages.push({
      role: 'user',
      content: `[Current Goal]: ${context.goal}\n\nPlease provide your response.`,
    });

    return messages;
  }

  /**
   * Build system prompt for the agent
   */
  private buildSystemPrompt(context: CompactContext): string {
    return `You are participating in a multi-agent conversation about: ${context.topic}

Your goal: ${context.goal}

Other participants: ${context.participants.join(', ')}

Guidelines:
- Be concise and focused
- Build on what others have said
- If you have nothing new to add, say so briefly
- Cite specific points from other agents when relevant`;
  }

  /**
   * Get participant stats for bidding
   */
  private getParticipantStats(): Map<string, ParticipantStats> {
    return new Map(
      this.conversation.participants.map((p) => [p.agentId, p.stats])
    );
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(ms: number, operation: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(operation, ms));
      }, ms);
    });
  }

  /**
   * Estimate token count (rough)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

// -----------------------------------------------------------------------------
// Orchestrator Factory
// -----------------------------------------------------------------------------

export function createOrchestrator(
  conversation: Conversation,
  transport: BTSTransport,
  config?: Partial<OrchestratorConfig>
): Orchestrator {
  return new Orchestrator(conversation, transport, {
    ...DEFAULT_CONFIG,
    ...config,
  });
}
