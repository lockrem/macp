import { createClaudeAdapter } from '@macp/core';
import type { ExtractedFact, FactExtractionResult } from '@macp/shared';
import { ulid } from 'ulid';

// -----------------------------------------------------------------------------
// Fact Extraction Service
// Uses LLM to extract structured facts from conversations
// -----------------------------------------------------------------------------

const EXTRACTION_SYSTEM_PROMPT = `You are a fact extraction system. Your job is to extract factual information about the USER from conversations.

IMPORTANT RULES:
1. Only extract facts about the USER (the human), not the assistant
2. Facts must be specific, not opinions or preferences (unless explicitly stated)
3. Assign each fact to a category
4. Rate confidence as:
   - "high": User explicitly stated this fact
   - "medium": Fact can be reasonably inferred
   - "low": Fact is implied but uncertain

COMMON CATEGORIES (create new ones if needed):
- health: Medical conditions, medications, doctors, symptoms, allergies
- exercise: Workouts, fitness routines, sports, physical activities
- personal: Age, birthday, family, location, relationships
- employment: Job, employer, work history, skills, income
- financial: Banking, investments, insurance, major purchases
- preferences: Likes, dislikes, hobbies, interests
- travel: Trips, destinations, travel plans
- education: Schools, degrees, certifications, learning

OUTPUT FORMAT (JSON array):
[
  {
    "category": "health",
    "categoryDisplayName": "Health & Medical",
    "key": "current_medications",
    "value": ["Lisinopril 10mg daily", "Metformin 500mg twice daily"],
    "confidence": "high"
  }
]

If no facts can be extracted, return an empty array: []`;

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Extracts facts from a conversation using an LLM
 */
export async function extractFactsFromConversation(
  conversationId: string,
  messages: ConversationMessage[],
  apiKey?: string
): Promise<FactExtractionResult> {
  // Use provided API key or fall back to environment variable
  const key = apiKey || process.env.ANTHROPIC_API_KEY;

  if (!key) {
    console.warn('[FactExtraction] No API key available, skipping extraction');
    return {
      conversationId,
      extractedAt: new Date().toISOString(),
      factsByCategory: {},
    };
  }

  const adapter = createClaudeAdapter(key, 'claude-sonnet-4-20250514');

  // Format conversation for the LLM
  const conversationText = messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const userPrompt = `Extract all facts about the USER from this conversation:

${conversationText}

Return a JSON array of extracted facts. If no facts found, return [].`;

  try {
    const response = await adapter.generate({
      messages: [{ role: 'user', content: userPrompt }],
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      maxTokens: 2000,
      temperature: 0.1, // Low temperature for consistent extraction
    });

    // Parse the JSON response
    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log('[FactExtraction] No JSON array found in response');
      return {
        conversationId,
        extractedAt: new Date().toISOString(),
        factsByCategory: {},
      };
    }

    const extractedFacts: ExtractedFact[] = JSON.parse(jsonMatch[0]);

    // Group facts by category
    const factsByCategory: Record<string, ExtractedFact[]> = {};
    for (const fact of extractedFacts) {
      const category = fact.category.toLowerCase().replace(/\s+/g, '-');
      if (!factsByCategory[category]) {
        factsByCategory[category] = [];
      }
      factsByCategory[category].push({
        ...fact,
        category, // Normalized category name
      });
    }

    console.log(`[FactExtraction] Extracted ${extractedFacts.length} facts from conversation ${conversationId}`);

    return {
      conversationId,
      extractedAt: new Date().toISOString(),
      factsByCategory,
    };
  } catch (error) {
    console.error('[FactExtraction] Failed to extract facts:', error);
    return {
      conversationId,
      extractedAt: new Date().toISOString(),
      factsByCategory: {},
    };
  }
}

/**
 * Generates a natural language summary for a memory category using LLM
 */
export async function generateLLMSummary(
  categoryName: string,
  displayName: string,
  facts: Array<{ key: string; value: unknown }>,
  apiKey?: string
): Promise<string> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;

  if (!key) {
    // Fall back to simple summary
    return facts.map(f => `${f.key}: ${JSON.stringify(f.value)}`).join('. ');
  }

  const adapter = createClaudeAdapter(key, 'claude-sonnet-4-20250514');

  const factsText = facts
    .map(f => `- ${f.key}: ${JSON.stringify(f.value)}`)
    .join('\n');

  const prompt = `Given these facts about a user's ${displayName.toLowerCase()}, write a concise 1-3 sentence summary suitable for injecting into an AI assistant's context. Write in third person ("User has...", "User takes...").

Facts:
${factsText}

Write only the summary, no preamble.`;

  try {
    const response = await adapter.generate({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You are a helpful assistant that writes concise summaries.',
      maxTokens: 300,
      temperature: 0.3,
    });

    return response.content.trim();
  } catch (error) {
    console.error('[FactExtraction] Failed to generate summary:', error);
    // Fall back to simple summary
    return facts.map(f => `${f.key}: ${JSON.stringify(f.value)}`).join('. ');
  }
}

/**
 * Converts extracted facts to MemoryFact format with IDs
 */
export function extractedFactsToMemoryFacts(
  extractedFacts: ExtractedFact[],
  conversationId: string
): Array<{
  id: string;
  key: string;
  value: string | number | string[] | Record<string, unknown>;
  confidence: 'high' | 'medium' | 'low';
  learnedFrom: string;
  learnedAt: string;
}> {
  const now = new Date().toISOString();

  return extractedFacts.map(fact => ({
    id: ulid(),
    key: fact.key,
    value: fact.value as string | number | string[] | Record<string, unknown>,
    confidence: fact.confidence,
    learnedFrom: conversationId,
    learnedAt: now,
  }));
}
