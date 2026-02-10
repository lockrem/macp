/**
 * Grounding Service
 *
 * Implements the 4-layer tiered override system for AI grounding rules:
 * Layer 1: Immutable Guardrails (safety limits that cannot be overridden)
 * Layer 2: Platform Defaults (prompts.json - owner-tunable baseline)
 * Layer 3: User Preferences (database - per-user customization)
 * Layer 4: Agent Overrides (database - per-agent customization)
 *
 * The merge strategy:
 * - Guardrails ALWAYS win (clamping)
 * - User preferences override platform defaults
 * - Agent overrides override user preferences
 * - Null values mean "inherit from previous layer"
 */

import { getDatabase, userGroundingPreferences, agentGroundingOverrides } from '@macp/core';
import { eq, and } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  GUARDRAILS,
  clampToGuardrails,
  getLimits,
  getThresholds,
  getWeights,
  getPrompts,
  getDefaultUserPreferences,
  applyPreset,
  PRESETS,
  type UserGroundingPreferences,
  type AgentGroundingOverrides,
  type GroundingPreset,
  type ParticipationStyle,
  type ResponseStyle,
  type Formality,
  type MemorySharing,
  type PresetConfig,
} from '../config/prompts.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * The effective grounding configuration after merging all 4 layers
 */
export interface EffectiveGroundingConfig {
  // Word limits (clamped to guardrails)
  agentResponseWords: number;
  hostResponseWords: number;
  maxTokens: number;

  // Participation
  maxAgentsPerTurn: number;
  bidConfidence: number;
  participationStyle: ParticipationStyle;

  // Style
  responseStyle: ResponseStyle;
  formality: Formality;

  // Memory
  memorySharing: MemorySharing;
  maxVisitorMemories: number;

  // Context
  conversationContextMessages: number;

  // Advanced
  customSystemPromptSuffix?: string;

  // Bidding weights
  weights: {
    relevance: number;
    expertise: number;
    novelty: number;
    recency: number;
  };

  // Source tracking (for debugging)
  sources: {
    preset: GroundingPreset;
    hasUserOverrides: boolean;
    hasAgentOverrides: boolean;
  };
}

// -----------------------------------------------------------------------------
// Database Operations
// -----------------------------------------------------------------------------

/**
 * Get user's grounding preferences from database
 * Returns null if user has no custom preferences (uses defaults)
 */
export async function getUserGroundingPreferences(
  userId: string
): Promise<UserGroundingPreferences | null> {
  const db = getDatabase();

  const [row] = await db
    .select()
    .from(userGroundingPreferences)
    .where(eq(userGroundingPreferences.userId, userId));

  if (!row) return null;

  return {
    userId: row.userId,
    preset: row.preset as GroundingPreset,
    agentResponseWords: row.agentResponseWords,
    hostResponseWords: row.hostResponseWords,
    participationStyle: row.participationStyle as ParticipationStyle,
    responseStyle: row.responseStyle as ResponseStyle,
    formality: row.formality as Formality,
    memorySharing: row.memorySharing as MemorySharing,
    customSystemPromptSuffix: row.customSystemPromptSuffix || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Save user's grounding preferences to database
 */
export async function saveUserGroundingPreferences(
  preferences: UserGroundingPreferences
): Promise<UserGroundingPreferences> {
  const db = getDatabase();

  // Clamp values to guardrails
  const clampedPreferences = {
    ...preferences,
    agentResponseWords: clampToGuardrails(
      preferences.agentResponseWords,
      'minResponseWords',
      'maxResponseWords'
    ),
    hostResponseWords: clampToGuardrails(
      preferences.hostResponseWords,
      'minResponseWords',
      'maxResponseWords'
    ),
    updatedAt: new Date(),
  };

  await db
    .insert(userGroundingPreferences)
    .values({
      userId: clampedPreferences.userId,
      preset: clampedPreferences.preset,
      agentResponseWords: clampedPreferences.agentResponseWords,
      hostResponseWords: clampedPreferences.hostResponseWords,
      participationStyle: clampedPreferences.participationStyle,
      responseStyle: clampedPreferences.responseStyle,
      formality: clampedPreferences.formality,
      memorySharing: clampedPreferences.memorySharing,
      customSystemPromptSuffix: clampedPreferences.customSystemPromptSuffix,
      createdAt: clampedPreferences.createdAt,
      updatedAt: clampedPreferences.updatedAt,
    })
    .onConflictDoUpdate({
      target: userGroundingPreferences.userId,
      set: {
        preset: clampedPreferences.preset,
        agentResponseWords: clampedPreferences.agentResponseWords,
        hostResponseWords: clampedPreferences.hostResponseWords,
        participationStyle: clampedPreferences.participationStyle,
        responseStyle: clampedPreferences.responseStyle,
        formality: clampedPreferences.formality,
        memorySharing: clampedPreferences.memorySharing,
        customSystemPromptSuffix: clampedPreferences.customSystemPromptSuffix,
        updatedAt: clampedPreferences.updatedAt,
      },
    });

  console.log(`[Grounding] Saved preferences for user ${preferences.userId}`);
  return clampedPreferences;
}

/**
 * Get agent-specific overrides from database
 */
export async function getAgentGroundingOverrides(
  userId: string,
  agentId: string
): Promise<AgentGroundingOverrides | null> {
  const db = getDatabase();

  const [row] = await db
    .select()
    .from(agentGroundingOverrides)
    .where(
      and(
        eq(agentGroundingOverrides.userId, userId),
        eq(agentGroundingOverrides.agentId, agentId)
      )
    );

  if (!row) return null;

  return {
    agentId: row.agentId,
    userId: row.userId,
    wordLimit: row.wordLimit || undefined,
    responseStyle: (row.responseStyle as ResponseStyle) || undefined,
    formality: (row.formality as Formality) || undefined,
    memorySharing: (row.memorySharing as MemorySharing) || undefined,
    customSystemPromptSuffix: row.customSystemPromptSuffix || undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Save agent-specific overrides to database
 */
export async function saveAgentGroundingOverrides(
  overrides: AgentGroundingOverrides
): Promise<AgentGroundingOverrides> {
  const db = getDatabase();

  // Clamp word limit if provided
  const clampedOverrides = {
    ...overrides,
    wordLimit: overrides.wordLimit
      ? clampToGuardrails(overrides.wordLimit, 'minResponseWords', 'maxResponseWords')
      : undefined,
    updatedAt: new Date(),
  };

  // Check if exists
  const [existing] = await db
    .select()
    .from(agentGroundingOverrides)
    .where(
      and(
        eq(agentGroundingOverrides.userId, overrides.userId),
        eq(agentGroundingOverrides.agentId, overrides.agentId)
      )
    );

  if (existing) {
    await db
      .update(agentGroundingOverrides)
      .set({
        wordLimit: clampedOverrides.wordLimit,
        responseStyle: clampedOverrides.responseStyle,
        formality: clampedOverrides.formality,
        memorySharing: clampedOverrides.memorySharing,
        customSystemPromptSuffix: clampedOverrides.customSystemPromptSuffix,
        updatedAt: clampedOverrides.updatedAt,
      })
      .where(eq(agentGroundingOverrides.id, existing.id));
  } else {
    await db.insert(agentGroundingOverrides).values({
      id: ulid(),
      agentId: clampedOverrides.agentId,
      userId: clampedOverrides.userId,
      wordLimit: clampedOverrides.wordLimit,
      responseStyle: clampedOverrides.responseStyle,
      formality: clampedOverrides.formality,
      memorySharing: clampedOverrides.memorySharing,
      customSystemPromptSuffix: clampedOverrides.customSystemPromptSuffix,
      createdAt: clampedOverrides.createdAt,
      updatedAt: clampedOverrides.updatedAt,
    });
  }

  console.log(`[Grounding] Saved overrides for agent ${overrides.agentId}`);
  return clampedOverrides;
}

/**
 * Delete agent-specific overrides
 */
export async function deleteAgentGroundingOverrides(
  userId: string,
  agentId: string
): Promise<boolean> {
  const db = getDatabase();

  await db
    .delete(agentGroundingOverrides)
    .where(
      and(
        eq(agentGroundingOverrides.userId, userId),
        eq(agentGroundingOverrides.agentId, agentId)
      )
    );

  console.log(`[Grounding] Deleted overrides for agent ${agentId}`);
  return true;
}

// -----------------------------------------------------------------------------
// Layer Merging
// -----------------------------------------------------------------------------

/**
 * Participation style to bid threshold multiplier
 */
function participationStyleToThreshold(style: ParticipationStyle): number {
  switch (style) {
    case 'minimal':
      return 0.7; // Higher threshold = fewer agents participate
    case 'balanced':
      return 0.5;
    case 'active':
      return 0.3; // Lower threshold = more agents participate
  }
}

/**
 * Memory sharing to max memories multiplier
 */
function memorySharingToLimit(sharing: MemorySharing): number {
  switch (sharing) {
    case 'conservative':
      return 25;
    case 'balanced':
      return 50;
    case 'proactive':
      return 75;
  }
}

/**
 * Get the effective grounding configuration by merging all 4 layers
 *
 * @param userId - The user ID (null for anonymous)
 * @param agentId - Optional agent ID for per-agent overrides
 */
export async function getEffectiveConfig(
  userId: string | null,
  agentId?: string
): Promise<EffectiveGroundingConfig> {
  // Layer 2: Platform defaults (from prompts.json)
  const platformLimits = getLimits();
  const platformThresholds = getThresholds();
  const platformWeights = getWeights();

  // Start with platform defaults
  let config: EffectiveGroundingConfig = {
    agentResponseWords: platformLimits.agentResponseWords,
    hostResponseWords: platformLimits.hostResponseWords,
    maxTokens: platformLimits.hostResponseTokens,
    maxAgentsPerTurn: platformLimits.maxAgentsPerTurn,
    bidConfidence: platformThresholds.bidConfidence,
    participationStyle: 'balanced',
    responseStyle: 'conversational',
    formality: 'professional',
    memorySharing: 'balanced',
    maxVisitorMemories: platformLimits.maxVisitorMemories,
    conversationContextMessages: platformLimits.conversationContextMessages,
    weights: { ...platformWeights.bidding },
    sources: {
      preset: 'balanced',
      hasUserOverrides: false,
      hasAgentOverrides: false,
    },
  };

  // Layer 3: User preferences (if authenticated)
  if (userId) {
    const userPrefs = await getUserGroundingPreferences(userId);

    if (userPrefs) {
      config = {
        ...config,
        agentResponseWords: userPrefs.agentResponseWords,
        hostResponseWords: userPrefs.hostResponseWords,
        participationStyle: userPrefs.participationStyle,
        bidConfidence: participationStyleToThreshold(userPrefs.participationStyle),
        responseStyle: userPrefs.responseStyle,
        formality: userPrefs.formality,
        memorySharing: userPrefs.memorySharing,
        maxVisitorMemories: memorySharingToLimit(userPrefs.memorySharing),
        customSystemPromptSuffix: userPrefs.customSystemPromptSuffix,
        sources: {
          ...config.sources,
          preset: userPrefs.preset,
          hasUserOverrides: true,
        },
      };
    }
  }

  // Layer 4: Agent overrides (if specified)
  if (userId && agentId) {
    const agentOverrides = await getAgentGroundingOverrides(userId, agentId);

    if (agentOverrides) {
      config = {
        ...config,
        agentResponseWords: agentOverrides.wordLimit ?? config.agentResponseWords,
        responseStyle: agentOverrides.responseStyle ?? config.responseStyle,
        formality: agentOverrides.formality ?? config.formality,
        memorySharing: agentOverrides.memorySharing ?? config.memorySharing,
        maxVisitorMemories: agentOverrides.memorySharing
          ? memorySharingToLimit(agentOverrides.memorySharing)
          : config.maxVisitorMemories,
        customSystemPromptSuffix:
          agentOverrides.customSystemPromptSuffix ?? config.customSystemPromptSuffix,
        sources: {
          ...config.sources,
          hasAgentOverrides: true,
        },
      };
    }
  }

  // Layer 1: Apply guardrails (always, cannot be overridden)
  config.agentResponseWords = clampToGuardrails(
    config.agentResponseWords,
    'minResponseWords',
    'maxResponseWords'
  );
  config.hostResponseWords = clampToGuardrails(
    config.hostResponseWords,
    'minResponseWords',
    'maxResponseWords'
  );
  config.maxTokens = clampToGuardrails(
    config.maxTokens,
    'minResponseTokens',
    'maxResponseTokens'
  );
  config.maxAgentsPerTurn = clampToGuardrails(
    config.maxAgentsPerTurn,
    'minAgentsPerTurn',
    'maxAgentsPerTurn'
  );
  config.bidConfidence = Math.max(
    GUARDRAILS.minBidThreshold,
    Math.min(config.bidConfidence, GUARDRAILS.maxBidThreshold)
  );
  config.maxVisitorMemories = clampToGuardrails(
    config.maxVisitorMemories,
    'minMemoriesPerVisitor',
    'maxMemoriesPerVisitor'
  );
  config.conversationContextMessages = clampToGuardrails(
    config.conversationContextMessages,
    'minContextMessages',
    'maxContextMessages'
  );

  return config;
}

// -----------------------------------------------------------------------------
// Convenience Functions
// -----------------------------------------------------------------------------

/**
 * Get all available presets with their configurations
 */
export function getAvailablePresets(): Record<GroundingPreset, PresetConfig> {
  return PRESETS;
}

/**
 * Apply a preset to a user's preferences
 */
export async function applyPresetToUser(
  userId: string,
  preset: GroundingPreset
): Promise<UserGroundingPreferences> {
  let preferences = await getUserGroundingPreferences(userId);

  if (!preferences) {
    preferences = getDefaultUserPreferences(userId);
  }

  const updated = applyPreset(preferences, preset);
  return saveUserGroundingPreferences(updated);
}

/**
 * Reset user preferences to defaults
 */
export async function resetUserPreferences(userId: string): Promise<UserGroundingPreferences> {
  const defaults = getDefaultUserPreferences(userId);
  return saveUserGroundingPreferences(defaults);
}

/**
 * Get a summary of what a user's effective config looks like
 * (useful for the settings UI)
 */
export async function getUserConfigSummary(userId: string): Promise<{
  preset: GroundingPreset;
  presetName: string;
  isCustomized: boolean;
  effectiveConfig: EffectiveGroundingConfig;
  agentOverrideCount: number;
}> {
  const db = getDatabase();
  const effectiveConfig = await getEffectiveConfig(userId);

  // Count agent overrides
  const overrides = await db
    .select()
    .from(agentGroundingOverrides)
    .where(eq(agentGroundingOverrides.userId, userId));

  return {
    preset: effectiveConfig.sources.preset,
    presetName: PRESETS[effectiveConfig.sources.preset].name,
    isCustomized: effectiveConfig.sources.hasUserOverrides,
    effectiveConfig,
    agentOverrideCount: overrides.length,
  };
}
