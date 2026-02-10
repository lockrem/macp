/**
 * Prompts Configuration Loader
 *
 * Centralizes all AI prompts, system instructions, and grounding rules.
 * Load from prompts.json for easy updates without code changes.
 *
 * TIERED OVERRIDE SYSTEM:
 * Layer 1: Immutable Guardrails (GUARDRAILS constant below) - Safety limits, cannot be overridden
 * Layer 2: Platform Defaults (prompts.json) - Owner-tunable baseline
 * Layer 3: User Preferences (database) - Per-user customization within bounds
 * Layer 4: Agent Overrides (database) - Per-agent customization within bounds
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// -----------------------------------------------------------------------------
// LAYER 1: Immutable Guardrails (CANNOT be overridden by users)
// -----------------------------------------------------------------------------

/**
 * Safety limits that apply regardless of user or platform settings.
 * These prevent cost explosions, broken experiences, and abuse.
 */
export const GUARDRAILS = {
  // Response length bounds
  minResponseWords: 3,          // Agents must say something meaningful
  maxResponseWords: 100,        // Prevent walls of text
  minResponseTokens: 10,        // Minimum tokens for any response
  maxResponseTokens: 500,       // Absolute max to prevent cost explosion

  // Agent participation bounds
  minAgentsPerTurn: 0,          // Allow no agents if none relevant
  maxAgentsPerTurn: 5,          // Prevent conversation chaos

  // Bidding bounds
  minBidThreshold: 0.1,         // Some filtering always required
  maxBidThreshold: 0.9,         // Don't allow threshold so high nothing participates

  // Memory bounds
  minMemoriesPerVisitor: 0,
  maxMemoriesPerVisitor: 100,   // Prevent unbounded memory growth

  // Context bounds
  minContextMessages: 3,        // Need some context
  maxContextMessages: 50,       // Don't overload context window
} as const;

export type Guardrails = typeof GUARDRAILS;

/**
 * Clamp a value between guardrail min and max
 */
export function clampToGuardrails(
  value: number,
  min: keyof Guardrails,
  max: keyof Guardrails
): number {
  return Math.max(GUARDRAILS[min] as number, Math.min(value, GUARDRAILS[max] as number));
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface PromptsConfig {
  version: string;
  lastUpdated: string;
  limits: Limits;
  thresholds: Thresholds;
  weights: Weights;
  categories: Categories;
  prompts: Prompts;
  keywords: Keywords;
}

export interface Limits {
  agentResponseWords: number;
  hostResponseWords: number;
  hostResponseTokens: number;
  formAgentTokens: number;
  maxAgentsPerTurn: number;
  maxVisitorMemories: number;
  conversationContextMessages: number;
}

export interface Thresholds {
  bidConfidence: number;
  taskMatchConfidence: number;
  participationScore: number;
}

export interface Weights {
  bidding: {
    relevance: number;
    expertise: number;
    novelty: number;
    recency: number;
  };
}

export interface Categories {
  memory: string[];
  memoryDisplayNames: Record<string, string>;
}

export interface Prompts {
  bidding: {
    system: string;
    roleInstructions: Record<string, string>;
  };
  agentResponse: {
    system: string;
    taskPrompt: string;
    defaultPrompt: string;
    memoriesSection: string;
  };
  hostAgent: {
    greeting: {
      regular: string;
      form: string;
      greetingMessage: {
        regular: string;
        form: string;
      };
    };
    response: {
      regular: string;
      form: string;
      activeAgentsNote: string;
      userMessage: {
        regular: string;
        form: string;
      };
    };
    followUp: string;
  };
  factExtraction: {
    system: string;
    prompt: string;
  };
  formExtraction: {
    system: string;
    prompt: string;
  };
  taskCompletion: {
    system: string;
    prompt: string;
  };
  memoryDistribution: {
    system: string;
    prompt: string;
  };
  orchestration: {
    intentAnalysis: {
      system: string;
      prompt: string;
    };
    multiAgent: {
      system: string;
      prompt: string;
    };
  };
  ruleExtraction: {
    system: string;
    prompt: string;
  };
  autonomous: {
    host: string;
    visitor: string;
  };
  summary: {
    system: string;
    prompt: string;
  };
}

export interface Keywords {
  intents: Record<string, string[]>;
}

// -----------------------------------------------------------------------------
// User Preference Types (Layer 3)
// -----------------------------------------------------------------------------

export type GroundingPreset = 'efficient' | 'balanced' | 'conversational' | 'custom';
export type ParticipationStyle = 'minimal' | 'balanced' | 'active';
export type ResponseStyle = 'concise' | 'conversational' | 'detailed';
export type Formality = 'casual' | 'professional' | 'formal';
export type MemorySharing = 'conservative' | 'balanced' | 'proactive';

export interface UserGroundingPreferences {
  userId: string;
  preset: GroundingPreset;

  // Verbosity (bounded by guardrails)
  agentResponseWords: number;
  hostResponseWords: number;

  // Participation style
  participationStyle: ParticipationStyle;

  // Personality
  responseStyle: ResponseStyle;
  formality: Formality;

  // Memory behavior
  memorySharing: MemorySharing;

  // Advanced (power users only)
  customSystemPromptSuffix?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface AgentGroundingOverrides {
  agentId: string;
  userId: string;

  // Override specific settings (null = use user preference)
  wordLimit?: number;
  responseStyle?: ResponseStyle;
  formality?: Formality;
  memorySharing?: MemorySharing;
  customSystemPromptSuffix?: string;

  createdAt: Date;
  updatedAt: Date;
}

// -----------------------------------------------------------------------------
// Preset Definitions
// -----------------------------------------------------------------------------

export interface PresetConfig {
  name: string;
  description: string;
  agentResponseWords: number;
  hostResponseWords: number;
  participationStyle: ParticipationStyle;
  responseStyle: ResponseStyle;
  formality: Formality;
  memorySharing: MemorySharing;
}

export const PRESETS: Record<GroundingPreset, PresetConfig> = {
  efficient: {
    name: 'Efficient',
    description: 'Brief, to the point. Agents speak only when necessary.',
    agentResponseWords: 10,
    hostResponseWords: 15,
    participationStyle: 'minimal',
    responseStyle: 'concise',
    formality: 'professional',
    memorySharing: 'conservative',
  },
  balanced: {
    name: 'Balanced',
    description: 'The default experience. Clear communication with appropriate detail.',
    agentResponseWords: 15,
    hostResponseWords: 20,
    participationStyle: 'balanced',
    responseStyle: 'conversational',
    formality: 'professional',
    memorySharing: 'balanced',
  },
  conversational: {
    name: 'Conversational',
    description: 'More natural dialogue. Agents engage proactively.',
    agentResponseWords: 30,
    hostResponseWords: 40,
    participationStyle: 'active',
    responseStyle: 'detailed',
    formality: 'casual',
    memorySharing: 'proactive',
  },
  custom: {
    name: 'Custom',
    description: 'Full control over all settings.',
    agentResponseWords: 15,
    hostResponseWords: 20,
    participationStyle: 'balanced',
    responseStyle: 'conversational',
    formality: 'professional',
    memorySharing: 'balanced',
  },
};

/**
 * Get the default preferences for a new user
 */
export function getDefaultUserPreferences(userId: string): UserGroundingPreferences {
  const preset = PRESETS.balanced;
  return {
    userId,
    preset: 'balanced',
    agentResponseWords: preset.agentResponseWords,
    hostResponseWords: preset.hostResponseWords,
    participationStyle: preset.participationStyle,
    responseStyle: preset.responseStyle,
    formality: preset.formality,
    memorySharing: preset.memorySharing,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Apply a preset to user preferences
 */
export function applyPreset(
  preferences: UserGroundingPreferences,
  preset: GroundingPreset
): UserGroundingPreferences {
  if (preset === 'custom') {
    return { ...preferences, preset: 'custom', updatedAt: new Date() };
  }

  const config = PRESETS[preset];
  return {
    ...preferences,
    preset,
    agentResponseWords: config.agentResponseWords,
    hostResponseWords: config.hostResponseWords,
    participationStyle: config.participationStyle,
    responseStyle: config.responseStyle,
    formality: config.formality,
    memorySharing: config.memorySharing,
    updatedAt: new Date(),
  };
}

// -----------------------------------------------------------------------------
// Loader
// -----------------------------------------------------------------------------

let config: PromptsConfig | null = null;

/**
 * Load prompts configuration from JSON file
 * Caches the result for subsequent calls
 */
export function loadPromptsConfig(): PromptsConfig {
  if (config) {
    return config;
  }

  try {
    // Try multiple possible locations for the config file
    const possiblePaths = [
      join(process.cwd(), 'src/config/prompts.json'),           // Dev: from project root
      join(process.cwd(), 'dist/config/prompts.json'),          // Lambda: from dist
      join(process.cwd(), 'config/prompts.json'),               // Alt location
    ];

    let jsonContent: string | null = null;
    let loadedPath: string = '';

    for (const configPath of possiblePaths) {
      try {
        jsonContent = readFileSync(configPath, 'utf-8');
        loadedPath = configPath;
        break;
      } catch {
        // Try next path
      }
    }

    if (!jsonContent) {
      throw new Error('Could not find prompts.json in any expected location');
    }

    config = JSON.parse(jsonContent) as PromptsConfig;
    console.log(`[Prompts] Loaded config v${config.version} from ${loadedPath}`);
    return config;
  } catch (error) {
    console.error('[Prompts] Failed to load prompts.json, using defaults:', error);
    // Return minimal defaults if file can't be loaded
    config = getDefaultConfig();
    return config;
  }
}

/**
 * Reload prompts configuration (useful for hot-reload scenarios)
 */
export function reloadPromptsConfig(): PromptsConfig {
  config = null;
  return loadPromptsConfig();
}

/**
 * Template string interpolation
 * Replaces {{variable}} placeholders with values from the vars object
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return vars[key]?.toString() ?? `{{${key}}}`;
  });
}

// -----------------------------------------------------------------------------
// Convenience Accessors
// -----------------------------------------------------------------------------

export function getLimits(): Limits {
  return loadPromptsConfig().limits;
}

export function getThresholds(): Thresholds {
  return loadPromptsConfig().thresholds;
}

export function getWeights(): Weights {
  return loadPromptsConfig().weights;
}

export function getPrompts(): Prompts {
  return loadPromptsConfig().prompts;
}

export function getKeywords(): Keywords {
  return loadPromptsConfig().keywords;
}

export function getCategories(): Categories {
  return loadPromptsConfig().categories;
}

/**
 * Get a specific prompt with variable interpolation
 */
export function getPrompt(
  path: string,
  vars: Record<string, string | number> = {}
): string {
  const prompts = loadPromptsConfig().prompts;

  // Navigate the path (e.g., "hostAgent.greeting.regular")
  const parts = path.split('.');
  let value: any = prompts;

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      console.warn(`[Prompts] Path not found: ${path}`);
      return '';
    }
  }

  if (typeof value !== 'string') {
    console.warn(`[Prompts] Path ${path} is not a string`);
    return '';
  }

  return interpolate(value, vars);
}

/**
 * Get role instruction for an agent type
 */
export function getRoleInstruction(agentType: 'assistant' | 'health' | 'finance' | 'default', intents?: string[]): string {
  const instructions = loadPromptsConfig().prompts.bidding.roleInstructions;
  const template = instructions[agentType] || instructions.default;

  if (agentType === 'default' && intents) {
    return interpolate(template, { intents: intents.join('/') });
  }

  return template;
}

/**
 * Check if a message matches intent keywords
 */
export function matchIntentKeywords(message: string): string[] {
  const keywords = loadPromptsConfig().keywords.intents;
  const lower = message.toLowerCase();
  const matched: string[] = [];

  for (const [intent, words] of Object.entries(keywords)) {
    if (words.some(word => lower.includes(word))) {
      matched.push(intent);
    }
  }

  return matched.length > 0 ? matched : ['general'];
}

// -----------------------------------------------------------------------------
// Default Config (fallback)
// -----------------------------------------------------------------------------

function getDefaultConfig(): PromptsConfig {
  return {
    version: '0.0.0',
    lastUpdated: 'fallback',
    limits: {
      agentResponseWords: 15,
      hostResponseWords: 20,
      hostResponseTokens: 80,
      formAgentTokens: 40,
      maxAgentsPerTurn: 3,
      maxVisitorMemories: 50,
      conversationContextMessages: 10,
    },
    thresholds: {
      bidConfidence: 0.5,
      taskMatchConfidence: 0.7,
      participationScore: 0.3,
    },
    weights: {
      bidding: {
        relevance: 0.4,
        expertise: 0.3,
        novelty: 0.15,
        recency: 0.15,
      },
    },
    categories: {
      memory: ['identity', 'dietary', 'health', 'preferences', 'general'],
      memoryDisplayNames: {},
    },
    prompts: {
      bidding: {
        system: 'Evaluate agent participation. Return JSON with shouldParticipate boolean.',
        roleInstructions: {
          assistant: 'Handle general requests.',
          health: 'Handle health/dietary topics only.',
          finance: 'Handle financial topics only.',
          default: 'Focus on your expertise.',
        },
      },
      agentResponse: {
        system: 'You are {{agentName}}. Be brief.',
        taskPrompt: 'Complete this task: {{taskDescription}}',
        defaultPrompt: 'Respond briefly.',
        memoriesSection: 'User info: {{memories}}',
      },
      hostAgent: {
        greeting: {
          regular: 'Greet the visitor briefly.',
          form: 'Ask about form fields.',
          greetingMessage: { regular: 'Hello!', form: 'Hi! Let me collect some info.' },
        },
        response: {
          regular: 'Respond helpfully.',
          form: 'Collect form fields.',
          activeAgentsNote: 'Visitor has AI assistants.',
          userMessage: { regular: 'Respond.', form: 'Ask next field.' },
        },
        followUp: 'Acknowledge what was shared.',
      },
      factExtraction: {
        system: 'Extract facts. Return JSON array.',
        prompt: 'Conversation: {{conversation}}',
      },
      formExtraction: {
        system: 'Extract form values. Return JSON.',
        prompt: 'Extract from: {{transcript}}',
      },
      taskCompletion: {
        system: 'Detect task completion.',
        prompt: 'Check if completed: {{hostResponse}}',
      },
      memoryDistribution: {
        system: 'Match facts to agents.',
        prompt: 'Facts: {{facts}}, Agents: {{agents}}',
      },
      orchestration: {
        intentAnalysis: {
          system: 'Analyze intent.',
          prompt: 'Message: {{message}}',
        },
        multiAgent: {
          system: 'Select agents.',
          prompt: 'Message: {{message}}, Agents: {{agents}}',
        },
      },
      ruleExtraction: {
        system: 'Extract behavioral rules.',
        prompt: 'Conversation: {{conversation}}',
      },
      autonomous: {
        host: 'You are {{agentName}}.',
        visitor: 'You represent the user.',
      },
      summary: {
        system: 'Summarize conversation.',
        prompt: 'Conversation: {{conversation}}',
      },
    },
    keywords: {
      intents: {
        dietary: ['food', 'diet', 'allergy'],
        health: ['health', 'medical'],
        financial: ['money', 'budget', 'cost'],
        general: [],
      },
    },
  };
}
