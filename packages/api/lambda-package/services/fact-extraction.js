"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractFactsFromConversation = extractFactsFromConversation;
exports.generateLLMSummary = generateLLMSummary;
exports.extractFactsFromIntroduction = extractFactsFromIntroduction;
exports.extractedFactsToMemoryFacts = extractedFactsToMemoryFacts;
const core_1 = require("@macp/core");
const ulid_1 = require("ulid");
// -----------------------------------------------------------------------------
// Fact Extraction Service
// Uses LLM to extract structured facts from conversations
// -----------------------------------------------------------------------------
const EXTRACTION_SYSTEM_PROMPT = `You are a fact extraction system. Your job is to extract factual information about the USER from conversations.

CRITICAL RULES FOR SOURCE VERIFICATION:

1. ONLY extract facts the USER DIRECTLY STATED
   - The user must have explicitly said this themselves
   - "User:" messages are from the user - these are valid sources
   - "Assistant:" messages are from AI agents - be careful with these

2. ALSO extract EVENT OUTCOMES that actually happened:
   - Reservations that were confirmed
   - Appointments that were booked
   - Orders that were placed
   - Actions that were completed

3. DO NOT extract facts that AI agents CLAIMED about the user:
   - If an agent said "the user has allergies" but the user didn't confirm it, DO NOT RECORD
   - Agents may hallucinate or make assumptions - these are NOT facts
   - Only record agent statements if the user CONFIRMED them

4. Confidence ratings:
   - "high": User EXPLICITLY stated this fact directly
   - "medium": User confirmed something an agent mentioned
   - "low": Can be reasonably inferred from user's direct statements

COMMON CATEGORIES (create new ones if needed):
- health: Medical conditions, medications, doctors, symptoms, allergies
- exercise: Workouts, fitness routines, sports, physical activities
- personal: Age, birthday, family, location, relationships
- employment: Job, employer, work history, skills, income
- financial: Banking, investments, insurance, major purchases
- preferences: Likes, dislikes, hobbies, interests
- travel: Trips, destinations, travel plans
- education: Schools, degrees, certifications, learning
- events: Reservations, appointments, bookings, confirmed plans

OUTPUT FORMAT (JSON array):
[
  {
    "category": "events",
    "categoryDisplayName": "Events & Reservations",
    "key": "dinner_reservation",
    "value": "Reservation at Ristorante Bella for 4 at 5:30 PM on Feb 4, 2026",
    "confidence": "high"
  }
]

If no VERIFIED facts can be extracted, return an empty array: []`;
/**
 * Extracts facts from a conversation using an LLM
 */
async function extractFactsFromConversation(conversationId, messages, apiKey) {
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
    const adapter = (0, core_1.createClaudeAdapter)(key, 'claude-sonnet-4-5-20250929');
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
        const extractedFacts = JSON.parse(jsonMatch[0]);
        // Group facts by category
        const factsByCategory = {};
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
    }
    catch (error) {
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
async function generateLLMSummary(categoryName, displayName, facts, apiKey) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
        // Fall back to simple summary
        return facts.map(f => `${f.key}: ${JSON.stringify(f.value)}`).join('. ');
    }
    const adapter = (0, core_1.createClaudeAdapter)(key, 'claude-sonnet-4-5-20250929');
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
    }
    catch (error) {
        console.error('[FactExtraction] Failed to generate summary:', error);
        // Fall back to simple summary
        return facts.map(f => `${f.key}: ${JSON.stringify(f.value)}`).join('. ');
    }
}
// -----------------------------------------------------------------------------
// Introduction-specific Fact Extraction
// Enhanced extraction for when users are deliberately sharing information
// -----------------------------------------------------------------------------
const INTRODUCTION_EXTRACTION_PROMPT = `You are a fact extraction system analyzing an INTRODUCTION CONVERSATION.

The user has deliberately chosen to share information about themselves to help personalize their AI assistant. This means:
1. Extract MORE facts than you normally would - the user wants to share
2. Use HIGHER confidence levels - the user is intentionally providing this information
3. Be thorough - capture all personal details, preferences, and relevant information

IMPORTANT RULES:
1. Only extract facts about the USER (the human), not the assistant
2. Since this is an introduction, most facts should be "high" confidence
3. Extract both explicit facts AND reasonable inferences
4. Create comprehensive category assignments

COMMON CATEGORIES (create new ones if needed):
- health: Medical conditions, medications, doctors, symptoms, allergies
- exercise: Workouts, fitness routines, sports, physical activities
- personal: Age, birthday, family, location, relationships
- employment: Job, employer, work history, skills, income
- financial: Banking, investments, insurance, major purchases
- preferences: Likes, dislikes, hobbies, interests
- travel: Trips, destinations, travel plans
- education: Schools, degrees, certifications, learning
- goals: Personal goals, aspirations, things they're working toward
- lifestyle: Daily routines, habits, living situation

OUTPUT FORMAT (JSON array):
[
  {
    "category": "health",
    "categoryDisplayName": "Health & Medical",
    "key": "current_medications",
    "value": ["Lisinopril 10mg daily"],
    "confidence": "high"
  }
]

Be thorough! Extract every relevant fact the user shared.`;
/**
 * Extracts facts from an introduction conversation with enhanced extraction
 * Uses higher confidence and extracts more facts since user is deliberately sharing
 */
async function extractFactsFromIntroduction(conversationId, messages, apiKey) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
        console.warn('[FactExtraction] No API key available, skipping extraction');
        return {
            conversationId,
            extractedAt: new Date().toISOString(),
            factsByCategory: {},
        };
    }
    const adapter = (0, core_1.createClaudeAdapter)(key, 'claude-sonnet-4-5-20250929');
    // Format conversation for the LLM
    const conversationText = messages
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n');
    const userPrompt = `Extract ALL facts about the USER from this introduction conversation. The user is deliberately sharing information to help personalize their experience.

${conversationText}

Be thorough! This is an introduction so extract everything relevant. Return a JSON array of extracted facts.`;
    try {
        const response = await adapter.generate({
            messages: [{ role: 'user', content: userPrompt }],
            systemPrompt: INTRODUCTION_EXTRACTION_PROMPT,
            maxTokens: 3000, // Higher limit for comprehensive extraction
            temperature: 0.1,
        });
        // Parse the JSON response
        const jsonMatch = response.content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.log('[FactExtraction] No JSON array found in introduction response');
            return {
                conversationId,
                extractedAt: new Date().toISOString(),
                factsByCategory: {},
            };
        }
        const extractedFacts = JSON.parse(jsonMatch[0]);
        // Group facts by category
        const factsByCategory = {};
        for (const fact of extractedFacts) {
            const category = fact.category.toLowerCase().replace(/\s+/g, '-');
            if (!factsByCategory[category]) {
                factsByCategory[category] = [];
            }
            factsByCategory[category].push({
                ...fact,
                category,
            });
        }
        console.log(`[FactExtraction] Extracted ${extractedFacts.length} facts from introduction ${conversationId}`);
        return {
            conversationId,
            extractedAt: new Date().toISOString(),
            factsByCategory,
        };
    }
    catch (error) {
        console.error('[FactExtraction] Failed to extract facts from introduction:', error);
        return {
            conversationId,
            extractedAt: new Date().toISOString(),
            factsByCategory: {},
        };
    }
}
/**
 * Converts extracted facts to MemoryFact format with IDs
 */
function extractedFactsToMemoryFacts(extractedFacts, conversationId) {
    const now = new Date().toISOString();
    return extractedFacts.map(fact => ({
        id: (0, ulid_1.ulid)(),
        key: fact.key,
        value: fact.value,
        confidence: fact.confidence,
        learnedFrom: conversationId,
        learnedAt: now,
    }));
}
//# sourceMappingURL=fact-extraction.js.map