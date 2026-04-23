"use strict";
/**
 * Bidding Engine Service
 *
 * Implements the multi-factor bidding system from ARCHITECTURE.md for intelligent
 * agent participation in orchestrated conversations.
 *
 * Bid calculation:
 * FinalBid = (RelevanceBid × 0.4) + (ExpertiseBid × 0.3) + (NoveltyBid × 0.15) + (RecencyPenalty × 0.15)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectBids = collectBids;
exports.evaluateBids = evaluateBids;
exports.quickKeywordBid = quickKeywordBid;
exports.generateAgentResponse = generateAgentResponse;
const core_1 = require("@macp/core");
// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
const WEIGHT_RELEVANCE = 0.4;
const WEIGHT_EXPERTISE = 0.3;
const WEIGHT_NOVELTY = 0.15;
const WEIGHT_RECENCY = 0.15;
const COOLDOWN_TURNS = 3; // Turns before recency penalty fully decays
const PARTICIPATION_THRESHOLD = 0.5; // Minimum score to participate
const MAX_PARTICIPATING_AGENTS = 3; // Maximum agents participating per turn
// -----------------------------------------------------------------------------
// Bid Collection
// -----------------------------------------------------------------------------
const BID_ANALYSIS_PROMPT = `You are a bidding analysis system for an AI agent that represents a user. Given the conversation context and the agent's profile, determine if this agent should participate in the conversation ON BEHALF of the user.

The user has scanned a QR code to meet another agent (the "host"). Your job is to determine if this user's agent should speak up to help the user.

CRITICAL BIDDING RULES:

1. **MATCHING TASK** → Bid 1.0 on ALL scores. Set hasMatchingTask: true.
   - IMPORTANT: Match by NAME! If task mentions "Jane" and host is "Jane's assistant" → MATCH!
   - Match by category (restaurant task + restaurant host)
   - Match by keywords
   - ALWAYS check if the PERSON'S NAME in the task matches the host

2. **GENERAL/ASSISTANT AGENT** → The assistant/general agent is the PRIMARY representative.
   - Should bid HIGH (0.9+) for ANY conversation to coordinate and introduce the user
   - Is the CATCH-ALL for anything not covered by specialists
   - Should ALWAYS participate to communicate general requests and coordinate

3. **RELEVANT USER INFO** → Bid HIGH (0.8+) if agent knows user info relevant to the host:
   - Health agent at restaurant? HIGH BID if knows dietary restrictions
   - Finance agent at restaurant? HIGH BID if knows budget constraints

4. **Cross-domain relevance is IMPORTANT**:
   - A HEALTH agent should bid HIGH at RESTAURANTS if they know dietary info
   - A FINANCE agent should bid HIGH anywhere if they know budget limits

Analyze these scores (0-1):
1. RELEVANCE: Does the agent have USER INFO or TASKS relevant to this host?
2. CONFIDENCE: How valuable is the info this agent could share?
3. NOVELTY: Would user forget to mention this without the agent?
4. EXPERTISE: How much domain knowledge does this agent have?

Respond with valid JSON only:
{
  "relevance": 0.8,
  "confidence": 0.7,
  "novelty": 0.6,
  "expertise": 0.75,
  "pass": false,
  "hasMatchingTask": true,
  "matchingTaskDescription": "Find out when Jane's birthday is",
  "reasoning": "Task mentions Jane and we're talking to Jane's assistant"
}

Only set pass: true if the agent has NOTHING relevant to share AND is not a general/assistant agent.`;
/**
 * Collects bids from all available agents for a given conversation context
 */
async function collectBids(agents, context, userMessage, apiKey, provider = 'anthropic') {
    if (agents.length === 0) {
        console.log('[BiddingEngine] No agents available for bidding');
        return [];
    }
    // Log bidding context for debugging
    console.log(`[BiddingEngine] ═══════════════════════════════════════`);
    console.log(`[BiddingEngine] BIDDING ROUND - Host: ${context.hostAgentName}`);
    console.log(`[BiddingEngine] User message: "${userMessage}"`);
    console.log(`[BiddingEngine] Agents bidding: ${agents.map(a => `${a.name}(${a.memories?.length || 0} memories)`).join(', ')}`);
    // Build conversation context string
    const contextStr = context.recentMessages
        .slice(-5)
        .map(m => `${m.agentName || (m.role === 'user' ? 'User' : 'Host')}: ${m.content}`)
        .join('\n');
    // Collect bids in parallel for efficiency
    const bidPromises = agents.map(agent => collectAgentBid(agent, contextStr, userMessage, context, apiKey, provider));
    const bids = await Promise.all(bidPromises);
    // Log bid results for debugging
    console.log(`[BiddingEngine] BID RESULTS:`);
    for (const bid of bids) {
        const scores = `rel=${bid.relevanceScore.toFixed(2)} conf=${bid.confidenceScore.toFixed(2)} nov=${bid.noveltyScore.toFixed(2)} exp=${bid.expertiseScore.toFixed(2)}`;
        console.log(`[BiddingEngine]   ${bid.agentName}: ${bid.pass ? 'PASS' : scores} ${bid.hasMatchingTask ? '[HAS TASK]' : ''}`);
        if (bid.reasoning) {
            console.log(`[BiddingEngine]     Reason: ${bid.reasoning}`);
        }
    }
    console.log(`[BiddingEngine] ═══════════════════════════════════════`);
    return bids;
}
/**
 * Collects a bid from a single agent
 */
async function collectAgentBid(agent, contextStr, userMessage, context, apiKey, provider) {
    try {
        const adapter = (0, core_1.createClaudeAdapter)(apiKey, 'claude-sonnet-4-5-20250929');
        // Build tasks section if agent has pending tasks
        const tasksSection = agent.tasks && agent.tasks.length > 0
            ? `\n\nPENDING TASKS (looking for opportunities to complete):\n${agent.tasks.map(t => `- [${t.category}] ${t.description} (keywords: ${t.keywords.join(', ')})`).join('\n')}`
            : '';
        // Build memories section - CRITICAL for deciding relevance
        const memoriesSection = agent.memories && agent.memories.length > 0
            ? `\n\nUSER INFO THIS AGENT KNOWS:\n${agent.memories.map(m => `- ${m}`).join('\n')}`
            : '';
        const agentProfile = `Agent: ${agent.name} ${agent.emoji}
Description: ${agent.description || agent.personality}
Expertise areas: ${agent.intents.join(', ')}${memoriesSection}${tasksSection}`;
        const prompt = `HOST AGENT NAME: "${context.hostAgentName}"

${agentProfile}

Recent conversation:
${contextStr}

New user message: "${userMessage}"

IMPORTANT: Check if ANY pending task mentions the host's name (e.g., task about "Jane" when host is "Jane's assistant" = MATCH).
Also check category/keyword matches.

Should this agent participate? If this agent has a matching task OR is a general/assistant agent, bid HIGH and set hasMatchingTask appropriately.`;
        const response = await adapter.generate({
            messages: [{ role: 'user', content: prompt }],
            systemPrompt: BID_ANALYSIS_PROMPT,
            maxTokens: 250,
            temperature: 0.2,
        });
        // Parse response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return createDefaultBid(agent, true); // Pass if can't parse
        }
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            agentId: agent.id,
            agentName: agent.name,
            agentEmoji: agent.emoji,
            relevanceScore: clamp(parsed.relevance || 0),
            confidenceScore: clamp(parsed.confidence || 0),
            noveltyScore: clamp(parsed.novelty || 0),
            expertiseScore: clamp(parsed.expertise || 0),
            pass: parsed.pass === true,
            reasoning: parsed.reasoning,
            hasMatchingTask: parsed.hasMatchingTask === true,
            matchingTaskDescription: parsed.matchingTaskDescription,
        };
    }
    catch (error) {
        console.error(`[BiddingEngine] Failed to collect bid from ${agent.name}:`, error);
        return createDefaultBid(agent, true);
    }
}
function createDefaultBid(agent, pass) {
    return {
        agentId: agent.id,
        agentName: agent.name,
        agentEmoji: agent.emoji,
        relevanceScore: 0,
        confidenceScore: 0,
        noveltyScore: 0,
        expertiseScore: 0,
        pass,
        reasoning: undefined,
    };
}
function clamp(value) {
    return Math.max(0, Math.min(1, value));
}
// -----------------------------------------------------------------------------
// Bid Evaluation
// -----------------------------------------------------------------------------
/**
 * Evaluates bids and determines which agents should participate
 * Implements the full bidding algorithm with anti-monopoly constraints
 * Agents with matching tasks get PRIORITY and should lead the conversation
 */
function evaluateBids(bids, context) {
    const results = bids.map(bid => {
        if (bid.pass) {
            return {
                agentId: bid.agentId,
                agentName: bid.agentName,
                agentEmoji: bid.agentEmoji,
                finalScore: 0,
                shouldParticipate: false,
                reasoning: 'Agent chose to pass',
            };
        }
        // TASK PRIORITY: Agents with matching tasks get maximum score
        // They should LEAD the conversation to complete their task
        if (bid.hasMatchingTask) {
            return {
                agentId: bid.agentId,
                agentName: bid.agentName,
                agentEmoji: bid.agentEmoji,
                finalScore: 1.0, // Maximum score - always participate
                shouldParticipate: true,
                reasoning: bid.reasoning || `Has matching task: ${bid.matchingTaskDescription}`,
                hasMatchingTask: true,
                matchingTaskDescription: bid.matchingTaskDescription,
            };
        }
        // Calculate base score
        const baseScore = (bid.relevanceScore * WEIGHT_RELEVANCE) +
            (bid.expertiseScore * WEIGHT_EXPERTISE) +
            (bid.noveltyScore * WEIGHT_NOVELTY);
        // Calculate recency penalty
        const turnsSinceSpoke = context.participationHistory.get(bid.agentId) ?? COOLDOWN_TURNS;
        const recencyMultiplier = Math.min(turnsSinceSpoke / COOLDOWN_TURNS, 1);
        const recencyBonus = recencyMultiplier * WEIGHT_RECENCY;
        // Calculate participation balance bonus (boost underrepresented agents)
        const totalParticipation = Array.from(context.participationHistory.values())
            .reduce((sum, turns) => sum + (COOLDOWN_TURNS - Math.min(turns, COOLDOWN_TURNS)), 0);
        const agentParticipation = COOLDOWN_TURNS - Math.min(turnsSinceSpoke, COOLDOWN_TURNS);
        const participationRate = totalParticipation > 0 ? agentParticipation / totalParticipation : 0;
        const balanceBonus = (1 - participationRate) * 0.05; // Small bonus for underrepresented
        const finalScore = baseScore + recencyBonus + balanceBonus;
        return {
            agentId: bid.agentId,
            agentName: bid.agentName,
            agentEmoji: bid.agentEmoji,
            finalScore,
            shouldParticipate: finalScore >= PARTICIPATION_THRESHOLD,
            reasoning: bid.reasoning,
        };
    });
    // Sort by final score descending
    results.sort((a, b) => b.finalScore - a.finalScore);
    // Apply max participating agents limit
    let participatingCount = 0;
    for (const result of results) {
        if (result.shouldParticipate) {
            if (participatingCount >= MAX_PARTICIPATING_AGENTS) {
                result.shouldParticipate = false;
            }
            else {
                participatingCount++;
            }
        }
    }
    // Log final participation decisions
    const participating = results.filter(r => r.shouldParticipate);
    const passing = results.filter(r => !r.shouldParticipate);
    console.log(`[BiddingEngine] PARTICIPATION DECISION:`);
    console.log(`[BiddingEngine]   ✓ PARTICIPATING: ${participating.map(r => `${r.agentName}(${r.finalScore.toFixed(2)})`).join(', ') || 'none'}`);
    console.log(`[BiddingEngine]   ✗ PASSING: ${passing.map(r => `${r.agentName}(${r.finalScore.toFixed(2)})`).join(', ') || 'none'}`);
    return results;
}
// -----------------------------------------------------------------------------
// Quick Keyword-Based Bidding (Fallback)
// -----------------------------------------------------------------------------
/**
 * Fast keyword-based bidding when API calls are not desired
 * Used as a fallback or for quick pre-filtering
 */
function quickKeywordBid(agents, userMessage, context) {
    const lower = userMessage.toLowerCase();
    const intentKeywords = {
        health: ['health', 'sick', 'pain', 'doctor', 'medication', 'medicine', 'symptom', 'headache', 'tired', 'sleep', 'allergy', 'prescription', 'diabetes', 'blood pressure', 'wellness'],
        fitness: ['workout', 'exercise', 'gym', 'run', 'weight', 'muscle', 'fitness', 'steps', 'calories', 'nutrition', 'protein', 'cardio', 'yoga', 'sport'],
        work: ['work', 'meeting', 'calendar', 'project', 'deadline', 'task', 'email', 'boss', 'job', 'career', 'presentation', 'office', 'colleague'],
        finance: ['money', 'budget', 'spend', 'save', 'bank', 'credit', 'debt', 'invest', 'payment', 'bill', 'expense', 'income', 'salary'],
        personal: ['feel', 'feeling', 'mood', 'happy', 'sad', 'anxious', 'grateful', 'journal', 'reflect', 'relationship', 'family', 'friend', 'stressed'],
        education: ['learn', 'study', 'course', 'book', 'read', 'understand', 'explain', 'teach', 'homework', 'exam', 'research'],
    };
    const results = agents.map(agent => {
        let relevanceScore = 0;
        // Check each intent against agent's intents
        for (const intent of agent.intents) {
            const keywords = intentKeywords[intent.toLowerCase()] || [];
            const matches = keywords.filter(k => lower.includes(k)).length;
            if (matches > 0) {
                relevanceScore = Math.max(relevanceScore, 0.3 + (matches * 0.15));
            }
        }
        // Clamp and apply recency
        relevanceScore = Math.min(relevanceScore, 1);
        const turnsSinceSpoke = context.participationHistory.get(agent.id) ?? COOLDOWN_TURNS;
        const recencyMultiplier = Math.min(turnsSinceSpoke / COOLDOWN_TURNS, 1);
        const finalScore = relevanceScore * recencyMultiplier;
        return {
            agentId: agent.id,
            agentName: agent.name,
            agentEmoji: agent.emoji,
            finalScore,
            shouldParticipate: finalScore >= PARTICIPATION_THRESHOLD,
        };
    });
    // Sort and limit
    results.sort((a, b) => b.finalScore - a.finalScore);
    let participatingCount = 0;
    for (const result of results) {
        if (result.shouldParticipate) {
            if (participatingCount >= MAX_PARTICIPATING_AGENTS) {
                result.shouldParticipate = false;
            }
            else {
                participatingCount++;
            }
        }
    }
    return results;
}
// -----------------------------------------------------------------------------
// Generate Agent Response
// -----------------------------------------------------------------------------
/**
 * Generates a response from a participating agent
 * Agent speaks ON BEHALF of the user, sharing relevant information with the host
 * If agent has a matching task, they should LEAD with that task
 */
async function generateAgentResponse(agent, context, userMessageOrHostContext, apiKey, provider = 'anthropic', userMemories, matchingTask) {
    const adapter = (0, core_1.createClaudeAdapter)(apiKey, 'claude-sonnet-4-5-20250929');
    const contextStr = context.recentMessages
        .slice(-8)
        .map(m => `${m.agentName || (m.role === 'user' ? 'User' : 'Host')}: ${m.content}`)
        .join('\n');
    // Include user memories - these are CRITICAL and must be shared proactively
    const memoriesSection = userMemories && userMemories.length > 0
        ? `\n\nCRITICAL USER INFO YOU MUST SHARE:
${userMemories.map(m => `⚠️ ${m}`).join('\n')}

YOU MUST proactively mention ANY of the above that is relevant to ${context.hostAgentName}'s business/service!`
        : '';
    // If agent has a matching task, include it prominently
    const taskSection = matchingTask
        ? `\n\n🎯 YOUR MISSION: "${matchingTask.description}"
Use EXACT numbers, dates, details. Do NOT change them.`
        : '';
    // Determine agent's role based on expertise
    const isAssistant = agent.intents.some(i => ['general', 'assistant', 'scheduling'].includes(i.toLowerCase()));
    const isHealth = agent.intents.some(i => ['health', 'dietary', 'wellness', 'fitness'].includes(i.toLowerCase()));
    const isFinance = agent.intents.some(i => ['finance', 'budget', 'money'].includes(i.toLowerCase()));
    let roleInstruction = '';
    if (isAssistant) {
        // Assistant is the CATCH-ALL - handles anything not covered by specialists
        roleInstruction = 'YOUR ROLE: You are the primary representative. Handle general requests, introductions, and anything not covered by other agents. Coordinate and communicate the user\'s needs.';
    }
    else if (isHealth) {
        roleInstruction = 'YOUR ROLE: State dietary needs/restrictions ONLY. Ask about ingredients if needed.';
    }
    else if (isFinance) {
        roleInstruction = 'YOUR ROLE: Ask about prices. Track costs. State budget limits.';
    }
    else {
        roleInstruction = `YOUR ROLE: Focus ONLY on ${agent.intents.join('/')}.`;
    }
    const systemPrompt = `You are ${agent.name} ${agent.emoji}, part of a team representing the user to ${context.hostAgentName}.

${roleInstruction}
${memoriesSection}${taskSection}

═══════════════════════════════════════════════════
RULES:
1. MAX 15 WORDS. State facts, then STOP.
2. Stay in YOUR lane - don't overlap with other agents.
3. Be direct: "Party of 4, tomorrow 7pm" not "We'd like to request..."
═══════════════════════════════════════════════════`;
    const prompt = matchingTask
        ? `${contextStr}

TASK: "${matchingTask.description}"
State the request in 15 words or less. Use exact details.`
        : `${contextStr}

Share ONLY info within your expertise. 15 words max. Facts only.`;
    const response = await adapter.generate({
        messages: [{ role: 'user', content: prompt }],
        systemPrompt,
        maxTokens: 80, // Reduced to enforce brevity
        temperature: 0.7,
    });
    return response.content;
}
//# sourceMappingURL=bidding-engine.js.map