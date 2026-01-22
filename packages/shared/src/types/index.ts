// =============================================================================
// MACP Shared Types
// =============================================================================

// -----------------------------------------------------------------------------
// Agent Types
// -----------------------------------------------------------------------------

export interface Agent {
  id: string;
  ownerId: string;
  displayName: string;
  provider: AgentProvider;
  modelConfig: ModelConfig;
  capabilities: AgentCapability[];
  preferences: AgentPreferences;
  status: AgentStatus;
  createdAt: Date;
  lastActiveAt: Date;
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
