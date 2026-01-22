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
// Types (OpenAI-compatible format)
// -----------------------------------------------------------------------------

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

// -----------------------------------------------------------------------------
// Groq Adapter
// -----------------------------------------------------------------------------

export class GroqAdapter extends AgentAdapter {
  readonly provider = 'groq' as const;

  constructor(config: AdapterConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://api.groq.com/openai/v1',
    });
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const messages: GroqMessage[] = [];

    // Add system prompt as first message if provided
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    // Add conversation messages
    for (const msg of request.messages) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as GroqResponse;

    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      tokensUsed: {
        input: data.usage?.prompt_tokens || 0,
        output: data.usage?.completion_tokens || 0,
      },
      model: data.model,
      finishReason: choice?.finish_reason || 'unknown',
    };
  }

  async generateBid(context: CompactContext): Promise<BidScores> {
    const response = await this.generate({
      messages: [{ role: 'user', content: buildBidPrompt(context) }],
      systemPrompt: BID_SYSTEM_PROMPT,
      maxTokens: 150,
      temperature: 0.3,
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

export function createGroqAdapter(
  apiKey: string,
  model: string = 'llama-3.3-70b-versatile',
  timeoutMs: number = 30000
): GroqAdapter {
  return new GroqAdapter({
    apiKey,
    model,
    timeoutMs,
  });
}
