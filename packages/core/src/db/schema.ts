import { pgTable, text, timestamp, jsonb, boolean, integer, pgEnum } from 'drizzle-orm/pg-core';

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

export const conversationStatusEnum = pgEnum('conversation_status', [
  'pending',    // Waiting for participants to join
  'active',     // Conversation in progress
  'paused',     // Temporarily paused
  'completed',  // Finished naturally
  'cancelled',  // Cancelled by user
]);

export const messageTypeEnum = pgEnum('message_type', [
  'agent_response',  // Normal agent message
  'system',          // System notification
  'bid_result',      // Bidding outcome (BTS mode)
  'summary',         // Context summary
]);

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending',     // Not yet delivered
  'delivered',   // Delivered via WebSocket
  'pushed',      // Delivered via push notification
  'read',        // Confirmed read by user
]);

// -----------------------------------------------------------------------------
// Users
// -----------------------------------------------------------------------------

export const users = pgTable('users', {
  id: text('id').primaryKey(), // Cognito sub or ULID
  email: text('email').unique(),
  appleId: text('apple_id').unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),

  // Push notification tokens
  apnsToken: text('apns_token'),         // iOS push token
  apnsTokenUpdatedAt: timestamp('apns_token_updated_at'),

  // Preferences
  preferences: jsonb('preferences').$type<UserPreferences>(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastActiveAt: timestamp('last_active_at'),
});

export interface UserPreferences {
  notificationsEnabled: boolean;
  defaultAgentId?: string;
  theme?: 'light' | 'dark' | 'system';
}

// -----------------------------------------------------------------------------
// Agents (User-owned AI configurations)
// -----------------------------------------------------------------------------

export const agents = pgTable('agents', {
  id: text('id').primaryKey(), // ULID
  ownerId: text('owner_id').references(() => users.id).notNull(),

  // Identity
  displayName: text('display_name').notNull(),
  personality: text('personality'), // User-defined personality description
  systemPrompt: text('system_prompt'), // Custom system prompt
  avatarUrl: text('avatar_url'),

  // Model configuration
  provider: text('provider').notNull().default('anthropic'), // anthropic, openai
  modelId: text('model_id').notNull(),
  temperature: integer('temperature').default(70), // 0-100, divided by 100
  maxTokens: integer('max_tokens').default(1000),

  // Capabilities/expertise
  capabilities: jsonb('capabilities').$type<AgentCapability[]>(),

  // Status
  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export interface AgentCapability {
  domain: string;
  expertiseLevel: number; // 0-1
  description?: string;
}

// -----------------------------------------------------------------------------
// Conversations
// -----------------------------------------------------------------------------

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(), // ULID

  // Conversation setup
  topic: text('topic').notNull(),
  goal: text('goal'),
  initiatorId: text('initiator_id').references(() => users.id).notNull(),

  // Mode
  mode: text('mode').notNull().default('campfire'), // 'bts' or 'campfire'
  maxTurns: integer('max_turns').default(20),

  // State
  status: conversationStatusEnum('status').default('pending').notNull(),
  currentTurn: integer('current_turn').default(0).notNull(),
  currentSpeakerId: text('current_speaker_id'),

  // Context (rolling summary for BTS mode)
  contextSummary: text('context_summary'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
});

// -----------------------------------------------------------------------------
// Conversation Participants (which agents are in which conversations)
// -----------------------------------------------------------------------------

export const conversationParticipants = pgTable('conversation_participants', {
  id: text('id').primaryKey(), // ULID
  conversationId: text('conversation_id').references(() => conversations.id).notNull(),
  userId: text('user_id').references(() => users.id).notNull(),
  agentId: text('agent_id').references(() => agents.id).notNull(),

  // Participation stats
  turnsTaken: integer('turns_taken').default(0).notNull(),
  tokensUsed: integer('tokens_used').default(0).notNull(),

  // Status
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  leftAt: timestamp('left_at'),
  isActive: boolean('is_active').default(true).notNull(),
});

// -----------------------------------------------------------------------------
// Messages
// -----------------------------------------------------------------------------

export const messages = pgTable('messages', {
  id: text('id').primaryKey(), // ULID
  conversationId: text('conversation_id').references(() => conversations.id).notNull(),

  // Source
  agentId: text('agent_id').references(() => agents.id),
  participantId: text('participant_id').references(() => conversationParticipants.id),

  // Content
  type: messageTypeEnum('type').default('agent_response').notNull(),
  content: text('content').notNull(),
  turnNumber: integer('turn_number').notNull(),

  // Metadata
  metadata: jsonb('metadata').$type<MessageMetadata>(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export interface MessageMetadata {
  tokens?: { input: number; output: number };
  model?: string;
  latencyMs?: number;
  bidScores?: { relevance: number; confidence: number; novelty: number; urgency: number };
}

// -----------------------------------------------------------------------------
// Message Delivery (track delivery to each user)
// -----------------------------------------------------------------------------

export const messageDeliveries = pgTable('message_deliveries', {
  id: text('id').primaryKey(), // ULID
  messageId: text('message_id').references(() => messages.id).notNull(),
  userId: text('user_id').references(() => users.id).notNull(),

  // Delivery status
  status: deliveryStatusEnum('status').default('pending').notNull(),
  deliveredVia: text('delivered_via'), // 'websocket' or 'apns'

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deliveredAt: timestamp('delivered_at'),
  readAt: timestamp('read_at'),

  // Push notification tracking
  apnsId: text('apns_id'), // Apple push notification ID for tracking
});

// -----------------------------------------------------------------------------
// Invitations (for P2P conversation setup)
// -----------------------------------------------------------------------------

export const invitations = pgTable('invitations', {
  id: text('id').primaryKey(), // ULID
  conversationId: text('conversation_id').references(() => conversations.id).notNull(),

  // Inviter
  fromUserId: text('from_user_id').references(() => users.id).notNull(),

  // Invitee (one of these will be set)
  toUserId: text('to_user_id').references(() => users.id),
  toEmail: text('to_email'),

  // Invitation details
  message: text('message'),

  // Status
  status: text('status').notNull().default('pending'), // pending, accepted, declined, expired
  expiresAt: timestamp('expires_at'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  respondedAt: timestamp('responded_at'),
});
