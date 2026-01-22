import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager, type ContextManagerConfig } from './context-manager.js';
import type { CompactContext, BTSMessage, TurnRef } from '@macp/shared';

// -----------------------------------------------------------------------------
// Test Helpers
// -----------------------------------------------------------------------------

function createContext(overrides: Partial<CompactContext> = {}): CompactContext {
  return {
    conversationId: 'test-conv',
    currentTurn: 0,
    sum: '',
    last: [],
    topic: 'Test Topic',
    goal: 'Test Goal',
    participants: ['agent-a', 'agent-b'],
    ...overrides,
  };
}

function createBTSMessage(
  turnNumber: number,
  agentId: string,
  content: string
): BTSMessage {
  return {
    id: `msg_${turnNumber}`,
    cid: 'test-conv',
    t: turnNumber,
    a: agentId,
    type: 'res',
    p: {
      content,
      meta: {
        tokens: { in: 100, out: 100 },
        model: 'test-model',
        latency: 500,
      },
    },
    ts: Date.now(),
  };
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('ContextManager', () => {
  let manager: ContextManager;

  beforeEach(() => {
    manager = new ContextManager();
  });

  describe('createInitialContext', () => {
    it('should create a valid initial context', () => {
      const context = manager.createInitialContext(
        'conv-123',
        'AI Collaboration',
        'Explore best practices',
        ['alice', 'bob']
      );

      expect(context.conversationId).toBe('conv-123');
      expect(context.currentTurn).toBe(0);
      expect(context.sum).toBe('');
      expect(context.last).toEqual([]);
      expect(context.topic).toBe('AI Collaboration');
      expect(context.goal).toBe('Explore best practices');
      expect(context.participants).toEqual(['alice', 'bob']);
    });
  });

  describe('updateContext', () => {
    it('should increment turn number', async () => {
      const context = createContext({ currentTurn: 5 });
      const message = createBTSMessage(6, 'agent-a', 'Test response');

      const updated = await manager.updateContext(context, message);

      expect(updated.currentTurn).toBe(6);
    });

    it('should add turn reference to last array', async () => {
      const context = createContext();
      const message = createBTSMessage(1, 'agent-a', 'This is a test response.');

      const updated = await manager.updateContext(context, message);

      expect(updated.last).toHaveLength(1);
      expect(updated.last[0].t).toBe(1);
      expect(updated.last[0].a).toBe('agent-a');
      expect(updated.last[0].key).toContain('This is a test response');
    });

    it('should limit last array to maxRecentTurns', async () => {
      const existingTurns: TurnRef[] = [
        { t: 1, a: 'agent-a', key: 'Turn 1' },
        { t: 2, a: 'agent-b', key: 'Turn 2' },
        { t: 3, a: 'agent-a', key: 'Turn 3' },
        { t: 4, a: 'agent-b', key: 'Turn 4' },
        { t: 5, a: 'agent-a', key: 'Turn 5' },
      ];

      const context = createContext({ last: existingTurns, currentTurn: 5 });
      const message = createBTSMessage(6, 'agent-b', 'New turn');

      const updated = await manager.updateContext(context, message);

      // Default maxRecentTurns is 5
      expect(updated.last).toHaveLength(5);
      expect(updated.last[0].t).toBe(2); // Oldest removed
      expect(updated.last[4].t).toBe(6); // Newest added
    });

    it('should extract key point from long content', async () => {
      const context = createContext();
      const longContent = `This is the first sentence. This is the second sentence.
        This is the third sentence that should be truncated.
        This is the fourth sentence. This is the fifth sentence.`;
      const message = createBTSMessage(1, 'agent-a', longContent);

      const updated = await manager.updateContext(context, message);

      // Should only contain first 1-2 sentences
      expect(updated.last[0].key).toContain('first sentence');
      expect(updated.last[0].key).toContain('second sentence');
      expect(updated.last[0].key).not.toContain('fifth sentence');
    });

    it('should truncate key point to maxKeyPointLength', async () => {
      const customManager = new ContextManager({ maxKeyPointLength: 50 } as any);
      const context = createContext();
      const longContent = 'A'.repeat(300);
      const message = createBTSMessage(1, 'agent-a', longContent);

      const updated = await customManager.updateContext(context, message);

      expect(updated.last[0].key.length).toBeLessThanOrEqual(50);
      expect(updated.last[0].key).toContain('...');
    });

    it('should preserve existing summary when not summarizing', async () => {
      const context = createContext({
        sum: 'Existing summary',
        currentTurn: 2,
      });
      const message = createBTSMessage(3, 'agent-a', 'Response');

      const updated = await manager.updateContext(context, message);

      expect(updated.sum).toBe('Existing summary');
    });

    it('should call summarizer at configured intervals', async () => {
      let summarizerCalled = false;
      const mockSummarizer = async () => {
        summarizerCalled = true;
        return 'New summary';
      };

      // Default summarizeEveryNTurns is 5
      const context = createContext({ currentTurn: 4 }); // Will become 5
      const message = createBTSMessage(5, 'agent-a', 'Response');

      const updated = await manager.updateContext(context, message, mockSummarizer);

      expect(summarizerCalled).toBe(true);
      expect(updated.sum).toBe('New summary');
    });
  });

  describe('buildSummaryPrompt', () => {
    it('should build a valid summary prompt', () => {
      const turns: TurnRef[] = [
        { t: 1, a: 'Alice', key: 'First point about AI' },
        { t: 2, a: 'Bob', key: 'Response about collaboration' },
      ];

      const prompt = manager.buildSummaryPrompt('Previous summary', turns);

      expect(prompt).toContain('Previous summary');
      expect(prompt).toContain('Alice: First point about AI');
      expect(prompt).toContain('Bob: Response about collaboration');
      expect(prompt).toContain('updated summary');
    });

    it('should handle empty summary', () => {
      const turns: TurnRef[] = [
        { t: 1, a: 'Alice', key: 'First message' },
      ];

      const prompt = manager.buildSummaryPrompt('', turns);

      expect(prompt).toContain('(None yet)');
    });
  });

  describe('routeContextForRole', () => {
    it('should route context for expert role', () => {
      const context = createContext({
        sum: 'Full summary',
        last: [
          { t: 1, a: 'a', key: '1' },
          { t: 2, a: 'b', key: '2' },
          { t: 3, a: 'a', key: '3' },
          { t: 4, a: 'b', key: '4' },
          { t: 5, a: 'a', key: '5' },
          { t: 6, a: 'b', key: '6' },
        ],
        participants: ['agent-a', 'agent-b'],
      });

      const routed = manager.routeContextForRole(context, 'expert');

      expect(routed.sum).toBe('Full summary'); // Included
      expect(routed.last).toHaveLength(5); // Last 5
      expect(routed.participants).toEqual([]); // Excluded for expert
    });

    it('should route context for synthesizer role', () => {
      const context = createContext({
        sum: 'Full summary',
        last: Array.from({ length: 15 }, (_, i) => ({
          t: i + 1,
          a: `agent-${i % 2}`,
          key: `Turn ${i + 1}`,
        })),
        participants: ['agent-a', 'agent-b'],
      });

      const routed = manager.routeContextForRole(context, 'synthesizer');

      expect(routed.sum).toBe('Full summary'); // Included
      expect(routed.last).toHaveLength(10); // Last 10
      expect(routed.participants).toEqual(['agent-a', 'agent-b']); // Included
    });

    it('should route context for critic role', () => {
      const context = createContext({
        sum: 'Full summary',
        last: [
          { t: 1, a: 'a', key: '1' },
          { t: 2, a: 'b', key: '2' },
          { t: 3, a: 'a', key: '3' },
        ],
        participants: ['agent-a', 'agent-b'],
      });

      const routed = manager.routeContextForRole(context, 'critic');

      expect(routed.sum).toBe(''); // Excluded
      expect(routed.last).toHaveLength(1); // Only last 1
      expect(routed.last[0].t).toBe(3); // Most recent
      expect(routed.participants).toEqual([]); // Excluded
    });

    it('should use default routing for unknown role', () => {
      const context = createContext({
        sum: 'Summary',
        last: [
          { t: 1, a: 'a', key: '1' },
          { t: 2, a: 'b', key: '2' },
          { t: 3, a: 'a', key: '3' },
          { t: 4, a: 'b', key: '4' },
        ],
        participants: ['agent-a', 'agent-b'],
      });

      const routed = manager.routeContextForRole(context, 'default');

      expect(routed.sum).toBe('Summary'); // Included
      expect(routed.last).toHaveLength(3); // Last 3
      expect(routed.participants).toEqual(['agent-a', 'agent-b']); // Included
    });
  });

  describe('estimateContextTokens', () => {
    it('should estimate tokens for context', () => {
      const context = createContext({
        sum: 'A'.repeat(100), // ~25 tokens
        last: [
          { t: 1, a: 'a', key: 'B'.repeat(40) }, // ~10 tokens
          { t: 2, a: 'b', key: 'C'.repeat(40) }, // ~10 tokens
        ],
      });

      const estimate = manager.estimateContextTokens(context);

      // 25 (summary) + 20 (turns) + 50 (overhead) = ~95
      expect(estimate).toBeGreaterThan(50);
      expect(estimate).toBeLessThan(150);
    });

    it('should handle empty context', () => {
      const context = createContext({
        sum: '',
        last: [],
      });

      const estimate = manager.estimateContextTokens(context);

      // Just metadata overhead
      expect(estimate).toBe(50);
    });
  });
});
