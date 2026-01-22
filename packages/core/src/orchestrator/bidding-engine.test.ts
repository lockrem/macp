import { describe, it, expect, beforeEach } from 'vitest';
import { BiddingEngine, type BiddingConfig } from './bidding-engine.js';
import type { Bid, BidScores, ParticipantStats, ConversationState } from '@macp/shared';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createBid(
  agentId: string,
  scores: Partial<BidScores> = {},
  action: 'bid' | 'pass' | 'defer' = 'bid',
  deferTo?: string
): Bid {
  return {
    id: `bid_${agentId}`,
    conversationId: 'test-conv',
    turnNumber: 1,
    agentId,
    scores: {
      relevance: 0.5,
      confidence: 0.5,
      novelty: 0.5,
      urgency: 0.1,
      ...scores,
    },
    decision: {
      action,
      deferTo,
    },
    submittedAt: new Date(),
  };
}

function createParticipantStats(
  turnsTaken: number = 0,
  lastSpokeAt?: Date
): ParticipantStats {
  return {
    turnsTaken,
    tokensUsed: turnsTaken * 500,
    avgBidScore: 0.5,
    lastSpokeAt,
  };
}

function createConversationState(
  currentTurn: number = 1,
  currentSpeaker?: string
): ConversationState {
  return {
    status: 'active',
    currentTurn,
    currentSpeaker,
  };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('BiddingEngine', () => {
  let engine: BiddingEngine;

  beforeEach(() => {
    engine = new BiddingEngine();
  });

  describe('evaluateBids', () => {
    it('should select the agent with the highest bid score', () => {
      const bids = new Map<string, Bid>([
        ['agent-a', createBid('agent-a', { relevance: 0.9, confidence: 0.8 })],
        ['agent-b', createBid('agent-b', { relevance: 0.5, confidence: 0.5 })],
      ]);

      const stats = new Map<string, ParticipantStats>([
        ['agent-a', createParticipantStats(0)],
        ['agent-b', createParticipantStats(0)],
      ]);

      const state = createConversationState(1);

      const result = engine.evaluateBids(bids, state, stats);

      expect(result.winner).toBe('agent-a');
      expect(result.finalScores['agent-a']).toBeGreaterThan(result.finalScores['agent-b']);
    });

    it('should skip agents who passed', () => {
      const bids = new Map<string, Bid>([
        ['agent-a', createBid('agent-a', { relevance: 0.9 }, 'pass')],
        ['agent-b', createBid('agent-b', { relevance: 0.5 })],
      ]);

      const stats = new Map<string, ParticipantStats>([
        ['agent-a', createParticipantStats(0)],
        ['agent-b', createParticipantStats(0)],
      ]);

      const state = createConversationState(1);

      const result = engine.evaluateBids(bids, state, stats);

      expect(result.winner).toBe('agent-b');
      expect(result.finalScores['agent-a']).toBeUndefined();
    });

    it('should apply recency penalty to agents who spoke recently', () => {
      const bids = new Map<string, Bid>([
        ['agent-a', createBid('agent-a', { relevance: 0.8, confidence: 0.8 })],
        ['agent-b', createBid('agent-b', { relevance: 0.7, confidence: 0.7 })],
      ]);

      // Agent A spoke recently (high turn count relative to current turn)
      const stats = new Map<string, ParticipantStats>([
        ['agent-a', createParticipantStats(5, new Date())],
        ['agent-b', createParticipantStats(1)],
      ]);

      // Current turn is 5, agent-a has taken 5 turns (very active)
      const state = createConversationState(5, 'agent-a');

      const result = engine.evaluateBids(bids, state, stats);

      // Agent B should win due to participation balance bonus
      // (agent-a is overrepresented)
      expect(result.fairnessAdjustments['agent-a']).toBeLessThan(
        result.fairnessAdjustments['agent-b']
      );
    });

    it('should apply participation bonus to underrepresented agents', () => {
      const bids = new Map<string, Bid>([
        ['agent-a', createBid('agent-a', { relevance: 0.6 })],
        ['agent-b', createBid('agent-b', { relevance: 0.6 })],
      ]);

      // Agent B has participated less
      const stats = new Map<string, ParticipantStats>([
        ['agent-a', createParticipantStats(8)],
        ['agent-b', createParticipantStats(2)],
      ]);

      const state = createConversationState(10);

      const result = engine.evaluateBids(bids, state, stats);

      // Agent B should get a participation bonus
      expect(result.fairnessAdjustments['agent-b']).toBeGreaterThan(
        result.fairnessAdjustments['agent-a']
      );
    });

    it('should give bonus to agents deferred to', () => {
      const bids = new Map<string, Bid>([
        ['agent-a', createBid('agent-a', { relevance: 0.5 }, 'defer', 'agent-b')],
        ['agent-b', createBid('agent-b', { relevance: 0.5 })],
        ['agent-c', createBid('agent-c', { relevance: 0.5 })],
      ]);

      const stats = new Map<string, ParticipantStats>([
        ['agent-a', createParticipantStats(0)],
        ['agent-b', createParticipantStats(0)],
        ['agent-c', createParticipantStats(0)],
      ]);

      const state = createConversationState(1);

      const result = engine.evaluateBids(bids, state, stats);

      // Agent B should get a deferral bonus
      expect(result.finalScores['agent-b']).toBeGreaterThan(
        result.finalScores['agent-c']
      );
    });

    it('should throw when no valid bids received', () => {
      const bids = new Map<string, Bid>([
        ['agent-a', createBid('agent-a', {}, 'pass')],
        ['agent-b', createBid('agent-b', {}, 'pass')],
      ]);

      const stats = new Map<string, ParticipantStats>([
        ['agent-a', createParticipantStats(0)],
        ['agent-b', createParticipantStats(0)],
      ]);

      const state = createConversationState(1);

      expect(() => engine.evaluateBids(bids, state, stats)).toThrow(
        'No valid bids received'
      );
    });

    it('should handle ties by selecting one winner', () => {
      const bids = new Map<string, Bid>([
        ['agent-a', createBid('agent-a', { relevance: 0.5, confidence: 0.5 })],
        ['agent-b', createBid('agent-b', { relevance: 0.5, confidence: 0.5 })],
      ]);

      const stats = new Map<string, ParticipantStats>([
        ['agent-a', createParticipantStats(0)],
        ['agent-b', createParticipantStats(0)],
      ]);

      const state = createConversationState(1);

      const result = engine.evaluateBids(bids, state, stats);

      // Should have a winner (one of the two)
      expect(['agent-a', 'agent-b']).toContain(result.winner);
      // Should indicate tie-breaker was used
      expect(result.tieBreakerUsed).toBe('random');
    });
  });

  describe('createPassBid', () => {
    it('should create a valid pass bid', () => {
      const bid = engine.createPassBid('agent-a', 'conv-123', 5);

      expect(bid.agentId).toBe('agent-a');
      expect(bid.conversationId).toBe('conv-123');
      expect(bid.turnNumber).toBe(5);
      expect(bid.decision.action).toBe('pass');
      expect(bid.scores.relevance).toBe(0);
      expect(bid.scores.confidence).toBe(0);
    });
  });

  describe('custom configuration', () => {
    it('should respect custom weight configuration', () => {
      const customConfig: BiddingConfig = {
        weights: {
          relevance: 1.0, // Only relevance matters
          confidence: 0,
          novelty: 0,
          urgency: 0,
        },
        fairness: {
          recencyPenaltyWeight: 0,
          cooldownTurns: 3,
          participationBalanceWeight: 0,
          maxConsecutiveTurns: 2,
        },
        timeouts: {
          bidCollectionMs: 1000,
          minBidsRequired: 1,
        },
      };

      const customEngine = new BiddingEngine(customConfig);

      const bids = new Map<string, Bid>([
        ['agent-a', createBid('agent-a', { relevance: 0.9, confidence: 0.1 })],
        ['agent-b', createBid('agent-b', { relevance: 0.3, confidence: 0.9 })],
      ]);

      const stats = new Map<string, ParticipantStats>([
        ['agent-a', createParticipantStats(0)],
        ['agent-b', createParticipantStats(0)],
      ]);

      const state = createConversationState(1);

      const result = customEngine.evaluateBids(bids, state, stats);

      // Agent A should win because only relevance matters
      expect(result.winner).toBe('agent-a');
    });
  });
});
