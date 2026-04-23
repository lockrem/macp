import { createClaudeAdapter } from '@macp/core';

// -----------------------------------------------------------------------------
// Orchestration Service
// Routes user messages to appropriate specialist agents based on intent
// -----------------------------------------------------------------------------

export interface OrchestrationResult {
  selectedAgentId: string;
  agentName: string;
  agentEmoji: string;
  intent: string;                    // "health", "work", "finance", "personal", "general"
  confidence: number;                // 0-1
  memoryCategoriesToLoad: string[];  // ["health", "medications"]
  reasoning?: string;                // For debugging
}

export interface AgentDispatch {
  agentId: string;
  agentName: string;
  agentEmoji: string;
  intent: string;
  relevance: number;                 // 0-1, how relevant this agent is
  shouldRespond: boolean;            // Whether agent should contribute a response
  memoryCategories: string[];
  extractionOnly: boolean;           // If true, only extract facts, don't respond
}

export interface MultiAgentAnalysis {
  primaryAgent: AgentDispatch;       // Main agent to answer the question
  supportingAgents: AgentDispatch[]; // Other agents that should contribute
  allIntents: string[];              // All detected intents
  reasoning?: string;
}

export interface AgentConfig {
  id: string;
  displayName: string;
  emoji: string;
  provider: 'anthropic' | 'openai' | 'gemini' | 'groq';
  modelId: string;
  systemPrompt?: string;
  personality?: string;
  intents: string[];                 // What intents this agent handles
  memoryCategories: string[];        // Default memory categories for this agent
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  agentName?: string;
}

const INTENT_ANALYSIS_PROMPT = `You are a routing assistant for a personal AI assistant system. Your job is to analyze the user's message and determine which specialist agent should respond.

Analyze the user's message and determine:
1. Primary intent category: health, fitness, work, finance, personal, education, general
2. Confidence level (0-1) in your routing decision
3. Which memory categories are relevant to load for context

Rules:
- If multiple intents are present, choose the DOMINANT one
- Default to "general" only if no clear specialist match
- Be generous with matching - if the topic relates to an agent's domain, use that agent
- Consider conversation context when available

Respond ONLY with valid JSON in this exact format:
{
  "intent": "health",
  "confidence": 0.95,
  "memoryCategories": ["health", "medications"],
  "reasoning": "User is asking about medications and symptoms"
}`;

const MULTI_AGENT_ANALYSIS_PROMPT = `You are a routing assistant for a multi-agent AI system. Analyze the user's message to identify ALL relevant specialist agents that should contribute.

Your job:
1. Identify ALL intents/topics in the message (there may be multiple)
2. For each relevant agent, determine if they should RESPOND or just EXTRACT information
3. Pick the PRIMARY agent who should answer the main question
4. Identify SUPPORTING agents who have valuable contributions

Rules for when an agent should RESPOND (not just extract):
- They have expertise directly relevant to a question being asked
- The topic involves serious concerns in their domain (health crisis, financial emergency, etc.)
- They can add unique value beyond what other agents provide

Rules for EXTRACTION ONLY:
- A passing mention of their domain (e.g., "going golfing" = fitness extracts exercise, but doesn't need to respond)
- Information relevant to their domain but no question asked

IMPORTANT: Be concise. Only include agents that are genuinely relevant.

Respond ONLY with valid JSON:
{
  "allIntents": ["health", "finance"],
  "primary": {
    "agentId": "money_mentor",
    "intent": "finance",
    "relevance": 0.9,
    "shouldRespond": true,
    "extractionOnly": false
  },
  "supporting": [
    {
      "agentId": "health_buddy",
      "intent": "health",
      "relevance": 0.8,
      "shouldRespond": true,
      "extractionOnly": false
    }
  ],
  "reasoning": "User mentions financial crisis and substance use - both agents should respond"
}`;

/**
 * Analyzes user message and routes to the appropriate specialist agent
 */
export async function analyzeAndRoute(
  userId: string,
  message: string,
  conversationHistory: Message[],
  availableAgents: AgentConfig[],
  apiKey?: string
): Promise<OrchestrationResult> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;

  // If no API key, fall back to simple keyword matching
  if (!key) {
    console.warn('[Orchestration] No API key available, using keyword matching');
    return keywordBasedRouting(message, availableAgents);
  }

  try {
    const adapter = createClaudeAdapter(key, 'claude-sonnet-4-5-20250929');

    // Build context from recent conversation
    const recentContext = conversationHistory
      .slice(-3)
      .map(m => `${m.agentName || (m.role === 'user' ? 'User' : 'Assistant')}: ${m.content}`)
      .join('\n');

    // Build available agents description
    const agentsDescription = availableAgents
      .map(a => `- ${a.displayName} (${a.emoji}): handles ${a.intents.join(', ')}`)
      .join('\n');

    const userPrompt = `User message: "${message}"

${recentContext ? `Recent context:\n${recentContext}\n` : ''}
Available specialists:
${agentsDescription}

Analyze the intent and select the best agent to respond.`;

    const response = await adapter.generate({
      messages: [{ role: 'user', content: userPrompt }],
      systemPrompt: INTENT_ANALYSIS_PROMPT,
      maxTokens: 300,
      temperature: 0.1, // Low temperature for consistent routing
    });

    // Parse JSON response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Orchestration] Failed to parse JSON, falling back to keyword matching');
      return keywordBasedRouting(message, availableAgents);
    }

    const analysis = JSON.parse(jsonMatch[0]) as {
      intent: string;
      confidence: number;
      memoryCategories: string[];
      reasoning?: string;
    };

    // Find the best matching agent for this intent
    const selectedAgent = findBestAgent(analysis.intent, availableAgents);

    console.log(`[Orchestration] Routed to ${selectedAgent.displayName} (intent: ${analysis.intent}, confidence: ${analysis.confidence})`);

    return {
      selectedAgentId: selectedAgent.id,
      agentName: selectedAgent.displayName,
      agentEmoji: selectedAgent.emoji,
      intent: analysis.intent,
      confidence: analysis.confidence,
      memoryCategoriesToLoad: analysis.memoryCategories,
      reasoning: analysis.reasoning,
    };
  } catch (error) {
    console.error('[Orchestration] LLM analysis failed, falling back to keyword matching:', error);
    return keywordBasedRouting(message, availableAgents);
  }
}

/**
 * Analyzes message for multi-agent dispatch - identifies ALL relevant agents
 * Returns primary agent + supporting agents that should contribute
 */
export async function analyzeForMultiAgent(
  userId: string,
  message: string,
  conversationHistory: Message[],
  availableAgents: AgentConfig[],
  apiKey?: string
): Promise<MultiAgentAnalysis> {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;

  // If no agents available, return empty result
  if (availableAgents.length === 0) {
    const defaultAgent: AgentDispatch = {
      agentId: 'default',
      agentName: 'Assistant',
      agentEmoji: '🤖',
      intent: 'general',
      relevance: 1.0,
      shouldRespond: true,
      memoryCategories: [],
      extractionOnly: false,
    };
    return { primaryAgent: defaultAgent, supportingAgents: [], allIntents: ['general'] };
  }

  // Fallback if no API key
  if (!key) {
    console.warn('[Orchestration] No API key, using keyword-based multi-agent');
    return keywordBasedMultiAgent(message, availableAgents);
  }

  try {
    // Use a fast, cheap model for routing (haiku-equivalent speed)
    const adapter = createClaudeAdapter(key, 'claude-sonnet-4-5-20250929');

    // Build agents description
    const agentsDescription = availableAgents
      .map(a => `- ${a.id}: ${a.displayName} (${a.emoji}) - handles: ${a.intents.join(', ')}`)
      .join('\n');

    // Build recent context
    const recentContext = conversationHistory
      .slice(-5)
      .map(m => `${m.agentName || (m.role === 'user' ? 'User' : 'Assistant')}: ${m.content}`)
      .join('\n');

    const userPrompt = `User message: "${message}"

${recentContext ? `Recent conversation:\n${recentContext}\n` : ''}
Available agents:
${agentsDescription}

Analyze which agents should contribute to this response.`;

    const response = await adapter.generate({
      messages: [{ role: 'user', content: userPrompt }],
      systemPrompt: MULTI_AGENT_ANALYSIS_PROMPT,
      maxTokens: 500,
      temperature: 0.1,
    });

    // Parse JSON response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Orchestration] Failed to parse multi-agent JSON, using keyword fallback');
      return keywordBasedMultiAgent(message, availableAgents);
    }

    const analysis = JSON.parse(jsonMatch[0]) as {
      allIntents: string[];
      primary: {
        agentId: string;
        intent: string;
        relevance: number;
        shouldRespond: boolean;
        extractionOnly: boolean;
      };
      supporting: Array<{
        agentId: string;
        intent: string;
        relevance: number;
        shouldRespond: boolean;
        extractionOnly: boolean;
      }>;
      reasoning?: string;
    };

    // Map to AgentDispatch objects
    const primaryAgentConfig = availableAgents.find(a => a.id === analysis.primary.agentId)
      || availableAgents[0];

    const primaryAgent: AgentDispatch = {
      agentId: primaryAgentConfig.id,
      agentName: primaryAgentConfig.displayName,
      agentEmoji: primaryAgentConfig.emoji,
      intent: analysis.primary.intent,
      relevance: analysis.primary.relevance,
      shouldRespond: true, // Primary always responds
      memoryCategories: primaryAgentConfig.memoryCategories,
      extractionOnly: false,
    };

    const supportingAgents: AgentDispatch[] = analysis.supporting
      .map(s => {
        const agentConfig = availableAgents.find(a => a.id === s.agentId);
        if (!agentConfig) return null;
        return {
          agentId: agentConfig.id,
          agentName: agentConfig.displayName,
          agentEmoji: agentConfig.emoji,
          intent: s.intent,
          relevance: s.relevance,
          shouldRespond: s.shouldRespond,
          memoryCategories: agentConfig.memoryCategories,
          extractionOnly: s.extractionOnly,
        };
      })
      .filter((a): a is AgentDispatch => a !== null);

    console.log(`[Orchestration] Multi-agent: primary=${primaryAgent.agentName}, supporting=${supportingAgents.map(a => a.agentName).join(', ') || 'none'}`);

    return {
      primaryAgent,
      supportingAgents,
      allIntents: analysis.allIntents,
      reasoning: analysis.reasoning,
    };
  } catch (error) {
    console.error('[Orchestration] Multi-agent analysis failed:', error);
    return keywordBasedMultiAgent(message, availableAgents);
  }
}

/**
 * Keyword-based fallback for multi-agent dispatch
 */
function keywordBasedMultiAgent(message: string, agents: AgentConfig[]): MultiAgentAnalysis {
  const lower = message.toLowerCase();

  const intentKeywords: Record<string, string[]> = {
    health: ['health', 'sick', 'pain', 'doctor', 'medication', 'medicine', 'symptom', 'drug', 'prescription', 'hospital', 'therapy', 'mental', 'anxiety', 'depression'],
    fitness: ['workout', 'exercise', 'gym', 'run', 'golf', 'sport', 'fitness', 'weight', 'muscle', 'cardio', 'yoga', 'hike', 'bike', 'swim'],
    work: ['work', 'job', 'meeting', 'boss', 'career', 'resume', 'interview', 'fired', 'quit', 'office', 'project', 'deadline', 'colleague'],
    finance: ['money', 'budget', 'bill', 'debt', 'credit', 'bank', 'save', 'spend', 'afford', 'pay', 'income', 'expense', 'broke', 'financial'],
    personal: ['feel', 'feeling', 'mood', 'happy', 'sad', 'anxious', 'stressed', 'lonely', 'relationship', 'family', 'friend', 'love'],
    education: ['learn', 'study', 'school', 'class', 'homework', 'exam', 'test', 'course', 'book', 'read', 'teach'],
  };

  // Score all intents
  const intentScores: Array<{ intent: string; score: number }> = [];
  for (const [intent, keywords] of Object.entries(intentKeywords)) {
    const score = keywords.filter(k => lower.includes(k)).length;
    if (score > 0) {
      intentScores.push({ intent, score });
    }
  }

  // Sort by score descending
  intentScores.sort((a, b) => b.score - a.score);

  // If no intents found, use general/first agent
  if (intentScores.length === 0) {
    const defaultAgent = agents[0] || {
      id: 'default',
      displayName: 'Assistant',
      emoji: '🤖',
      intents: ['general'],
      memoryCategories: [],
    };
    return {
      primaryAgent: {
        agentId: defaultAgent.id,
        agentName: defaultAgent.displayName,
        agentEmoji: defaultAgent.emoji,
        intent: 'general',
        relevance: 0.5,
        shouldRespond: true,
        memoryCategories: defaultAgent.memoryCategories || [],
        extractionOnly: false,
      },
      supportingAgents: [],
      allIntents: ['general'],
    };
  }

  // Primary is highest scoring
  const primaryIntent = intentScores[0].intent;
  const primaryAgentConfig = findBestAgent(primaryIntent, agents);
  const primaryAgent: AgentDispatch = {
    agentId: primaryAgentConfig.id,
    agentName: primaryAgentConfig.displayName,
    agentEmoji: primaryAgentConfig.emoji,
    intent: primaryIntent,
    relevance: Math.min(0.5 + intentScores[0].score * 0.15, 1.0),
    shouldRespond: true,
    memoryCategories: primaryAgentConfig.memoryCategories,
    extractionOnly: false,
  };

  // Supporting agents for other intents
  const supportingAgents: AgentDispatch[] = intentScores
    .slice(1)
    .map(({ intent, score }) => {
      const agentConfig = findBestAgent(intent, agents);
      // Don't include same agent twice
      if (agentConfig.id === primaryAgent.agentId) return null;
      return {
        agentId: agentConfig.id,
        agentName: agentConfig.displayName,
        agentEmoji: agentConfig.emoji,
        intent,
        relevance: Math.min(0.3 + score * 0.15, 0.9),
        shouldRespond: score >= 2, // Only respond if strong match
        memoryCategories: agentConfig.memoryCategories,
        extractionOnly: score < 2,
      };
    })
    .filter((a): a is AgentDispatch => a !== null);

  return {
    primaryAgent,
    supportingAgents,
    allIntents: intentScores.map(s => s.intent),
  };
}

/**
 * Simple keyword-based routing fallback
 */
function keywordBasedRouting(message: string, agents: AgentConfig[]): OrchestrationResult {
  const lower = message.toLowerCase();

  // Define keyword patterns for each intent
  const intentKeywords: Record<string, string[]> = {
    health: ['health', 'sick', 'pain', 'doctor', 'medication', 'medicine', 'symptom', 'headache', 'tired', 'sleep', 'allergy', 'prescription', 'refill', 'blood pressure', 'diabetes', 'weight', 'diet'],
    fitness: ['workout', 'exercise', 'gym', 'run', 'running', 'weight', 'muscle', 'fitness', 'steps', 'calories', 'nutrition', 'protein', 'cardio'],
    work: ['work', 'meeting', 'calendar', 'project', 'deadline', 'task', 'email', 'colleague', 'boss', 'job', 'career', 'presentation', 'report', 'office'],
    finance: ['money', 'budget', 'spend', 'spent', 'save', 'saving', 'bank', 'credit', 'debt', 'invest', 'payment', 'bill', 'expense', 'income', 'salary', 'paid'],
    personal: ['feel', 'feeling', 'mood', 'happy', 'sad', 'anxious', 'grateful', 'journal', 'reflect', 'think', 'thought', 'relationship', 'family', 'friend'],
    education: ['learn', 'study', 'course', 'class', 'book', 'read', 'understand', 'explain', 'teach', 'homework', 'exam', 'test', 'research'],
  };

  // Score each intent
  let bestIntent = 'general';
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(intentKeywords)) {
    const score = keywords.filter(k => lower.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  const selectedAgent = findBestAgent(bestIntent, agents);
  const confidence = bestScore > 0 ? Math.min(0.5 + (bestScore * 0.1), 0.9) : 0.3;

  return {
    selectedAgentId: selectedAgent.id,
    agentName: selectedAgent.displayName,
    agentEmoji: selectedAgent.emoji,
    intent: bestIntent,
    confidence,
    memoryCategoriesToLoad: selectedAgent.memoryCategories,
  };
}

/**
 * Finds the best agent to handle a given intent
 */
function findBestAgent(intent: string, agents: AgentConfig[]): AgentConfig {
  // Direct intent match
  const directMatch = agents.find(a => a.intents.includes(intent));
  if (directMatch) {
    return directMatch;
  }

  // Map intents to agent types for fuzzy matching
  const intentToAgentMap: Record<string, string[]> = {
    health: ['health', 'buddy', 'medical'],
    fitness: ['fitness', 'coach', 'workout'],
    work: ['work', 'assistant', 'productivity'],
    finance: ['money', 'mentor', 'finance', 'budget'],
    personal: ['journal', 'pal', 'personal'],
    education: ['study', 'buddy', 'learning'],
  };

  const keywords = intentToAgentMap[intent] || [];
  const fuzzyMatch = agents.find(a => {
    const nameLower = a.displayName.toLowerCase();
    return keywords.some(k => nameLower.includes(k));
  });

  if (fuzzyMatch) {
    return fuzzyMatch;
  }

  // Fall back to first agent or create a default
  return agents[0] || {
    id: 'default',
    displayName: 'Assistant',
    emoji: '🤖',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5-20250929',
    intents: ['general'],
    memoryCategories: [],
  };
}

/**
 * Determines if a handoff to a different agent is needed mid-conversation
 */
export function shouldHandoff(
  currentAgentId: string,
  newRouting: OrchestrationResult
): boolean {
  // Don't handoff if confidence is too low
  if (newRouting.confidence < 0.7) {
    return false;
  }

  // Handoff if different agent and high confidence
  return currentAgentId !== newRouting.selectedAgentId;
}

/**
 * Gets the default orchestration agent configs
 */
export function getDefaultAgentConfigs(): AgentConfig[] {
  return [
    {
      id: 'health_buddy',
      displayName: 'Health Buddy',
      emoji: '🏥',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-5-20250929',
      personality: 'caring, supportive, and health-conscious',
      intents: ['health', 'medications', 'symptoms', 'wellness'],
      memoryCategories: ['health', 'medications', 'symptoms'],
    },
    {
      id: 'fitness_coach',
      displayName: 'Fitness Coach',
      emoji: '💪',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-5-20250929',
      personality: 'motivating, energetic, and knowledgeable about fitness',
      intents: ['fitness', 'exercise', 'nutrition', 'workout'],
      memoryCategories: ['exercise', 'nutrition', 'goals'],
    },
    {
      id: 'work_assistant',
      displayName: 'Work Assistant',
      emoji: '💼',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-5-20250929',
      personality: 'professional, organized, and efficient',
      intents: ['work', 'tasks', 'meetings', 'career'],
      memoryCategories: ['employment', 'tasks', 'meetings'],
    },
    {
      id: 'money_mentor',
      displayName: 'Money Mentor',
      emoji: '💰',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-5-20250929',
      personality: 'practical, non-judgmental, and financially savvy',
      intents: ['finance', 'budget', 'expenses', 'financial'],
      memoryCategories: ['financial', 'budget', 'goals'],
    },
    {
      id: 'journal_pal',
      displayName: 'Journal Pal',
      emoji: '📔',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-5-20250929',
      personality: 'thoughtful, empathetic, and reflective',
      intents: ['personal', 'mood', 'reflections', 'gratitude'],
      memoryCategories: ['personal', 'mood', 'reflections'],
    },
    {
      id: 'study_buddy',
      displayName: 'Study Buddy',
      emoji: '📚',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-5-20250929',
      personality: 'patient, encouraging, and curious',
      intents: ['education', 'learning', 'study', 'research'],
      memoryCategories: ['education', 'learning', 'goals'],
    },
  ];
}
