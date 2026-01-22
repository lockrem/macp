import type {
  Bid,
  BidScores,
  BidResult,
  ParticipantStats,
  ConversationState,
} from '@macp/shared';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

export interface BiddingConfig {
  weights: {
    relevance: number;
    confidence: number;
    novelty: number;
    urgency: number;
  };
  fairness: {
    recencyPenaltyWeight: number;
    cooldownTurns: number;
    participationBalanceWeight: number;
    maxConsecutiveTurns: number;
  };
  timeouts: {
    bidCollectionMs: number;
    minBidsRequired: number;
  };
}

const DEFAULT_CONFIG: BiddingConfig = {
  weights: {
    relevance: 0.35,
    confidence: 0.25,
    novelty: 0.2,
    urgency: 0.2,
  },
  fairness: {
    recencyPenaltyWeight: 0.15,
    cooldownTurns: 3,
    participationBalanceWeight: 0.1,
    maxConsecutiveTurns: 2,
  },
  timeouts: {
    bidCollectionMs: 1000,
    minBidsRequired: 1,
  },
};

// -----------------------------------------------------------------------------
// Bidding Engine
// -----------------------------------------------------------------------------

export class BiddingEngine {
  constructor(private config: BiddingConfig = DEFAULT_CONFIG) {}

  /**
   * Evaluate collected bids and determine the winner
   */
  evaluateBids(
    bids: Map<string, Bid>,
    conversationState: ConversationState,
    participantStats: Map<string, ParticipantStats>
  ): BidResult {
    const scores = new Map<string, number>();
    const adjustments = new Map<string, number>();

    for (const [agentId, bid] of bids) {
      // Skip agents who passed
      if (bid.decision.action === 'pass') {
        continue;
      }

      // Calculate base score from bid
      const baseScore = this.calculateBaseScore(bid.scores);

      // Calculate fairness adjustments
      const stats = participantStats.get(agentId);
      if (!stats) {
        continue;
      }

      const recencyPenalty = this.calculateRecencyPenalty(
        stats,
        conversationState.currentTurn
      );

      const participationBonus = this.calculateParticipationBonus(
        stats,
        participantStats
      );

      // Check hard constraints
      if (this.violatesHardConstraints(agentId, stats, conversationState)) {
        continue;
      }

      const totalAdjustment = participationBonus - recencyPenalty;
      const finalScore = baseScore + totalAdjustment;

      scores.set(agentId, finalScore);
      adjustments.set(agentId, totalAdjustment);
    }

    // Handle deferrals - give bonus to deferred agents
    for (const [, bid] of bids) {
      if (bid.decision.action === 'defer' && bid.decision.deferTo) {
        const currentScore = scores.get(bid.decision.deferTo) ?? 0;
        scores.set(bid.decision.deferTo, currentScore + 0.1);
      }
    }

    return this.selectWinner(scores, adjustments);
  }

  /**
   * Calculate base score from bid scores using configured weights
   */
  private calculateBaseScore(bidScores: BidScores): number {
    const { weights } = this.config;
    return (
      bidScores.relevance * weights.relevance +
      bidScores.confidence * weights.confidence +
      bidScores.novelty * weights.novelty +
      bidScores.urgency * weights.urgency
    );
  }

  /**
   * Calculate penalty for agents who spoke recently
   */
  private calculateRecencyPenalty(
    stats: ParticipantStats,
    currentTurn: number
  ): number {
    if (!stats.lastSpokeAt || stats.turnsTaken === 0) {
      return 0;
    }

    // Calculate turns since this agent last spoke
    // This is a simplification - in production, track actual turn numbers
    const estimatedTurnsSinceSpoke = Math.max(
      0,
      currentTurn - stats.turnsTaken
    );

    const normalizedRecency = Math.max(
      0,
      1 - estimatedTurnsSinceSpoke / this.config.fairness.cooldownTurns
    );

    return normalizedRecency * this.config.fairness.recencyPenaltyWeight;
  }

  /**
   * Calculate bonus for underrepresented agents
   */
  private calculateParticipationBonus(
    stats: ParticipantStats,
    allStats: Map<string, ParticipantStats>
  ): number {
    const totalTurns = Array.from(allStats.values()).reduce(
      (sum, s) => sum + s.turnsTaken,
      0
    );

    if (totalTurns === 0) {
      return 0;
    }

    const avgParticipation = totalTurns / allStats.size;
    const participationRatio = stats.turnsTaken / avgParticipation;

    // Boost underrepresented agents, penalize overrepresented
    return (
      (1 - participationRatio) * this.config.fairness.participationBalanceWeight
    );
  }

  /**
   * Check if agent violates hard constraints (e.g., max consecutive turns)
   */
  private violatesHardConstraints(
    agentId: string,
    stats: ParticipantStats,
    state: ConversationState
  ): boolean {
    // If this agent is the current speaker and has hit max consecutive
    if (state.currentSpeaker === agentId) {
      // In a real implementation, track consecutive turn count
      // For now, this is a placeholder
      return false;
    }

    return false;
  }

  /**
   * Select winner from scored agents with tie-breaking
   */
  private selectWinner(
    scores: Map<string, number>,
    adjustments: Map<string, number>
  ): BidResult {
    if (scores.size === 0) {
      throw new Error('No valid bids received');
    }

    // Sort by score descending
    const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);

    const [winnerId, winnerScore] = sorted[0];

    // Check for ties (within 0.001)
    const ties = sorted.filter(
      ([, score]) => Math.abs(score - winnerScore) < 0.001
    );

    let tieBreakerUsed: string | undefined;
    let finalWinner = winnerId;

    if (ties.length > 1) {
      // Tie-breaking: random selection (in production, could use trust level)
      tieBreakerUsed = 'random';
      finalWinner = ties[Math.floor(Math.random() * ties.length)][0];
    }

    return {
      winner: finalWinner,
      finalScores: Object.fromEntries(scores),
      tieBreakerUsed,
      fairnessAdjustments: Object.fromEntries(adjustments),
    };
  }

  /**
   * Create a pass bid for an agent that didn't respond
   */
  createPassBid(agentId: string, conversationId: string, turnNumber: number): Bid {
    return {
      id: `bid_${Date.now()}_${agentId}`,
      conversationId,
      turnNumber,
      agentId,
      scores: { relevance: 0, confidence: 0, novelty: 0, urgency: 0 },
      decision: { action: 'pass' },
      submittedAt: new Date(),
    };
  }
}
