import type { BidScores, CompactContext } from '@macp/shared';
import {
  AgentAdapter,
  type AdapterConfig,
  type GenerateRequest,
  type GenerateResponse,
} from './base-adapter.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface MockAdapterConfig extends AdapterConfig {
  /** Simulated response delay in ms */
  responseDelayMs?: number;
  /** Fixed responses to return (cycles through them) */
  responses?: string[];
  /** Fixed bid scores to return */
  bidScores?: BidScores;
  /** Probability of simulating a failure (0-1) */
  failureRate?: number;
  /** Agent personality for generated responses */
  personality?: string;
}

// -----------------------------------------------------------------------------
// Mock Adapter
// -----------------------------------------------------------------------------

/**
 * Mock adapter for testing without real API calls.
 * Generates deterministic responses based on configuration.
 */
export class MockAdapter extends AgentAdapter {
  readonly provider = 'custom' as const;

  private responseIndex: number = 0;
  private callCount: number = 0;
  private mockConfig: MockAdapterConfig;

  constructor(config: MockAdapterConfig) {
    super(config);
    this.mockConfig = {
      responseDelayMs: 100,
      failureRate: 0,
      personality: 'helpful assistant',
      ...config,
    };
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    this.callCount++;

    // Simulate delay
    if (this.mockConfig.responseDelayMs) {
      await this.sleep(this.mockConfig.responseDelayMs);
    }

    // Simulate random failures
    if (this.mockConfig.failureRate && Math.random() < this.mockConfig.failureRate) {
      throw new Error('Simulated adapter failure');
    }

    // Return fixed response if configured
    if (this.mockConfig.responses && this.mockConfig.responses.length > 0) {
      const response = this.mockConfig.responses[this.responseIndex];
      this.responseIndex = (this.responseIndex + 1) % this.mockConfig.responses.length;
      return this.createResponse(response);
    }

    // Generate contextual response
    const response = this.generateContextualResponse(request);
    return this.createResponse(response);
  }

  async generateBid(context: CompactContext): Promise<BidScores> {
    // Simulate delay
    if (this.mockConfig.responseDelayMs) {
      await this.sleep(this.mockConfig.responseDelayMs / 2);
    }

    // Return fixed scores if configured
    if (this.mockConfig.bidScores) {
      return this.mockConfig.bidScores;
    }

    // Generate contextual bid scores
    return this.generateContextualBidScores(context);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  /**
   * Get the number of times generate() was called
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Reset call count and response index
   */
  reset(): void {
    this.callCount = 0;
    this.responseIndex = 0;
  }

  private createResponse(content: string): GenerateResponse {
    return {
      content,
      tokensUsed: {
        input: Math.ceil(content.length / 4),
        output: Math.ceil(content.length / 4),
      },
      model: 'mock-model',
      finishReason: 'stop',
    };
  }

  private generateContextualResponse(request: GenerateRequest): string {
    const lastMessage = request.messages[request.messages.length - 1];
    const content = lastMessage?.content || '';

    // Extract topic from content
    const topicMatch = content.match(/about[:\s]+([^.!?\n]+)/i);
    const topic = topicMatch ? topicMatch[1].trim() : 'the discussion';

    // Generate varied responses based on call count
    const responses = [
      `That's an interesting point about ${topic}. I think we should consider the broader implications and how this affects our overall approach.`,
      `Building on what was said, I believe ${topic} presents both opportunities and challenges. Let me elaborate on a few key aspects.`,
      `I appreciate the perspective shared. Regarding ${topic}, I'd like to add that we should also think about long-term sustainability.`,
      `Great discussion so far. My view on ${topic} is that we need to balance innovation with practical constraints.`,
      `To summarize our progress on ${topic}: we've covered several important points. Perhaps we should now focus on actionable next steps.`,
    ];

    return responses[this.callCount % responses.length];
  }

  private generateContextualBidScores(context: CompactContext): BidScores {
    // Generate scores based on context
    const hasRecentActivity = context.last.length > 0;
    const isNewTopic = context.currentTurn < 3;

    // Higher relevance for new topics, lower if we've been quiet
    const relevance = isNewTopic ? 0.8 : 0.6 + Math.random() * 0.2;

    // Confidence varies
    const confidence = 0.5 + Math.random() * 0.4;

    // Novelty decreases over time
    const novelty = Math.max(0.3, 0.8 - context.currentTurn * 0.1);

    // Low urgency unless explicitly needed
    const urgency = Math.random() < 0.1 ? 0.8 : 0.1;

    return {
      relevance: this.clamp(relevance),
      confidence: this.clamp(confidence),
      novelty: this.clamp(novelty),
      urgency: this.clamp(urgency),
    };
  }

  private clamp(value: number): number {
    return Math.min(1, Math.max(0, value));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

export function createMockAdapter(config?: Partial<MockAdapterConfig>): MockAdapter {
  return new MockAdapter({
    apiKey: 'mock-api-key',
    model: 'mock-model',
    timeoutMs: 5000,
    ...config,
  });
}

/**
 * Create a mock adapter with fixed responses for deterministic testing
 */
export function createDeterministicMockAdapter(
  responses: string[],
  bidScores?: BidScores
): MockAdapter {
  return new MockAdapter({
    apiKey: 'mock-api-key',
    model: 'mock-model',
    timeoutMs: 5000,
    responseDelayMs: 10,
    responses,
    bidScores,
  });
}
