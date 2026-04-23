"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRulesFromConversation = extractRulesFromConversation;
exports.extractRulesFromIntroduction = extractRulesFromIntroduction;
exports.extractedRulesToAgentRules = extractedRulesToAgentRules;
const core_1 = require("@macp/core");
const ulid_1 = require("ulid");
// -----------------------------------------------------------------------------
// Rule Extraction Service
// Uses LLM to extract user preferences and rules from conversations
// Rules are instructions/preferences that modify how an agent should behave
// -----------------------------------------------------------------------------
const RULE_EXTRACTION_SYSTEM_PROMPT = `You are a rule extraction system. Your job is to extract USER PREFERENCES and INSTRUCTIONS from conversations that should guide how an AI assistant behaves.

WHAT ARE RULES?
Rules are explicit or implicit preferences the user has expressed about:
- How they want to be communicated with
- Topics they want to avoid or focus on
- Personal beliefs or values that should be respected
- Specific instructions for the assistant's behavior
- Corrections or feedback about the assistant's responses

EXAMPLES OF RULES:
- "I prefer natural remedies over prescription medications"
- "Don't recommend seeing a doctor unless it's serious"
- "Explain things simply, I'm not a technical person"
- "I have anxiety about medical procedures"
- "Focus on evidence-based information only"
- "I'm vegan, don't suggest meat-based solutions"
- "Keep responses brief and to the point"

WHAT ARE NOT RULES:
- Factual information about the user (that's memory, not rules)
- One-time requests that don't indicate a preference
- General conversation that doesn't express a preference

OUTPUT FORMAT (JSON array):
[
  {
    "content": "The user prefers natural remedies over prescription medications when possible",
    "confidence": "high",
    "source": "User said: 'I don't trust pharmaceuticals, can you suggest natural alternatives?'"
  }
]

CONFIDENCE LEVELS:
- "high": User explicitly stated this preference
- "medium": Strong implication of preference from context
- "low": Possible preference, needs confirmation

If no rules can be extracted, return an empty array: []

IMPORTANT: Write rules as third-person statements that can be used as instructions to the assistant.`;
/**
 * Extracts rules/preferences from a conversation using an LLM
 */
async function extractRulesFromConversation(conversationId, agentId, agentName, messages, apiKey) {
    // Use provided API key or fall back to environment variable
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
        console.warn('[RuleExtraction] No API key available, skipping extraction');
        return {
            conversationId,
            agentId,
            agentName,
            extractedAt: new Date().toISOString(),
            rules: [],
        };
    }
    // Need at least a few messages to extract meaningful rules
    if (messages.length < 4) {
        console.log('[RuleExtraction] Conversation too short for rule extraction');
        return {
            conversationId,
            agentId,
            agentName,
            extractedAt: new Date().toISOString(),
            rules: [],
        };
    }
    const adapter = (0, core_1.createClaudeAdapter)(key, 'claude-sonnet-4-5-20250929');
    // Format conversation for the LLM
    const conversationText = messages
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n');
    const userPrompt = `Extract any user preferences or rules from this conversation with ${agentName}:

${conversationText}

Look for:
1. Explicit preferences the user stated
2. Corrections or feedback the user gave about responses
3. Topics or approaches the user wants to avoid
4. Communication style preferences
5. Values or beliefs that should guide responses

Return a JSON array of extracted rules. If no rules found, return [].`;
    try {
        const response = await adapter.generate({
            messages: [{ role: 'user', content: userPrompt }],
            systemPrompt: RULE_EXTRACTION_SYSTEM_PROMPT,
            maxTokens: 1500,
            temperature: 0.1, // Low temperature for consistent extraction
        });
        // Parse the JSON response
        const jsonMatch = response.content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.log('[RuleExtraction] No JSON array found in response');
            return {
                conversationId,
                agentId,
                agentName,
                extractedAt: new Date().toISOString(),
                rules: [],
            };
        }
        const extractedRules = JSON.parse(jsonMatch[0]);
        console.log(`[RuleExtraction] Extracted ${extractedRules.length} rules from conversation ${conversationId} for agent ${agentId}`);
        return {
            conversationId,
            agentId,
            agentName,
            extractedAt: new Date().toISOString(),
            rules: extractedRules,
        };
    }
    catch (error) {
        console.error('[RuleExtraction] Failed to extract rules:', error);
        return {
            conversationId,
            agentId,
            agentName,
            extractedAt: new Date().toISOString(),
            rules: [],
        };
    }
}
// -----------------------------------------------------------------------------
// Introduction-specific Rule Extraction
// Enhanced extraction for when users are deliberately sharing preferences
// -----------------------------------------------------------------------------
const INTRODUCTION_RULE_PROMPT = `You are a rule extraction system analyzing an INTRODUCTION CONVERSATION.

The user has deliberately chosen to share their preferences to help personalize their AI assistant. This means:
1. Extract MORE preferences than you normally would
2. Use HIGHER confidence levels - the user is intentionally sharing
3. Look for both explicit preferences AND implied preferences

WHAT ARE RULES?
Rules are explicit or implicit preferences the user has expressed about:
- How they want to be communicated with
- Topics they want to avoid or focus on
- Personal beliefs or values that should be respected
- Specific instructions for the assistant's behavior
- Approach preferences (natural vs conventional, brief vs detailed, etc.)

EXAMPLES OF INTRODUCTION RULES:
- "The user prefers natural remedies over prescription medications"
- "The user wants brief, to-the-point responses"
- "The user prefers morning workout suggestions"
- "The user is vegetarian and should not receive meat-based suggestions"
- "The user prefers detailed explanations with examples"
- "The user wants encouragement but not excessive cheerfulness"

OUTPUT FORMAT (JSON array):
[
  {
    "content": "The user prefers natural remedies over prescription medications when possible",
    "confidence": "high",
    "source": "User said: 'I prefer natural approaches to health'"
  }
]

CONFIDENCE LEVELS:
- "high": User explicitly stated this preference
- "medium": Strong implication of preference from context

Be thorough! This is an introduction so extract all preferences the user shared.`;
/**
 * Extracts rules/preferences from an introduction conversation
 * Uses enhanced extraction since user is deliberately sharing preferences
 */
async function extractRulesFromIntroduction(conversationId, agentId, agentName, messages, apiKey) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
        console.warn('[RuleExtraction] No API key available, skipping extraction');
        return {
            conversationId,
            agentId,
            agentName,
            extractedAt: new Date().toISOString(),
            rules: [],
        };
    }
    const adapter = (0, core_1.createClaudeAdapter)(key, 'claude-sonnet-4-5-20250929');
    // Format conversation for the LLM
    const conversationText = messages
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n');
    const userPrompt = `Extract ALL user preferences and rules from this introduction conversation with ${agentName}. The user is deliberately sharing how they want to be helped.

${conversationText}

Look for:
1. Explicit preferences the user stated
2. Approach preferences (natural vs conventional, brief vs detailed)
3. Topics or methods they prefer or want to avoid
4. Communication style preferences
5. Values or beliefs that should guide responses

Return a JSON array of extracted rules. Be thorough since this is an introduction.`;
    try {
        const response = await adapter.generate({
            messages: [{ role: 'user', content: userPrompt }],
            systemPrompt: INTRODUCTION_RULE_PROMPT,
            maxTokens: 2000,
            temperature: 0.1,
        });
        // Parse the JSON response
        const jsonMatch = response.content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.log('[RuleExtraction] No JSON array found in introduction response');
            return {
                conversationId,
                agentId,
                agentName,
                extractedAt: new Date().toISOString(),
                rules: [],
            };
        }
        const extractedRules = JSON.parse(jsonMatch[0]);
        console.log(`[RuleExtraction] Extracted ${extractedRules.length} rules from introduction ${conversationId} for agent ${agentId}`);
        return {
            conversationId,
            agentId,
            agentName,
            extractedAt: new Date().toISOString(),
            rules: extractedRules,
        };
    }
    catch (error) {
        console.error('[RuleExtraction] Failed to extract rules from introduction:', error);
        return {
            conversationId,
            agentId,
            agentName,
            extractedAt: new Date().toISOString(),
            rules: [],
        };
    }
}
/**
 * Converts extracted rules to the storage format with IDs
 */
function extractedRulesToAgentRules(extractedRules, conversationId) {
    const now = new Date().toISOString();
    return extractedRules.map(rule => ({
        id: `rule_${(0, ulid_1.ulid)()}`,
        content: rule.content,
        createdAt: now,
        updatedAt: now,
        source: rule.source,
        confidence: rule.confidence,
    }));
}
//# sourceMappingURL=rule-extraction.js.map