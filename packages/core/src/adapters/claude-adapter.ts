import type { BidScores, CompactContext } from '@macp/shared';
import {
  AgentAdapter,
  type AdapterConfig,
  type GenerateRequest,
  type GenerateResponse,
  BID_SYSTEM_PROMPT,
  buildBidPrompt,
  parseBidResponse,
} from './base-adapter.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ClaudeContentBlock {
  type: string;
  text?: string;
}

interface ClaudeResponse {
  content: ClaudeContentBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  model: string;
  stop_reason: string;
}

// -----------------------------------------------------------------------------
// Claude Adapter
// -----------------------------------------------------------------------------

export class ClaudeAdapter extends AgentAdapter {
  readonly provider = 'anthropic' as const;

  constructor(config: AdapterConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://api.anthropic.com',
    });
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: request.maxTokens ?? 4096,
        system: request.systemPrompt,
        messages: request.messages.map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
        temperature: request.temperature,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as ClaudeResponse;

    // Extract text content
    const textContent = data.content.find(
      (c) => c.type === 'text'
    );

    return {
      content: textContent?.text || '',
      tokensUsed: {
        input: data.usage.input_tokens,
        output: data.usage.output_tokens,
      },
      model: data.model,
      finishReason: data.stop_reason,
    };
  }

  async generateBid(context: CompactContext): Promise<BidScores> {
    const response = await this.generate({
      messages: [{ role: 'user', content: buildBidPrompt(context) }],
      systemPrompt: BID_SYSTEM_PROMPT,
      maxTokens: 150,
      temperature: 0.3, // Lower temperature for more consistent scoring
    });

    return parseBidResponse(response.content);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.generate({
        messages: [{ role: 'user', content: 'Respond with: OK' }],
        maxTokens: 10,
      });
      return true;
    } catch {
      return false;
    }
  }
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

export function createClaudeAdapter(
  apiKey: string,
  model: string = 'claude-3-5-sonnet-20241022',
  timeoutMs: number = 30000
): ClaudeAdapter {
  return new ClaudeAdapter({
    apiKey,
    model,
    timeoutMs,
  });
}
