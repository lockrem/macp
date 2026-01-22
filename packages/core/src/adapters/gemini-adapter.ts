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

interface GeminiContent {
  parts: Array<{ text: string }>;
  role: string;
}

interface GeminiResponse {
  candidates: Array<{
    content: GeminiContent;
    finishReason: string;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  modelVersion: string;
}

// -----------------------------------------------------------------------------
// Gemini Adapter
// -----------------------------------------------------------------------------

export class GeminiAdapter extends AgentAdapter {
  readonly provider = 'gemini' as const;

  constructor(config: AdapterConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
    });
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    // Build contents array with system instruction support
    const contents: GeminiContent[] = [];

    // Add message history
    for (const msg of request.messages) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      });
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7,
      },
    };

    // Add system instruction if provided
    if (request.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: request.systemPrompt }],
      };
    }

    const response = await fetch(
      `${this.config.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as GeminiResponse;

    // Extract text content from first candidate
    const candidate = data.candidates?.[0];
    const textContent = candidate?.content?.parts?.[0]?.text || '';

    return {
      content: textContent,
      tokensUsed: {
        input: data.usageMetadata?.promptTokenCount || 0,
        output: data.usageMetadata?.candidatesTokenCount || 0,
      },
      model: data.modelVersion || this.config.model,
      finishReason: candidate?.finishReason || 'unknown',
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

export function createGeminiAdapter(
  apiKey: string,
  model: string = 'gemini-1.5-flash',
  timeoutMs: number = 30000
): GeminiAdapter {
  return new GeminiAdapter({
    apiKey,
    model,
    timeoutMs,
  });
}
