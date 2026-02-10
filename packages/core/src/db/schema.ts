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

export const taskStatusEnum = pgEnum('task_status', [
  'pending',      // Not yet started
  'in_progress',  // Being worked on
  'waiting',      // Waiting for external input (e.g., response from contact's agent)
  'completed',    // Successfully completed
  'cancelled',    // Cancelled by user
  'failed',       // Could not be completed
]);

export const taskPriorityEnum = pgEnum('task_priority', [
  'low',
  'medium',
  'high',
  'urgent',
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

// -----------------------------------------------------------------------------
// Public Agents (Database-backed public agent storage)
// Must be defined before contact_agents due to foreign key reference
// -----------------------------------------------------------------------------

export const publicAgentRecordTypeEnum = pgEnum('public_agent_record_type', [
  'agent',
  'form',
]);

export const publicAgents = pgTable('public_agents', {
  agentId: text('agent_id').primaryKey(),
  ownerId: text('owner_id').references(() => users.id).notNull(),
  ownerName: text('owner_name'),

  // Record type - determines if this is a regular agent or a form agent
  recordType: text('record_type').default('agent').notNull(), // 'agent' | 'form'

  // Agent config
  name: text('name').notNull(),
  emoji: text('emoji').notNull(),
  description: text('description').notNull(),
  personality: text('personality').notNull(),
  greeting: text('greeting').notNull(),
  accentColor: text('accent_color').notNull(),
  introductionGreeting: text('introduction_greeting'),
  introductionQuestions: jsonb('introduction_questions').$type<PublicIntroductionQuestion[]>().default([]),

  // Voice configuration
  voiceId: text('voice_id'),
  voiceSpeed: integer('voice_speed'),

  // Sharing settings
  isActive: boolean('is_active').default(true).notNull(),
  allowDirectChat: boolean('allow_direct_chat').default(false).notNull(),
  allowAgentToAgent: boolean('allow_agent_to_agent').default(false).notNull(),
  allowAccompaniedChat: boolean('allow_accompanied_chat').default(false).notNull(),

  // Analytics
  viewCount: integer('view_count').default(0).notNull(),
  sessionCount: integer('session_count').default(0).notNull(),
  submissionCount: integer('submission_count').default(0).notNull(), // For form agents

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export interface PublicIntroductionQuestion {
  id: string;
  question: string;
  followUp?: string;
  extractsMemory: string[];
  extractsRules: boolean;
}

// -----------------------------------------------------------------------------
// Contacts (People you know and their relationships)
// -----------------------------------------------------------------------------

export const contacts = pgTable('contacts', {
  id: text('id').primaryKey(), // ULID
  userId: text('user_id').references(() => users.id).notNull(),

  // Identity
  name: text('name').notNull(),
  aliases: jsonb('aliases').$type<string[]>().default([]), // ["Janie", "Jane Smith"] for fuzzy matching

  // Relationship details
  relationship: text('relationship'), // "girlfriend", "mom", "coworker"
  relationshipStarted: timestamp('relationship_started'),
  birthday: text('birthday'), // "03-15" or "1990-03-15"

  // Contact info
  email: text('email'),
  phone: text('phone'),

  // Additional info
  notes: text('notes'),
  tags: jsonb('tags').$type<string[]>().default([]), // ["family", "close-friend"]

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// -----------------------------------------------------------------------------
// Contact Agents (External agents associated with contacts)
// -----------------------------------------------------------------------------

export const contactAgents = pgTable('contact_agents', {
  id: text('id').primaryKey(), // ULID
  contactId: text('contact_id').references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  publicAgentId: text('public_agent_id').references(() => publicAgents.agentId).notNull(),

  // Denormalized for display
  agentName: text('agent_name').notNull(),
  agentEmoji: text('agent_emoji'),

  // Role and discovery
  role: text('role'), // "assistant", "health", "finance"
  discoveredVia: text('discovered_via'), // "qr_code", "manual", "introduction"

  // Timestamps
  addedAt: timestamp('added_at').defaultNow().notNull(),
});

// -----------------------------------------------------------------------------
// Tasks (User tasks that can be linked to contacts for autonomous routing)
// -----------------------------------------------------------------------------

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(), // ULID
  userId: text('user_id').references(() => users.id).notNull(),

  // Task details
  title: text('title').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').default('pending').notNull(),
  priority: taskPriorityEnum('priority').default('medium').notNull(),

  // Contact linking (for autonomous routing)
  contactId: text('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  targetPersonName: text('target_person_name'), // Original name mentioned (for matching)

  // Agent assignment
  assignedAgentId: text('assigned_agent_id'), // Public agent working on this task
  assignedAgentName: text('assigned_agent_name'), // Denormalized for display

  // Source tracking
  source: text('source').notNull().default('manual'), // 'chat_detected', 'manual', 'recurring'
  sourceConversationId: text('source_conversation_id'),
  sourceMessageContent: text('source_message_content'), // The message that triggered this task

  // Resolution
  resolution: text('resolution'), // How the task was resolved
  resolvedAt: timestamp('resolved_at'),

  // Scheduling
  dueDate: timestamp('due_date'),
  reminderAt: timestamp('reminder_at'),

  // Metadata
  metadata: jsonb('metadata').$type<TaskMetadata>(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export interface TaskMetadata {
  detectedIntent?: string;           // What the AI thought the user wanted
  matchConfidence?: number;          // How confident we are about the contact match
  agentResponses?: Array<{           // Responses from agents working on the task
    agentId: string;
    agentName: string;
    response: string;
    timestamp: string;
  }>;
  routingAttempts?: number;          // How many times we tried to route this
  lastRoutingError?: string;         // Last error if routing failed
}

// -----------------------------------------------------------------------------
// User Memory Facts (replaces S3 memories/{userId}/{category}.json)
// -----------------------------------------------------------------------------

export const userMemoryFacts = pgTable('user_memory_facts', {
  id: text('id').primaryKey(), // ULID
  userId: text('user_id').references(() => users.id).notNull(),

  // Categorization
  category: text('category').notNull(), // 'identity', 'dietary', 'health', 'preferences', 'wishlist', 'financial', 'schedule', 'family', 'work', 'general'
  key: text('key').notNull(),           // e.g., 'birthday', 'shellfish_allergy', 'favorite_restaurant'

  // Value
  value: jsonb('value').$type<string | number | string[] | Record<string, unknown>>().notNull(),

  // Metadata
  confidence: text('confidence').default('high'),   // 'high', 'medium', 'low'
  learnedFrom: text('learned_from'),                 // e.g., 'conversation with Mario's Ristorante'
  learnedAt: timestamp('learned_at').notNull(),
  supersedes: text('supersedes'),                    // ID of fact this replaces

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// -----------------------------------------------------------------------------
// Forms (Smart Forms for doctors, lawyers, etc.)
// -----------------------------------------------------------------------------

export const formFieldTypeEnum = pgEnum('form_field_type', [
  'text',
  'multiline',
  'date',
  'email',
  'phone',
  'select',
]);

export const formSubmissionStatusEnum = pgEnum('form_submission_status', [
  'in_progress',
  'completed',
]);

export const formResponseSourceEnum = pgEnum('form_response_source', [
  'agent',
  'user',
]);

// Note: Forms are now stored as public_agents with recordType = 'form'
// The old 'forms' table is deprecated - use public_agents instead

export const formFields = pgTable('form_fields', {
  id: text('id').primaryKey(), // ULID
  agentId: text('agent_id').references(() => publicAgents.agentId, { onDelete: 'cascade' }).notNull(),

  // Field definition
  label: text('label').notNull(),
  fieldType: formFieldTypeEnum('field_type').notNull(),
  required: boolean('required').default(false).notNull(),
  placeholder: text('placeholder'),

  // For select fields
  options: jsonb('options').$type<string[]>(),

  // Display order
  displayOrder: integer('display_order').notNull(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const formSubmissions = pgTable('form_submissions', {
  id: text('id').primaryKey(), // ULID
  agentId: text('agent_id').references(() => publicAgents.agentId, { onDelete: 'cascade' }).notNull(),
  respondentUserId: text('respondent_user_id').references(() => users.id),

  // Respondent info (for display to form owner)
  respondentName: text('respondent_name'),
  respondentEmail: text('respondent_email'),

  // Status
  status: formSubmissionStatusEnum('status').default('in_progress').notNull(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  submittedAt: timestamp('submitted_at'),
});

export const formResponses = pgTable('form_responses', {
  id: text('id').primaryKey(), // ULID
  submissionId: text('submission_id').references(() => formSubmissions.id, { onDelete: 'cascade' }).notNull(),
  fieldId: text('field_id').references(() => formFields.id, { onDelete: 'cascade' }).notNull(),

  // Response
  value: text('value').notNull(),
  source: formResponseSourceEnum('source').notNull(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// -----------------------------------------------------------------------------
// User Grounding Preferences (Layer 3 of the tiered override system)
// Allows users to customize their AI agent behavior within platform guardrails
// -----------------------------------------------------------------------------

export const groundingPresetEnum = pgEnum('grounding_preset', [
  'efficient',       // Brief, to the point
  'balanced',        // Default experience
  'conversational',  // More natural dialogue
  'custom',          // Full control
]);

export const participationStyleEnum = pgEnum('participation_style', [
  'minimal',   // Agents speak only when necessary
  'balanced',  // Default participation
  'active',    // Agents engage proactively
]);

export const responseStyleEnum = pgEnum('response_style', [
  'concise',        // Very brief responses
  'conversational', // Natural dialogue
  'detailed',       // More thorough explanations
]);

export const formalityEnum = pgEnum('formality', [
  'casual',       // Informal, friendly
  'professional', // Business-appropriate
  'formal',       // Very formal language
]);

export const memorySharingEnum = pgEnum('memory_sharing', [
  'conservative', // Only share when directly relevant
  'balanced',     // Share appropriately
  'proactive',    // Actively share helpful context
]);

export const userGroundingPreferences = pgTable('user_grounding_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),

  // Preset selection
  preset: groundingPresetEnum('preset').default('balanced').notNull(),

  // Verbosity (bounded by guardrails: 3-100 words)
  agentResponseWords: integer('agent_response_words').default(15).notNull(),
  hostResponseWords: integer('host_response_words').default(20).notNull(),

  // Participation style
  participationStyle: participationStyleEnum('participation_style').default('balanced').notNull(),

  // Personality
  responseStyle: responseStyleEnum('response_style').default('conversational').notNull(),
  formality: formalityEnum('formality').default('professional').notNull(),

  // Memory behavior
  memorySharing: memorySharingEnum('memory_sharing').default('balanced').notNull(),

  // Advanced (power users only)
  customSystemPromptSuffix: text('custom_system_prompt_suffix'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// -----------------------------------------------------------------------------
// Agent Grounding Overrides (Layer 4 of the tiered override system)
// Allows per-agent customization that overrides user preferences
// -----------------------------------------------------------------------------

export const agentGroundingOverrides = pgTable('agent_grounding_overrides', {
  id: text('id').primaryKey(), // ULID
  agentId: text('agent_id').notNull(), // References user's local agent ID
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),

  // Override specific settings (null = use user preference)
  wordLimit: integer('word_limit'),
  responseStyle: responseStyleEnum('response_style'),
  formality: formalityEnum('formality'),
  memorySharing: memorySharingEnum('memory_sharing'),
  customSystemPromptSuffix: text('custom_system_prompt_suffix'),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
