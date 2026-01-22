import type { AgentProvider, BidScores, CompactContext } from '@macp/shared';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface AdapterConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs: number;
}

export interface GenerateRequest {
  messages: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateResponse {
  content: string;
  tokensUsed: { input: number; output: number };
  model: string;
  finishReason: string;
}

// -----------------------------------------------------------------------------
// Base Adapter
// -----------------------------------------------------------------------------

export abstract class AgentAdapter {
  abstract readonly provider: AgentProvider;

  constructor(protected config: AdapterConfig) {}

  /**
   * Generate a response from the agent
   */
  abstract generate(request: GenerateRequest): Promise<GenerateResponse>;

  /**
   * Generate bid scores for a conversation turn
   */
  abstract generateBid(context: CompactContext): Promise<BidScores>;

  /**
   * Health check for the adapter
   */
  abstract healthCheck(): Promise<boolean>;

  /**
   * Get the model being used
   */
  getModel(): string {
    return this.config.model;
  }
}

// -----------------------------------------------------------------------------
// Bid Prompt Template
// -----------------------------------------------------------------------------

export const BID_SYSTEM_PROMPT = `You are evaluating whether to contribute to a multi-agent conversation.

Rate your ability to contribute on a scale of 0 to 1 for each dimension:
- relevance: How relevant is this topic to your expertise?
- confidence: How confident are you in the quality of your response?
- novelty: How much new information can you add beyond what's been said?
- urgency: Do you have time-sensitive information to share?

Be honest - only bid high if you genuinely have valuable input.
If the topic is outside your expertise, score low on relevance and confidence.

Respond with ONLY valid JSON in this exact format:
{"relevance": 0.X, "confidence": 0.X, "novelty": 0.X, "urgency": 0.X}`;

export function buildBidPrompt(context: CompactContext): string {
  const recentTurns = context.last
    .map((t) => `- ${t.a}: ${t.key}`)
    .join('\n');

  return `
Topic: ${context.topic}
Goal: ${context.goal}

${context.sum ? `Summary so far: ${context.sum}` : ''}

Recent discussion:
${recentTurns || '(No messages yet)'}

Based on this context, rate your ability to contribute.
`.trim();
}

export function parseBidResponse(content: string): BidScores {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const json = JSON.parse(jsonMatch[0]);

    // Clamp values to 0-1 range
    return {
      relevance: Math.min(1, Math.max(0, parseFloat(json.relevance) || 0)),
      confidence: Math.min(1, Math.max(0, parseFloat(json.confidence) || 0)),
      novelty: Math.min(1, Math.max(0, parseFloat(json.novelty) || 0)),
      urgency: Math.min(1, Math.max(0, parseFloat(json.urgency) || 0)),
    };
  } catch {
    // Return low scores if parsing fails
    return { relevance: 0.1, confidence: 0.1, novelty: 0.1, urgency: 0 };
  }
}
