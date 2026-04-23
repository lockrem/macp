// =============================================================================
// MACP Shared Types
// =============================================================================

// -----------------------------------------------------------------------------
// Agent Types
// -----------------------------------------------------------------------------

export interface Agent {
  id: string;                    // UUID assigned at creation
  ownerId: string;
  displayName: string;
  provider: AgentProvider;
  modelConfig: ModelConfig;
  capabilities: AgentCapability[];
  preferences: AgentPreferences;
  status: AgentStatus;
  createdAt: Date;
  lastActiveAt: Date;

  // Sharing settings (no separate publish step needed)
  isShareable?: boolean;         // Can others interact with this agent via QR/link?
  shareSettings?: AgentShareSettings;
}

export interface AgentShareSettings {
  allowDirectChat: boolean;      // Visitors can chat directly with agent
  allowAgentToAgent: boolean;    // Visitor's agent can talk to this agent
  allowAccompanied: boolean;     // Visitor + their agent can interact together
  greeting?: string;             // Custom greeting for public visitors
  viewCount?: number;            // Analytics
}

export type AgentProvider = 'anthropic' | 'openai' | 'gemini' | 'groq' | 'google' | 'custom';

export interface ModelConfig {
  modelId: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
}

export interface AgentCapability {
  domain: string;
  expertiseLevel: number; // 0.0 - 1.0
  languages: string[];
  specializations: string[];
}

export interface AgentPreferences {
  communicationStyle: 'formal' | 'casual' | 'technical';
  verbosity: 'concise' | 'balanced' | 'detailed';
  proactivity: 'passive' | 'balanced' | 'proactive';
}

export type AgentStatus = 'online' | 'busy' | 'away' | 'offline';

// -----------------------------------------------------------------------------
// Conversation Types
// -----------------------------------------------------------------------------

export interface Conversation {
  id: string;
  title?: string;
  mode: ConversationMode;
  topology: ConversationTopology;
  participants: Participant[];
  state: ConversationState;
  config: ConversationConfig;
  context: ConversationContext;
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationMode = 'rapid' | 'campfire' | 'moderated' | 'async';

export type ConversationTopology =
  | 'linear'
  | 'branching'
  | 'parallel'
  | 'hierarchical'
  | 'mesh';

export interface Participant {
  agentId: string;
  role: ParticipantRole;
  joinedAt: Date;
  stats: ParticipantStats;
}

export type ParticipantRole =
  | 'active'
  | 'observer'
  | 'consultant'
  | 'moderator'
  | 'human';

export interface ParticipantStats {
  turnsTaken: number;
  tokensUsed: number;
  avgBidScore: number;
  lastSpokeAt?: Date;
}

export interface ConversationState {
  status: 'active' | 'paused' | 'completed' | 'archived';
  currentTurn: number;
  currentSpeaker?: string;
}

export interface ConversationConfig {
  maxTurns?: number;
  maxDurationMs?: number;
  bidTimeoutMs: number;
  responseTimeoutMs: number;
  minParticipants: number;
  maxParticipants: number;
  requireHumanApproval: boolean;
  autoSummarizeInterval: number;
}

export interface ConversationContext {
  topic?: string;
  goals: string[];
  constraints: string[];
  tokenBudget: TokenBudget;
}

export interface TokenBudget {
  totalLimit: number;
  totalUsed: number;
  perAgentLimit: number;
  perAgentUsed: Record<string, number>;
}

// -----------------------------------------------------------------------------
// Message Types
// -----------------------------------------------------------------------------

export interface Message {
  id: string;
  conversationId: string;
  turnNumber: number;
  sender: MessageSender;
  type: MessageType;
  content: MessageContent;
  metadata: MessageMetadata;
  routing: MessageRouting;
  timestamp: Date;
}

export interface MessageSender {
  agentId: string;
  isHuman: boolean;
}

export type MessageType =
  | 'turn_response'
  | 'bid_submission'
  | 'system_announcement'
  | 'human_interjection'
  | 'vote_cast'
  | 'proposal'
  | 'tool_result'
  | 'status_update'
  | 'escalation'
  | 'context_update';

export interface MessageContent {
  text: string;
  format: 'text' | 'markdown' | 'json';
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  type: 'image' | 'document' | 'code' | 'audio';
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MessageMetadata {
  confidence?: number;
  tokensUsed: number;
  latencyMs: number;
  modelUsed?: string;
  citations?: Citation[];
}

export interface Citation {
  turnId: string;
  quote?: string;
  relevance?: string;
}

export interface MessageRouting {
  replyTo?: string;
  visibility: 'all' | 'subset' | 'private';
  visibleTo?: string[];
  suggestedNext?: string;
  branchId?: string;
}

// -----------------------------------------------------------------------------
// Bidding Types
// -----------------------------------------------------------------------------

export interface Bid {
  id: string;
  conversationId: string;
  turnNumber: number;
  agentId: string;
  scores: BidScores;
  decision: BidDecision;
  submittedAt: Date;
}

export interface BidScores {
  relevance: number; // 0-1
  confidence: number; // 0-1
  novelty: number; // 0-1
  urgency: number; // 0-1
}

export interface BidDecision {
  action: 'bid' | 'pass' | 'defer';
  deferTo?: string;
  reason?: string;
}

export interface BidResult {
  winner: string;
  finalScores: Record<string, number>;
  tieBreakerUsed?: string;
  fairnessAdjustments: Record<string, number>;
}

// -----------------------------------------------------------------------------
// BTS (Behind The Scenes) Protocol Types
// -----------------------------------------------------------------------------

export interface BTSMessage {
  id: string;
  cid: string; // Conversation ID
  t: number; // Turn number
  a: string; // Agent ID
  type: BTSMessageType;
  p: BTSPayload;
  ts: number; // Unix timestamp ms
}

export type BTSMessageType = 'req' | 'res' | 'bid' | 'ctx' | 'end' | 'err';

export interface BTSPayload {
  ctx?: CompactContext;
  deadline?: number;
  content?: string;
  meta?: ResponseMeta;
  scores?: BidScores;
  action?: 'bid' | 'pass' | 'defer';
  code?: string;
  msg?: string;
  granted?: boolean;
}

export interface CompactContext {
  conversationId: string;
  currentTurn: number;
  sum: string; // Rolling summary
  last: TurnRef[];
  topic: string;
  goal: string;
  participants: string[];
}

export interface TurnRef {
  t: number;
  a: string;
  key: string;
}

export interface ResponseMeta {
  tokens: { in: number; out: number };
  model: string;
  latency: number;
  confidence?: number;
}

// -----------------------------------------------------------------------------
// API Types
// -----------------------------------------------------------------------------

export interface CreateConversationRequest {
  title?: string;
  mode: ConversationMode;
  topology?: ConversationTopology;
  participantIds: string[];
  config?: Partial<ConversationConfig>;
  context?: Partial<ConversationContext>;
}

export interface CreateAgentRequest {
  displayName: string;
  provider: AgentProvider;
  modelConfig: ModelConfig;
  capabilities?: AgentCapability[];
  preferences?: Partial<AgentPreferences>;
}

export interface JoinConversationRequest {
  agentId: string;
  role?: ParticipantRole;
}

// -----------------------------------------------------------------------------
// Event Types
// -----------------------------------------------------------------------------

export interface ConversationEvent {
  type: ConversationEventType;
  conversationId: string;
  timestamp: Date;
  payload: unknown;
}

export type ConversationEventType =
  | 'conversation.created'
  | 'conversation.started'
  | 'conversation.paused'
  | 'conversation.resumed'
  | 'conversation.completed'
  | 'participant.joined'
  | 'participant.left'
  | 'turn.started'
  | 'turn.completed'
  | 'message.sent'
  | 'bid.submitted'
  | 'bid.evaluated';

// -----------------------------------------------------------------------------
// Error Types
// -----------------------------------------------------------------------------

export class MACPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MACPError';
  }
}

export class TimeoutError extends MACPError {
  constructor(operation: string, timeoutMs: number) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      'TIMEOUT',
      408
    );
  }
}

export class CircuitOpenError extends MACPError {
  constructor(agentId: string) {
    super(
      `Circuit breaker open for agent '${agentId}'`,
      'CIRCUIT_OPEN',
      503
    );
  }
}

export class BudgetExceededError extends MACPError {
  constructor(budgetType: 'conversation' | 'agent', limit: number, used: number) {
    super(
      `${budgetType} token budget exceeded: ${used}/${limit}`,
      'BUDGET_EXCEEDED',
      429
    );
  }
}

// -----------------------------------------------------------------------------
// Memory Types - Dynamic Category-Based Agent Memory
// -----------------------------------------------------------------------------

/**
 * Index file that tracks all memory categories for a user
 * Stored at: memories/{userId}/_index.json
 */
export interface MemoryIndex {
  userId: string;
  categories: MemoryCategoryMeta[];
  totalFacts: number;
  lastUpdated: string; // ISO timestamp
}

/**
 * Metadata about a memory category (stored in index)
 */
export interface MemoryCategoryMeta {
  name: string;           // e.g., "health", "employment", "exercise"
  displayName: string;    // e.g., "Health & Medical"
  factCount: number;
  lastUpdated: string;    // ISO timestamp
}

/**
 * A complete memory category file
 * Stored at: memories/{userId}/{category}.json
 */
export interface MemoryCategory {
  category: string;
  displayName: string;
  userId: string;
  lastUpdated: string;

  /**
   * Natural language summary of this category, optimized for prompt injection.
   * Regenerated whenever facts change.
   * Example: "User has Type 2 Diabetes and Hypertension. Takes Lisinopril 10mg daily..."
   */
  summary: string;

  /**
   * Structured facts in this category
   */
  facts: MemoryFact[];
}

/**
 * A single fact learned about the user
 */
export interface MemoryFact {
  id: string;

  /**
   * Key identifying what this fact is about
   * e.g., "medications", "conditions", "weight", "employer"
   */
  key: string;

  /**
   * The actual value - can be string, number, array, or object
   */
  value: string | number | string[] | Record<string, unknown>;

  /**
   * How confident we are in this fact
   */
  confidence: 'high' | 'medium' | 'low';

  /**
   * Where this fact was learned from
   */
  learnedFrom: string;  // conversation ID

  /**
   * When this fact was learned
   */
  learnedAt: string;    // ISO timestamp

  /**
   * If this fact updates a previous fact, reference the old fact ID
   */
  supersedes?: string;
}

/**
 * Request to extract facts from a conversation
 */
export interface FactExtractionRequest {
  conversationId: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

/**
 * Result of fact extraction - facts organized by category
 */
export interface FactExtractionResult {
  conversationId: string;
  extractedAt: string;
  factsByCategory: Record<string, ExtractedFact[]>;
}

/**
 * A fact as extracted by the LLM (before being stored)
 */
export interface ExtractedFact {
  category: string;
  categoryDisplayName: string;
  key: string;
  value: string | number | string[] | Record<string, unknown>;
  confidence: 'high' | 'medium' | 'low';
}

// -----------------------------------------------------------------------------
// Questionnaire Types - Structured Q&A Mode
// -----------------------------------------------------------------------------

/**
 * A questionnaire template created by a business
 */
export interface QuestionnaireTemplate {
  id: string;
  name: string;
  description: string;
  ownerId: string;

  /**
   * Categories of memory the respondent's agent should have access to
   * e.g., ["health", "personal"] for a health insurance intake
   */
  requiredMemoryCategories: string[];

  questions: QuestionnaireQuestion[];
  createdAt: string;
  updatedAt: string;
}

/**
 * A question in a questionnaire
 */
export interface QuestionnaireQuestion {
  id: string;
  text: string;
  category: string;
  required: boolean;

  /**
   * Expected data type for validation/parsing
   */
  dataType?: 'text' | 'date' | 'number' | 'yes_no' | 'list';

  /**
   * Conditional follow-up questions
   */
  followUp?: {
    condition: string;  // e.g., "answer === 'yes'"
    questions: QuestionnaireQuestion[];
  };
}

/**
 * Structured response from a completed questionnaire
 */
export interface QuestionnaireResponse {
  templateId: string;
  templateName: string;
  conversationId: string;
  archiveId?: string;

  respondentUserId: string;
  respondentAgentId: string;

  answers: QuestionnaireAnswer[];

  completionRate: number;  // 0.0 - 1.0
  unansweredQuestions: string[];  // question IDs

  completedAt: string;
}

/**
 * An answer to a questionnaire question
 */
export interface QuestionnaireAnswer {
  questionId: string;
  questionText: string;
  answer: string;

  /**
   * How confident the agent was in this answer
   */
  confidence: 'high' | 'medium' | 'low' | 'unknown';

  /**
   * Where the answer came from
   */
  source: 'memory' | 'inferred' | 'declined';

  /**
   * Which memory category provided this answer (if from memory)
   */
  memoryCategory?: string;
}

// -----------------------------------------------------------------------------
// Memory Cache - Fast Fact Lookup
// -----------------------------------------------------------------------------

/**
 * Fast lookup cache for memory facts
 * Stored at: memories/{userId}/_cache.json
 * Regenerated whenever facts change
 */
export interface MemoryCache {
  userId: string;
  version: number;
  generatedAt: string;

  /**
   * Fast lookup: fact key → location and metadata
   * Enables O(1) "do we know X?" queries
   */
  factIndex: Record<string, FactIndexEntry>;

  /**
   * Semantic groupings for natural language queries
   * e.g., "medical" → ["medications", "conditions", "allergies"]
   */
  semanticTags: Record<string, string[]>;

  /**
   * List of available category names
   */
  availableCategories: string[];

  /**
   * One-line summary of what's known about the user
   */
  quickSummary: string;

  /**
   * Total number of facts across all categories
   */
  totalFacts: number;
}

/**
 * Entry in the fact index cache
 */
export interface FactIndexEntry {
  /**
   * Which category file contains this fact
   */
  category: string;

  /**
   * Confidence level of this fact
   */
  confidence: 'high' | 'medium' | 'low';

  /**
   * When this fact was last updated
   */
  updatedAt: string;

  /**
   * Brief description of the value type (for pre-flight checks)
   */
  valueType: 'string' | 'number' | 'array' | 'object';

  /**
   * Optional preview of the value (truncated for arrays/objects)
   */
  preview?: string;
}

/**
 * Semantic tag definitions for common query patterns
 */
export const DEFAULT_SEMANTIC_TAGS: Record<string, string[]> = {
  // Medical/Health
  'medical': ['medications', 'conditions', 'allergies', 'doctors', 'diagnoses', 'symptoms', 'treatments'],
  'medications': ['medications', 'prescriptions', 'drugs', 'dosages'],
  'conditions': ['conditions', 'diagnoses', 'diseases', 'disorders'],

  // Physical/Fitness
  'physical': ['weight', 'height', 'bmi', 'blood_pressure', 'heart_rate'],
  'fitness': ['exercise_routine', 'workouts', 'sports', 'activity_level', 'steps'],
  'vitals': ['weight', 'height', 'blood_pressure', 'heart_rate', 'temperature'],

  // Personal
  'demographics': ['age', 'birthday', 'gender', 'address', 'location', 'city', 'state'],
  'family': ['spouse', 'children', 'parents', 'siblings', 'dependents', 'marital_status'],
  'contact': ['phone', 'email', 'address', 'emergency_contact'],

  // Work/Employment
  'employment': ['employer', 'job_title', 'salary', 'work_history', 'occupation'],
  'income': ['salary', 'income', 'wages', 'earnings'],

  // Financial
  'financial': ['income', 'savings', 'debts', 'investments', 'insurance'],
  'insurance': ['health_insurance', 'life_insurance', 'auto_insurance', 'insurance_provider'],
};

/**
 * Request to check what facts are available for a set of questions
 */
export interface FactAvailabilityRequest {
  /**
   * List of fact keys or semantic tags to check
   */
  queries: string[];
}

/**
 * Response indicating which facts are available
 */
export interface FactAvailabilityResponse {
  /**
   * Map of query → availability info
   */
  availability: Record<string, {
    available: boolean;
    category?: string;
    confidence?: 'high' | 'medium' | 'low';
    preview?: string;
  }>;

  /**
   * Categories that would need to be loaded
   */
  categoriesToLoad: string[];

  /**
   * Queries that cannot be answered from memory
   */
  unavailable: string[];
}

// -----------------------------------------------------------------------------
// Rules Types - Per-Agent User Preferences & Instructions
// -----------------------------------------------------------------------------

/**
 * A single rule/preference for an agent
 * Rules are explicit instructions from the user that modify agent behavior
 */
export interface AgentRule {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * All rules for a specific agent
 * Stored at: rules/{userId}/{agentId}.json
 */
export interface AgentRules {
  userId: string;
  agentId: string;
  agentName: string;
  rules: AgentRule[];
  lastUpdated: string;
}

/**
 * Index file tracking all agents with rules for a user
 * Stored at: rules/{userId}/_index.json
 */
export interface RulesIndex {
  userId: string;
  agents: AgentRulesMeta[];
  totalRules: number;
  lastUpdated: string;
}

/**
 * Metadata about an agent's rules (stored in index)
 */
export interface AgentRulesMeta {
  agentId: string;
  agentName: string;
  ruleCount: number;
  lastUpdated: string;
}

// -----------------------------------------------------------------------------
// Public Agent Types - Shareable Agent URLs
// -----------------------------------------------------------------------------

/**
 * A published agent that can be accessed via a public URL
 * Stored at: public-agents/{agentId}.json
 */
export interface PublishedAgent {
  agentId: string;                  // Primary key - the agent's UUID
  ownerId: string;
  ownerName?: string;
  recordType?: 'agent' | 'form';    // 'agent' (default) or 'form' for smart forms

  // Agent config snapshot
  name: string;
  emoji: string;
  description: string;
  personality: string;
  greeting: string;
  accentColor: string;
  introductionGreeting: string;
  introductionQuestions: PublicIntroductionQuestion[];

  // Voice configuration for TTS
  voiceId?: string;                 // ElevenLabs voice ID (e.g., "ErXwobaYiN019PkySvjV" for Antoni)
  voiceSpeed?: number;              // Speech speed 0.75-1.25 (default: 1.0)

  // Sharing settings
  isActive: boolean;
  allowDirectChat: boolean;         // Anonymous user talks directly
  allowAgentToAgent: boolean;       // Visitor's agent talks to this agent
  allowAccompaniedChat: boolean;    // User + their agent interact together

  // Metadata
  createdAt: string;
  updatedAt: string;
  viewCount: number;
}

/**
 * Introduction question for public agents
 */
export interface PublicIntroductionQuestion {
  id: string;
  question: string;
  followUp?: string;
  extractsMemory: string[];
  extractsRules: boolean;
}

/**
 * Index file tracking a user's published agents
 * Stored at: public-agents/_index/{userId}.json
 */
export interface PublishedAgentsIndex {
  userId: string;
  agents: PublishedAgentMeta[];
  totalPublished: number;
  lastUpdated: string;
}

/**
 * Metadata about a published agent (stored in user's index)
 */
export interface PublishedAgentMeta {
  agentId: string;                  // Primary key
  name: string;
  emoji: string;
  isActive: boolean;
  viewCount: number;
  sessionCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Interaction mode for public agent sessions
 */
export type PublicAgentInteractionMode = 'direct' | 'agent_to_agent' | 'accompanied';

/**
 * A session between a visitor and a public agent
 * Stored at: public-sessions/{sessionId}.json
 */
export interface PublicAgentSession {
  sessionId: string;
  agentId: string;                  // The public agent's ID
  mode: PublicAgentInteractionMode;

  // Visitor info
  visitorId: string;              // Anonymous device ID
  visitorUserId?: string;         // If signed in
  visitorAgentId?: string;        // For agent-to-agent/accompanied modes
  visitorAgentName?: string;

  // Conversation
  messages: PublicSessionMessage[];

  // Auto-extracted data from conversation
  extractedData: ExtractedSessionData;

  // Status
  status: 'active' | 'completed' | 'abandoned';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/**
 * A message in a public agent session
 */
export interface PublicSessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'visitor_agent' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    tokensUsed?: number;
    latencyMs?: number;
  };
}

/**
 * Automatic extraction from conversation content
 */
export interface ExtractedSessionData {
  preferences: Record<string, string>;  // e.g., { "dietary": "vegetarian", "communication": "email" }
  memories: string[];                    // Key facts about the visitor
  summary: string;                       // Brief summary of the conversation
  completedTopics: string[];             // Topics discussed/resolved
}

/**
 * Request to publish an agent
 */
export interface PublishAgentRequest {
  allowDirectChat: boolean;
  allowAgentToAgent: boolean;
  allowAccompaniedChat: boolean;
  introductionGreeting?: string;
  introductionQuestions?: PublicIntroductionQuestion[];
}

/**
 * Request to create a public session
 */
export interface CreatePublicSessionRequest {
  mode: PublicAgentInteractionMode;
  visitorId: string;
  visitorUserId?: string;
  visitorAgentId?: string;
  visitorAgentName?: string;
}

/**
 * Request to send a message in a public session
 */
export interface PublicSessionMessageRequest {
  sessionId: string;
  content: string;
  role?: 'user' | 'visitor_agent';  // Who's sending: the user directly or their agent
}

// -----------------------------------------------------------------------------
// Marketplace Types - Agent Discovery & Subscriptions
// -----------------------------------------------------------------------------

/**
 * A marketplace listing for an agent
 * Extends PublishedAgent with marketplace-specific fields
 */
export interface MarketplaceAgent {
  // Core identification
  agentId: string;

  // Creator info
  creatorId: string;             // "macp" for MACP Originals
  creatorName: string;           // "MACP Team" or creator's display name
  creatorVerified: boolean;      // true for verified creators
  creatorAvatarUrl?: string;

  // Agent config (from PublishedAgent)
  name: string;
  emoji: string;
  description: string;
  personality: string;
  greeting: string;
  accentColor: string;
  introductionGreeting?: string;
  introductionQuestions?: PublicIntroductionQuestion[];

  // Marketplace categorization
  category: MarketplaceCategory;
  subcategory?: string;
  tags: string[];

  // Pricing
  pricing: AgentPricing;

  // Engagement metrics
  subscriberCount: number;
  sessionCount: number;
  rating: number;                // 0-5 stars
  reviewCount: number;

  // Visibility
  featured: boolean;             // Highlighted in marketplace
  isActive: boolean;
  isMACPOriginal: boolean;       // true for MACP-hosted agents

  // Timestamps
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
}

/**
 * Marketplace categories
 */
export type MarketplaceCategory =
  | 'health'
  | 'fitness'
  | 'productivity'
  | 'finance'
  | 'education'
  | 'wellness'
  | 'lifestyle'
  | 'professional'
  | 'entertainment'
  | 'companion';

/**
 * Category metadata for display
 */
export interface MarketplaceCategoryInfo {
  id: MarketplaceCategory;
  name: string;
  emoji: string;
  description: string;
  agentCount: number;
}

/**
 * Pricing configuration for marketplace agents
 */
export interface AgentPricing {
  type: 'free' | 'subscription' | 'per_session' | 'freemium';
  price?: number;                // In cents (e.g., 999 = $9.99)
  currency?: string;             // ISO currency code, default USD
  trialDays?: number;            // Free trial period
  freeSessionsPerMonth?: number; // For freemium model
}

/**
 * Creator profile for the marketplace
 */
export interface AgentCreator {
  creatorId: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  verified: boolean;
  verificationBadges: VerificationBadge[];

  // Stats
  agentCount: number;
  totalSubscribers: number;
  averageRating: number;

  // Links
  websiteUrl?: string;
  socialLinks?: Record<string, string>;

  createdAt: string;
}

/**
 * Verification badges for creators
 */
export type VerificationBadge =
  | 'macp_official'       // MACP team
  | 'identity_verified'   // Identity confirmed
  | 'professional'        // Professional credentials
  | 'top_creator'         // High engagement/ratings
  | 'early_adopter';      // Early platform adopter

/**
 * User's subscription to a marketplace agent
 */
export interface AgentSubscription {
  subscriptionId: string;
  userId: string;
  agentId: string;

  // Status
  status: 'active' | 'cancelled' | 'expired' | 'trial';

  // Pricing at time of subscription
  pricingType: AgentPricing['type'];
  priceAtSubscription?: number;

  // Usage
  sessionsUsed: number;
  sessionsLimit?: number;        // For per-session or freemium

  // Dates
  subscribedAt: string;
  expiresAt?: string;
  cancelledAt?: string;
  trialEndsAt?: string;
}

/**
 * Review for a marketplace agent
 */
export interface AgentReview {
  reviewId: string;
  agentId: string;
  userId: string;
  userDisplayName: string;

  rating: number;                // 1-5 stars
  title?: string;
  content: string;

  // Engagement
  helpfulCount: number;

  // Moderation
  status: 'published' | 'pending' | 'removed';

  createdAt: string;
  updatedAt: string;
}

/**
 * Request to list marketplace agents
 */
export interface ListMarketplaceAgentsRequest {
  category?: MarketplaceCategory;
  subcategory?: string;
  tags?: string[];
  search?: string;
  featured?: boolean;
  isMACPOriginal?: boolean;
  sortBy?: 'popular' | 'rating' | 'newest' | 'name';
  limit?: number;
  offset?: number;
}

/**
 * Response for marketplace listing
 */
export interface ListMarketplaceAgentsResponse {
  agents: MarketplaceAgent[];
  total: number;
  limit: number;
  offset: number;
  categories: MarketplaceCategoryInfo[];
}

/**
 * Request to subscribe to an agent
 */
export interface SubscribeToAgentRequest {
  agentId: string;
  paymentMethodId?: string;      // For paid agents
}

/**
 * MACP Originals template IDs
 */
export const MACP_ORIGINAL_IDS = [
  'health_buddy',
  'fitness_coach',
  'work_assistant',
  'money_mentor',
  'journal_pal',
  'study_buddy',
] as const;

export type MACPOriginalId = typeof MACP_ORIGINAL_IDS[number];
