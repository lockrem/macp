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

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIChoice {
  message: {
    content: string;
  };
  finish_reason: string;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  model: string;
}

// -----------------------------------------------------------------------------
// OpenAI Adapter
// -----------------------------------------------------------------------------

export class OpenAIAdapter extends AgentAdapter {
  readonly provider = 'openai' as const;

  constructor(config: AdapterConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://api.openai.com',
    });
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    // Build messages array with optional system prompt
    const messages: OpenAIMessage[] = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    for (const m of request.messages) {
      messages.push({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      });
    }

    const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: request.maxTokens ?? 4096,
        messages,
        temperature: request.temperature ?? 0.7,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as OpenAIResponse;

    return {
      content: data.choices[0]?.message?.content || '',
      tokensUsed: {
        input: data.usage.prompt_tokens,
        output: data.usage.completion_tokens,
      },
      model: data.model,
      finishReason: data.choices[0]?.finish_reason || 'unknown',
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

export function createOpenAIAdapter(
  apiKey: string,
  model: string = 'gpt-4o',
  timeoutMs: number = 30000
): OpenAIAdapter {
  return new OpenAIAdapter({
    apiKey,
    model,
    timeoutMs,
  });
}
