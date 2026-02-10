/**
 * Grounding Preferences API Routes
 *
 * Allows users to customize their AI agent behavior within platform guardrails.
 * Supports:
 * - Preset selection (efficient, balanced, conversational, custom)
 * - Granular customization (word limits, formality, memory sharing)
 * - Per-agent overrides
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getUserGroundingPreferences,
  saveUserGroundingPreferences,
  getAgentGroundingOverrides,
  saveAgentGroundingOverrides,
  deleteAgentGroundingOverrides,
  getEffectiveConfig,
  getAvailablePresets,
  applyPresetToUser,
  resetUserPreferences,
  getUserConfigSummary,
} from '../services/grounding-service.js';
import {
  GUARDRAILS,
  getDefaultUserPreferences,
  type GroundingPreset,
  type ParticipationStyle,
  type ResponseStyle,
  type Formality,
  type MemorySharing,
} from '../config/prompts.js';

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const presetSchema = z.enum(['efficient', 'balanced', 'conversational', 'custom']);
const participationStyleSchema = z.enum(['minimal', 'balanced', 'active']);
const responseStyleSchema = z.enum(['concise', 'conversational', 'detailed']);
const formalitySchema = z.enum(['casual', 'professional', 'formal']);
const memorySharingSchema = z.enum(['conservative', 'balanced', 'proactive']);

const updatePreferencesSchema = z.object({
  preset: presetSchema.optional(),
  agentResponseWords: z.number().min(GUARDRAILS.minResponseWords).max(GUARDRAILS.maxResponseWords).optional(),
  hostResponseWords: z.number().min(GUARDRAILS.minResponseWords).max(GUARDRAILS.maxResponseWords).optional(),
  participationStyle: participationStyleSchema.optional(),
  responseStyle: responseStyleSchema.optional(),
  formality: formalitySchema.optional(),
  memorySharing: memorySharingSchema.optional(),
  customSystemPromptSuffix: z.string().max(500).optional(),
});

const agentOverridesSchema = z.object({
  wordLimit: z.number().min(GUARDRAILS.minResponseWords).max(GUARDRAILS.maxResponseWords).optional().nullable(),
  responseStyle: responseStyleSchema.optional().nullable(),
  formality: formalitySchema.optional().nullable(),
  memorySharing: memorySharingSchema.optional().nullable(),
  customSystemPromptSuffix: z.string().max(500).optional().nullable(),
});

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export async function groundingRoutes(app: FastifyInstance) {
  /**
   * GET /api/grounding/presets
   * Get all available preset configurations
   */
  app.get('/api/grounding/presets', async (request: FastifyRequest, reply: FastifyReply) => {
    const presets = getAvailablePresets();

    return {
      presets: Object.entries(presets).map(([key, config]) => ({
        id: key,
        name: config.name,
        description: config.description,
        settings: {
          agentResponseWords: config.agentResponseWords,
          hostResponseWords: config.hostResponseWords,
          participationStyle: config.participationStyle,
          responseStyle: config.responseStyle,
          formality: config.formality,
          memorySharing: config.memorySharing,
        },
      })),
      guardrails: {
        minResponseWords: GUARDRAILS.minResponseWords,
        maxResponseWords: GUARDRAILS.maxResponseWords,
        minAgentsPerTurn: GUARDRAILS.minAgentsPerTurn,
        maxAgentsPerTurn: GUARDRAILS.maxAgentsPerTurn,
      },
    };
  });

  /**
   * GET /api/grounding/preferences
   * Get current user's grounding preferences
   */
  app.get('/api/grounding/preferences', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const summary = await getUserConfigSummary(userId);

    return {
      preset: summary.preset,
      presetName: summary.presetName,
      isCustomized: summary.isCustomized,
      agentOverrideCount: summary.agentOverrideCount,
      preferences: {
        agentResponseWords: summary.effectiveConfig.agentResponseWords,
        hostResponseWords: summary.effectiveConfig.hostResponseWords,
        participationStyle: summary.effectiveConfig.participationStyle,
        responseStyle: summary.effectiveConfig.responseStyle,
        formality: summary.effectiveConfig.formality,
        memorySharing: summary.effectiveConfig.memorySharing,
        customSystemPromptSuffix: summary.effectiveConfig.customSystemPromptSuffix,
      },
      effectiveLimits: {
        maxAgentsPerTurn: summary.effectiveConfig.maxAgentsPerTurn,
        bidConfidence: summary.effectiveConfig.bidConfidence,
        maxVisitorMemories: summary.effectiveConfig.maxVisitorMemories,
        maxTokens: summary.effectiveConfig.maxTokens,
      },
    };
  });

  /**
   * PUT /api/grounding/preferences
   * Update user's grounding preferences
   */
  app.put('/api/grounding/preferences', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const parseResult = updatePreferencesSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid preferences',
        details: parseResult.error.issues,
      });
    }

    const updates = parseResult.data;

    // Get existing or create default
    let preferences = await getUserGroundingPreferences(userId);
    if (!preferences) {
      preferences = getDefaultUserPreferences(userId);
    }

    // Apply updates
    const updated = {
      ...preferences,
      ...updates,
      // If any individual setting is changed, switch to custom preset
      preset: updates.preset ?? (Object.keys(updates).length > 0 ? 'custom' : preferences.preset),
      updatedAt: new Date(),
    };

    const saved = await saveUserGroundingPreferences(updated as any);

    return {
      success: true,
      preferences: saved,
    };
  });

  /**
   * POST /api/grounding/preferences/preset
   * Apply a preset to user's preferences
   */
  app.post('/api/grounding/preferences/preset', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { preset } = request.body as { preset?: string };
    const parseResult = presetSchema.safeParse(preset);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid preset',
        validPresets: ['efficient', 'balanced', 'conversational', 'custom'],
      });
    }

    const updated = await applyPresetToUser(userId, parseResult.data);

    return {
      success: true,
      preset: parseResult.data,
      preferences: updated,
    };
  });

  /**
   * POST /api/grounding/preferences/reset
   * Reset user's preferences to defaults
   */
  app.post('/api/grounding/preferences/reset', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const preferences = await resetUserPreferences(userId);

    return {
      success: true,
      message: 'Preferences reset to defaults',
      preferences,
    };
  });

  /**
   * GET /api/grounding/agents/:agentId
   * Get overrides for a specific agent
   */
  app.get('/api/grounding/agents/:agentId', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { agentId } = request.params as { agentId: string };
    const overrides = await getAgentGroundingOverrides(userId, agentId);
    const effectiveConfig = await getEffectiveConfig(userId, agentId);

    return {
      agentId,
      hasOverrides: !!overrides,
      overrides: overrides ?? {},
      effectiveConfig: {
        agentResponseWords: effectiveConfig.agentResponseWords,
        responseStyle: effectiveConfig.responseStyle,
        formality: effectiveConfig.formality,
        memorySharing: effectiveConfig.memorySharing,
        customSystemPromptSuffix: effectiveConfig.customSystemPromptSuffix,
      },
    };
  });

  /**
   * PUT /api/grounding/agents/:agentId
   * Set overrides for a specific agent
   */
  app.put('/api/grounding/agents/:agentId', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { agentId } = request.params as { agentId: string };
    const parseResult = agentOverridesSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid overrides',
        details: parseResult.error.issues,
      });
    }

    const overrides = parseResult.data;

    // Convert null to undefined (null means "remove override")
    const cleanedOverrides = {
      agentId,
      userId,
      wordLimit: overrides.wordLimit ?? undefined,
      responseStyle: overrides.responseStyle ?? undefined,
      formality: overrides.formality ?? undefined,
      memorySharing: overrides.memorySharing ?? undefined,
      customSystemPromptSuffix: overrides.customSystemPromptSuffix ?? undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Check if all overrides are being removed
    const hasAnyOverride = Object.values(cleanedOverrides).some(
      (v) => v !== undefined && v !== agentId && v !== userId && !(v instanceof Date)
    );

    if (!hasAnyOverride) {
      // Remove the override entirely
      await deleteAgentGroundingOverrides(userId, agentId);
      return {
        success: true,
        message: 'Agent overrides removed',
        agentId,
      };
    }

    const saved = await saveAgentGroundingOverrides(cleanedOverrides as any);

    return {
      success: true,
      agentId,
      overrides: saved,
    };
  });

  /**
   * DELETE /api/grounding/agents/:agentId
   * Remove all overrides for a specific agent
   */
  app.delete('/api/grounding/agents/:agentId', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { agentId } = request.params as { agentId: string };
    await deleteAgentGroundingOverrides(userId, agentId);

    return {
      success: true,
      message: 'Agent overrides removed',
      agentId,
    };
  });

  /**
   * GET /api/grounding/effective
   * Get the effective configuration for a user (optionally for a specific agent)
   * Useful for debugging what settings will actually be used
   */
  app.get('/api/grounding/effective', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user?.userId;
    const { agentId } = request.query as { agentId?: string };

    // Allow anonymous access for debugging (returns platform defaults)
    const config = await getEffectiveConfig(userId || null, agentId);

    return {
      effectiveConfig: config,
      guardrails: GUARDRAILS,
    };
  });
}
