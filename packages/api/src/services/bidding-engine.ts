/**
 * Bidding Engine Service
 *
 * Implements the multi-factor bidding system from ARCHITECTURE.md for intelligent
 * agent participation in orchestrated conversations.
 *
 * Bid calculation uses configurable weights from prompts.json:
 * FinalBid = (RelevanceBid × relevance) + (ExpertiseBid × expertise) + (NoveltyBid × novelty) + (RecencyPenalty × recency)
 */

import { createClaudeAdapter } from '@macp/core';
import {
  getLimits,
  getThresholds,
  getWeights,
  getPrompts,
  getRoleInstruction,
  interpolate,
} from '../config/prompts.js';
import { type EffectiveGroundingConfig } from './grounding-service.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface AgentTaskForBidding {
  id: string;
  description: string;
  keywords: string[];
  category: string;
}

export interface AgentForBidding {
  id: string;
  name: string;
  emoji: string;
  personality: string;
  description?: string;
  intents: string[];
  memoryCategories?: string[];
  memories?: string[]; // Recent relevant memories about the user
  tasks?: AgentTaskForBidding[];  // Pending tasks looking for opportunities
}

export interface Bid {
  agentId: string;
  agentName: string;
  agentEmoji: string;
  relevanceScore: number;      // 0-1: How relevant is this to my expertise?
  confidenceScore: number;     // 0-1: How confident am I in my response?
  noveltyScore: number;        // 0-1: How different from what's been said?
  expertiseScore: number;      // 0-1: How much expertise do I have?
  pass: boolean;               // I choose not to respond
  reasoning?: string;          // Why I want to participate
  hasMatchingTask?: boolean;   // Does this agent have a pending task that matches?
  matchingTaskDescription?: string;  // The task description if matching
}

export interface BidResult {
  agentId: string;
  agentName: string;
  agentEmoji: string;
  relevanceScore: number;
  confidenceScore: number;
  noveltyScore: number;
  expertiseScore: number;
  finalScore: number;
  pass: boolean;
  shouldParticipate: boolean;
  reasoning?: string;
  hasMatchingTask?: boolean;
  matchingTaskDescription?: string;
}

export interface ConversationContext {
  hostAgentName: string;
  recentMessages: Array<{
    role: 'host' | 'user' | 'agent';
    agentName?: string;
    content: string;
  }>;
  currentTopic?: string;
  participationHistory: Map<string, number>; // agentId -> turns since last spoke
  totalTurns: number;
}

// -----------------------------------------------------------------------------
// Config-driven Constants (loaded from prompts.json)
// -----------------------------------------------------------------------------

// These are now loaded from config but we keep local references for convenience
const getWeightValues = () => getWeights().bidding;
const getThresholdValues = () => getThresholds();
const getLimitValues = () => getLimits();

const COOLDOWN_TURNS = 3;  // Turns before recency penalty fully decays

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
export async function collectBids(
  agents: AgentForBidding[],
  context: ConversationContext,
  userMessage: string,
  apiKey: string,
  provider: 'anthropic' | 'openai' | 'gemini' | 'groq' = 'anthropic'
): Promise<Bid[]> {
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
async function collectAgentBid(
  agent: AgentForBidding,
  contextStr: string,
  userMessage: string,
  context: ConversationContext,
  apiKey: string,
  provider: 'anthropic' | 'openai' | 'gemini' | 'groq'
): Promise<Bid> {
  try {
    const adapter = createClaudeAdapter(apiKey, 'claude-sonnet-4-5-20250929');

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
  } catch (error) {
    console.error(`[BiddingEngine] Failed to collect bid from ${agent.name}:`, error);
    return createDefaultBid(agent, true);
  }
}

function createDefaultBid(agent: AgentForBidding, pass: boolean): Bid {
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

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// -----------------------------------------------------------------------------
// Bid Evaluation
// -----------------------------------------------------------------------------

/**
 * Evaluates bids and determines which agents should participate
 * Implements the full bidding algorithm with anti-monopoly constraints
 * Agents with matching tasks get PRIORITY and should lead the conversation
 *
 * @param bids - Collected bids from agents
 * @param context - Conversation context
 * @param groundingConfig - Optional user-specific grounding configuration
 */
export function evaluateBids(
  bids: Bid[],
  context: ConversationContext,
  groundingConfig?: EffectiveGroundingConfig
): BidResult[] {
  const results: BidResult[] = bids.map(bid => {
    if (bid.pass) {
      return {
        agentId: bid.agentId,
        agentName: bid.agentName,
        agentEmoji: bid.agentEmoji,
        relevanceScore: 0,
        confidenceScore: 0,
        noveltyScore: 0,
        expertiseScore: 0,
        finalScore: 0,
        pass: true,
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
        relevanceScore: bid.relevanceScore,
        confidenceScore: bid.confidenceScore,
        noveltyScore: bid.noveltyScore,
        expertiseScore: bid.expertiseScore,
        finalScore: 1.0,  // Maximum score - always participate
        pass: false,
        shouldParticipate: true,
        reasoning: bid.reasoning || `Has matching task: ${bid.matchingTaskDescription}`,
        hasMatchingTask: true,
        matchingTaskDescription: bid.matchingTaskDescription,
      };
    }

    // Calculate base score using config weights
    const weights = getWeightValues();
    const baseScore =
      (bid.relevanceScore * weights.relevance) +
      (bid.expertiseScore * weights.expertise) +
      (bid.noveltyScore * weights.novelty);

    // Calculate recency penalty
    const turnsSinceSpoke = context.participationHistory.get(bid.agentId) ?? COOLDOWN_TURNS;
    const recencyMultiplier = Math.min(turnsSinceSpoke / COOLDOWN_TURNS, 1);
    const recencyBonus = recencyMultiplier * weights.recency;

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
      relevanceScore: bid.relevanceScore,
      confidenceScore: bid.confidenceScore,
      noveltyScore: bid.noveltyScore,
      expertiseScore: bid.expertiseScore,
      finalScore,
      pass: false,
      shouldParticipate: finalScore >= (groundingConfig?.bidConfidence ?? getThresholdValues().bidConfidence),
      reasoning: bid.reasoning,
    };
  });

  // Sort by final score descending
  results.sort((a, b) => b.finalScore - a.finalScore);

  // Apply max participating agents limit from config (user-specific or platform default)
  const maxAgents = groundingConfig?.maxAgentsPerTurn ?? getLimitValues().maxAgentsPerTurn;
  let participatingCount = 0;
  for (const result of results) {
    if (result.shouldParticipate) {
      if (participatingCount >= maxAgents) {
        result.shouldParticipate = false;
      } else {
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
 *
 * @param agents - Agents available for bidding
 * @param userMessage - The user's message
 * @param context - Conversation context
 * @param groundingConfig - Optional user-specific grounding configuration
 */
export function quickKeywordBid(
  agents: AgentForBidding[],
  userMessage: string,
  context: ConversationContext,
  groundingConfig?: EffectiveGroundingConfig
): BidResult[] {
  const lower = userMessage.toLowerCase();

  // Check if user directly addressed an agent by name (e.g., "My Assistant, ..." or "Hey Health Buddy")
  const directlyAddressedAgent = agents.find(agent => {
    const agentNameLower = agent.name.toLowerCase();
    // Check for patterns like "AgentName," or "Hey AgentName" or "AgentName, do you"
    return lower.startsWith(agentNameLower + ',') ||
           lower.startsWith(agentNameLower + ' ') ||
           lower.includes('hey ' + agentNameLower) ||
           lower.includes('hi ' + agentNameLower) ||
           lower.match(new RegExp(`^${agentNameLower}[,\\s]`));
  });

  if (directlyAddressedAgent) {
    console.log(`[Bidding] User directly addressed agent: ${directlyAddressedAgent.name}`);
    // Return only the addressed agent with high score
    return agents.map(agent => ({
      agentId: agent.id,
      agentName: agent.name,
      agentEmoji: agent.emoji,
      relevanceScore: agent.id === directlyAddressedAgent.id ? 1.0 : 0,
      confidenceScore: agent.id === directlyAddressedAgent.id ? 1.0 : 0,
      noveltyScore: 0.5,
      expertiseScore: agent.id === directlyAddressedAgent.id ? 1.0 : 0,
      finalScore: agent.id === directlyAddressedAgent.id ? 1.0 : 0,
      pass: agent.id !== directlyAddressedAgent.id,
      shouldParticipate: agent.id === directlyAddressedAgent.id,
      reasoning: agent.id === directlyAddressedAgent.id ? 'User directly addressed this agent' : undefined,
    }));
  }

  const intentKeywords: Record<string, string[]> = {
    health: ['health', 'sick', 'pain', 'doctor', 'medication', 'medicine', 'symptom', 'headache', 'tired', 'sleep', 'allergy', 'prescription', 'diabetes', 'blood pressure', 'wellness'],
    fitness: ['workout', 'exercise', 'gym', 'run', 'weight', 'muscle', 'fitness', 'steps', 'calories', 'nutrition', 'protein', 'cardio', 'yoga', 'sport'],
    work: ['work', 'meeting', 'calendar', 'project', 'deadline', 'task', 'email', 'boss', 'job', 'career', 'presentation', 'office', 'colleague'],
    finance: ['money', 'budget', 'spend', 'save', 'bank', 'credit', 'debt', 'invest', 'payment', 'bill', 'expense', 'income', 'salary'],
    personal: ['feel', 'feeling', 'mood', 'happy', 'sad', 'anxious', 'grateful', 'journal', 'reflect', 'relationship', 'family', 'friend', 'stressed'],
    education: ['learn', 'study', 'course', 'book', 'read', 'understand', 'explain', 'teach', 'homework', 'exam', 'research'],
  };

  const results: BidResult[] = agents.map(agent => {
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
      relevanceScore,
      confidenceScore: relevanceScore > 0 ? 0.7 : 0,  // Default confidence for keyword match
      noveltyScore: 0.5,  // Default novelty for quick bid
      expertiseScore: relevanceScore,  // Use relevance as proxy for expertise
      finalScore,
      pass: relevanceScore === 0,
      shouldParticipate: finalScore >= (groundingConfig?.bidConfidence ?? getThresholdValues().bidConfidence),
    };
  });

  // Sort and limit using config (user-specific or platform default)
  results.sort((a, b) => b.finalScore - a.finalScore);

  const maxAgents = groundingConfig?.maxAgentsPerTurn ?? getLimitValues().maxAgentsPerTurn;
  let participatingCount = 0;
  for (const result of results) {
    if (result.shouldParticipate) {
      if (participatingCount >= maxAgents) {
        result.shouldParticipate = false;
      } else {
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
 *
 * @param agent - The agent generating the response
 * @param context - Conversation context
 * @param userMessageOrHostContext - User message or host context
 * @param apiKey - API key for LLM provider
 * @param provider - LLM provider to use
 * @param userMemories - Optional memories about the user
 * @param matchingTask - Optional matching task the agent should address
 * @param groundingConfig - Optional user-specific grounding configuration
 */
export async function generateAgentResponse(
  agent: AgentForBidding,
  context: ConversationContext,
  userMessageOrHostContext: string,
  apiKey: string,
  provider: 'anthropic' | 'openai' | 'gemini' | 'groq' = 'anthropic',
  userMemories?: string[],
  matchingTask?: { description: string },
  groundingConfig?: EffectiveGroundingConfig
): Promise<string> {
  const adapter = createClaudeAdapter(apiKey, 'claude-sonnet-4-5-20250929');
  const limits = getLimitValues();
  const prompts = getPrompts();

  // Use user-specific word limit if provided, otherwise use platform default
  const wordLimit = groundingConfig?.agentResponseWords ?? limits.agentResponseWords;
  const maxTokens = groundingConfig?.maxTokens ?? limits.hostResponseTokens;

  const contextStr = context.recentMessages
    .slice(-8)
    .map(m => `${m.agentName || (m.role === 'user' ? 'User' : 'Host')}: ${m.content}`)
    .join('\n');

  // Only include memories if there's a specific task that needs them
  // Otherwise the agent tends to over-share unrelated information
  const memoriesSection = (matchingTask && userMemories && userMemories.length > 0)
    ? '\n\n' + interpolate(prompts.agentResponse.memoriesSection, {
        memories: userMemories.map(m => `- ${m}`).join('\n')
      })
    : '';

  // If agent has a matching task, include it prominently
  const taskSection = matchingTask
    ? `\n\n🎯 YOUR MISSION: "${matchingTask.description}"
Use EXACT numbers, dates, details. Do NOT change them.`
    : '';

  // Determine agent's role based on expertise (using config)
  const isAssistant = agent.intents.some(i => ['general', 'assistant', 'scheduling'].includes(i.toLowerCase()));
  const isHealth = agent.intents.some(i => ['health', 'dietary', 'wellness', 'fitness'].includes(i.toLowerCase()));
  const isFinance = agent.intents.some(i => ['finance', 'budget', 'money'].includes(i.toLowerCase()));

  let roleInstruction: string;
  if (isAssistant) {
    roleInstruction = getRoleInstruction('assistant');
  } else if (isHealth) {
    roleInstruction = getRoleInstruction('health');
  } else if (isFinance) {
    roleInstruction = getRoleInstruction('finance');
  } else {
    roleInstruction = getRoleInstruction('default', agent.intents);
  }

  // Build system prompt using config template
  const systemPrompt = interpolate(prompts.agentResponse.system, {
    agentName: agent.name,
    agentEmoji: agent.emoji,
    hostAgentName: context.hostAgentName,
    roleInstruction,
    memoriesSection,
    taskSection,
    wordLimit,
  });

  // Build user prompt
  const prompt = matchingTask
    ? interpolate(prompts.agentResponse.taskPrompt, {
        context: contextStr,
        taskDescription: matchingTask.description,
        wordLimit,
      })
    : interpolate(prompts.agentResponse.defaultPrompt, {
        context: contextStr,
        wordLimit,
      });

  const response = await adapter.generate({
    messages: [{ role: 'user', content: prompt }],
    systemPrompt,
    maxTokens,
    temperature: 0.7,
  });

  return response.content;
}
