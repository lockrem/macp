import type { CompactContext, TurnRef, BTSMessage } from '@macp/shared';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

export interface ContextManagerConfig {
  maxSummaryTokens: number;
  summarizeEveryNTurns: number;
  maxRecentTurns: number;
  maxKeyPointLength: number;
}

const DEFAULT_CONFIG: ContextManagerConfig = {
  maxSummaryTokens: 500,
  summarizeEveryNTurns: 5,
  maxRecentTurns: 5,
  maxKeyPointLength: 200,
};

// -----------------------------------------------------------------------------
// Context Manager
// -----------------------------------------------------------------------------

export class ContextManager {
  constructor(private config: ContextManagerConfig = DEFAULT_CONFIG) {}

  /**
   * Create initial context for a new conversation
   */
  createInitialContext(
    conversationId: string,
    topic: string,
    goal: string,
    participants: string[]
  ): CompactContext {
    return {
      conversationId,
      currentTurn: 0,
      sum: '',
      last: [],
      topic,
      goal,
      participants,
    };
  }

  /**
   * Update context with a new turn
   */
  async updateContext(
    currentContext: CompactContext,
    newTurn: BTSMessage,
    summarizer?: (existingSummary: string, recentTurns: TurnRef[]) => Promise<string>
  ): Promise<CompactContext> {
    const content = newTurn.p.content || '';

    // Extract key point from the response
    const keyPoint = this.extractKeyPoint(content);

    // Add to recent turns, keeping only the most recent N
    const updatedLast = [
      ...currentContext.last.slice(-(this.config.maxRecentTurns - 1)),
      {
        t: newTurn.t,
        a: newTurn.a,
        key: keyPoint,
      },
    ];

    const newTurnNumber = currentContext.currentTurn + 1;

    // Periodically re-summarize
    let newSummary = currentContext.sum;
    if (
      summarizer &&
      newTurnNumber % this.config.summarizeEveryNTurns === 0
    ) {
      newSummary = await summarizer(currentContext.sum, updatedLast);
    }

    return {
      ...currentContext,
      currentTurn: newTurnNumber,
      sum: newSummary,
      last: updatedLast,
    };
  }

  /**
   * Extract key point from a response (first 1-2 sentences)
   */
  private extractKeyPoint(content: string): string {
    // Split into sentences
    const sentences = content.split(/(?<=[.!?])\s+/);

    // Take first 1-2 sentences
    const keyPart = sentences.slice(0, 2).join(' ');

    // Truncate if needed
    if (keyPart.length > this.config.maxKeyPointLength) {
      return keyPart.slice(0, this.config.maxKeyPointLength - 3) + '...';
    }

    return keyPart;
  }

  /**
   * Build a prompt for the summarizer agent
   */
  buildSummaryPrompt(existingSummary: string, recentTurns: TurnRef[]): string {
    const turnsText = recentTurns
      .map((t) => `- ${t.a}: ${t.key}`)
      .join('\n');

    return `
Current summary: ${existingSummary || '(None yet)'}

Recent turns:
${turnsText}

Provide an updated summary in 2-3 sentences. Focus on:
1. Key decisions made
2. Current state of the discussion
3. Any unresolved questions

Keep it concise and factual.
    `.trim();
  }

  /**
   * Route context based on agent role (selective context)
   */
  routeContextForRole(
    fullContext: CompactContext,
    role: 'expert' | 'synthesizer' | 'critic' | 'default'
  ): CompactContext {
    const routingRules: Record<string, {
      includeSummary: boolean;
      includeRecentTurns: number;
      includeParticipants: boolean;
    }> = {
      expert: {
        includeSummary: true,
        includeRecentTurns: 5,
        includeParticipants: false,
      },
      synthesizer: {
        includeSummary: true,
        includeRecentTurns: 10,
        includeParticipants: true,
      },
      critic: {
        includeSummary: false,
        includeRecentTurns: 1,
        includeParticipants: false,
      },
      default: {
        includeSummary: true,
        includeRecentTurns: 3,
        includeParticipants: true,
      },
    };

    const rule = routingRules[role] || routingRules.default;

    return {
      ...fullContext,
      sum: rule.includeSummary ? fullContext.sum : '',
      last: fullContext.last.slice(-rule.includeRecentTurns),
      participants: rule.includeParticipants ? fullContext.participants : [],
    };
  }

  /**
   * Estimate token count for context (rough approximation)
   */
  estimateContextTokens(context: CompactContext): number {
    const summaryTokens = Math.ceil(context.sum.length / 4);
    const turnsTokens = context.last.reduce(
      (sum, t) => sum + Math.ceil(t.key.length / 4),
      0
    );
    const metadataTokens = 50; // Fixed overhead for structure

    return summaryTokens + turnsTokens + metadataTokens;
  }
}
