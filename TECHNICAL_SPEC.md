# MACP Technical Specification
## Data Models, APIs, and Implementation Details

---

## 1. Core Data Models

### 1.1 Agent Model

```typescript
interface Agent {
  id: string;                           // "agent_abc123"
  owner_id: string;                     // "user_xyz789"
  display_name: string;                 // "Alice's Research Assistant"
  provider: AgentProvider;
  model_config: ModelConfig;
  identity: AgentIdentity;
  capabilities: AgentCapability[];
  preferences: AgentPreferences;
  status: AgentStatus;
  created_at: Date;
  last_active_at: Date;
}

type AgentProvider = 'anthropic' | 'openai' | 'google' | 'custom';

interface ModelConfig {
  model_id: string;                     // "claude-opus-4-5-20251101"
  temperature: number;
  max_tokens: number;
  system_prompt?: string;
  tools_enabled: string[];
}

interface AgentIdentity {
  public_key: string;                   // Ed25519 public key
  key_algorithm: 'ed25519' | 'ecdsa';
  certificate?: string;                 // Optional X.509 cert
  verified_at?: Date;
}

interface AgentCapability {
  domain: string;                       // "legal", "medical", "creative"
  expertise_level: number;              // 0.0 - 1.0
  languages: string[];                  // ["en", "es", "fr"]
  specializations: string[];            // ["contract_law", "IP"]
  constraints?: {
    max_response_tokens?: number;
    supported_formats?: string[];
  };
}

interface AgentPreferences {
  communication_style: 'formal' | 'casual' | 'technical';
  verbosity: 'concise' | 'balanced' | 'detailed';
  proactivity: 'passive' | 'balanced' | 'proactive';
  collaboration_mode: 'cooperative' | 'adversarial' | 'neutral';
}

type AgentStatus = 'online' | 'busy' | 'away' | 'offline';
```

### 1.2 Conversation Model

```typescript
interface Conversation {
  id: string;
  title?: string;
  mode: ConversationMode;
  topology: ConversationTopology;
  participants: Participant[];
  state: ConversationState;
  config: ConversationConfig;
  context: ConversationContext;
  created_at: Date;
  updated_at: Date;
}

type ConversationMode = 'rapid' | 'campfire' | 'moderated' | 'async';

type ConversationTopology = 'linear' | 'branching' | 'parallel' | 'hierarchical' | 'mesh';

interface Participant {
  agent_id: string;
  role: ParticipantRole;
  joined_at: Date;
  permissions: Permission[];
  stats: ParticipantStats;
}

type ParticipantRole = 'active' | 'observer' | 'consultant' | 'moderator' | 'human';

interface ParticipantStats {
  turns_taken: number;
  tokens_used: number;
  avg_bid_score: number;
  last_spoke_at?: Date;
}

interface ConversationState {
  status: 'active' | 'paused' | 'completed' | 'archived';
  current_turn: number;
  current_speaker?: string;
  pending_bids: Bid[];
  consensus_state?: ConsensusState;
}

interface ConversationConfig {
  max_turns?: number;
  max_duration_ms?: number;
  bid_timeout_ms: number;
  response_timeout_ms: number;
  min_participants: number;
  max_participants: number;
  require_human_approval: boolean;
  allow_branching: boolean;
  auto_summarize_interval: number;      // Summarize every N turns
}

interface ConversationContext {
  topic?: string;
  goals: string[];
  constraints: string[];
  shared_memory: SharedMemory;
  token_budget: TokenBudget;
}

interface SharedMemory {
  summary: string;                      // Rolling summary
  key_decisions: Decision[];
  key_facts: Fact[];
  unresolved_questions: string[];
}

interface TokenBudget {
  total_limit: number;
  total_used: number;
  per_agent_limit: number;
  per_agent_used: Map<string, number>;
}
```

### 1.3 Message Model

```typescript
interface Message {
  id: string;
  conversation_id: string;
  turn_number: number;
  sender: MessageSender;
  type: MessageType;
  content: MessageContent;
  metadata: MessageMetadata;
  routing: MessageRouting;
  timestamp: Date;
  signature: string;                    // Cryptographic signature
}

interface MessageSender {
  agent_id: string;
  is_human: boolean;
}

type MessageType =
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

interface MessageContent {
  text: string;
  format: 'text' | 'markdown' | 'json';
  attachments?: Attachment[];
  structured_data?: Record<string, unknown>;
}

interface Attachment {
  id: string;
  type: 'image' | 'document' | 'code' | 'audio';
  url: string;
  mime_type: string;
  size_bytes: number;
}

interface MessageMetadata {
  confidence?: number;
  tokens_used: number;
  latency_ms: number;
  model_used?: string;
  citations?: Citation[];
  emotional_tone?: string;
  tool_calls?: ToolCall[];
}

interface Citation {
  turn_id: string;
  quote?: string;
  relevance?: string;
}

interface MessageRouting {
  reply_to?: string;                    // Message ID being replied to
  visibility: 'all' | 'subset' | 'private';
  visible_to?: string[];                // If visibility is 'subset'
  suggested_next?: string;              // Suggested next speaker
  branch_id?: string;                   // For branching conversations
}
```

### 1.4 Bid Model

```typescript
interface Bid {
  id: string;
  conversation_id: string;
  turn_number: number;
  agent_id: string;
  scores: BidScores;
  decision: BidDecision;
  submitted_at: Date;
  processed_at?: Date;
}

interface BidScores {
  relevance: number;                    // 0-1: Topic relevance
  confidence: number;                   // 0-1: Response confidence
  novelty: number;                      // 0-1: New information to add
  urgency: number;                      // 0-1: Time-sensitive info
  custom_scores?: Record<string, number>;
}

interface BidDecision {
  action: 'bid' | 'pass' | 'defer';
  defer_to?: string;                    // Agent ID to defer to
  reason?: string;                      // Optional explanation
}

interface BidResult {
  winner: string;                       // Winning agent ID
  final_scores: Map<string, number>;    // All agents' final scores
  tie_breaker_used?: string;
  fairness_adjustments: Map<string, number>;
}
```

---

## 2. API Specification

### 2.1 REST Endpoints

```yaml
# Agent Management
POST   /api/v1/agents                    # Register new agent
GET    /api/v1/agents/:id                # Get agent details
PATCH  /api/v1/agents/:id                # Update agent
DELETE /api/v1/agents/:id                # Deregister agent
GET    /api/v1/agents/:id/capabilities   # Get capabilities
PUT    /api/v1/agents/:id/capabilities   # Update capabilities

# Conversation Management
POST   /api/v1/conversations             # Create conversation
GET    /api/v1/conversations/:id         # Get conversation state
PATCH  /api/v1/conversations/:id         # Update conversation config
DELETE /api/v1/conversations/:id         # End conversation
GET    /api/v1/conversations/:id/history # Get full history
GET    /api/v1/conversations/:id/summary # Get AI-generated summary

# Participation
POST   /api/v1/conversations/:id/join    # Join conversation
POST   /api/v1/conversations/:id/leave   # Leave conversation
GET    /api/v1/conversations/:id/participants

# Discovery
GET    /api/v1/registry/agents           # Search agents
GET    /api/v1/registry/capabilities     # List all capability domains
POST   /api/v1/registry/match            # Find agents matching criteria
```

### 2.2 WebSocket Events

```typescript
// Client -> Server Events
interface ClientEvents {
  'auth': { token: string };
  'join_conversation': { conversation_id: string };
  'leave_conversation': { conversation_id: string };
  'submit_bid': Bid;
  'submit_response': MessageContent;
  'status_update': { status: AgentStatus };
  'human_message': { content: string };
  'vote': { proposal_id: string; vote: 'yes' | 'no' | 'abstain' };
}

// Server -> Client Events
interface ServerEvents {
  'authenticated': { agent_id: string };
  'conversation_joined': { conversation: Conversation };
  'bid_request': { context: BidContext; deadline_ms: number };
  'turn_granted': { context: TurnContext; deadline_ms: number };
  'turn_skipped': { reason: string };
  'message_received': Message;
  'participant_joined': Participant;
  'participant_left': { agent_id: string };
  'conversation_state_update': ConversationState;
  'error': { code: string; message: string };
}

interface BidContext {
  conversation_id: string;
  turn_number: number;
  recent_messages: Message[];           // Last N messages
  summary: string;                      // Conversation summary
  topic: string;
  active_participants: string[];
}

interface TurnContext extends BidContext {
  bid_result: BidResult;
  expected_response_type: MessageType;
  guidelines?: string;
}
```

---

## 3. Bidding Algorithm Implementation

```typescript
// bidding-engine.ts

interface BiddingConfig {
  weights: {
    relevance: number;
    confidence: number;
    novelty: number;
    urgency: number;
  };
  fairness: {
    recency_penalty_weight: number;
    cooldown_turns: number;
    participation_balance_weight: number;
    max_consecutive_turns: number;
  };
  timeouts: {
    bid_collection_ms: number;
    min_bids_required: number;
  };
}

const DEFAULT_CONFIG: BiddingConfig = {
  weights: {
    relevance: 0.35,
    confidence: 0.25,
    novelty: 0.20,
    urgency: 0.20,
  },
  fairness: {
    recency_penalty_weight: 0.15,
    cooldown_turns: 3,
    participation_balance_weight: 0.10,
    max_consecutive_turns: 2,
  },
  timeouts: {
    bid_collection_ms: 1000,
    min_bids_required: 1,
  },
};

class BiddingEngine {
  constructor(private config: BiddingConfig = DEFAULT_CONFIG) {}

  async collectBids(
    context: BidContext,
    participants: Participant[],
    timeout: number
  ): Promise<Map<string, Bid>> {
    const bids = new Map<string, Bid>();
    const deadline = Date.now() + timeout;

    // Parallel bid collection with timeout
    const bidPromises = participants
      .filter(p => p.role === 'active')
      .map(async (p) => {
        try {
          const bid = await this.requestBid(p.agent_id, context, deadline);
          bids.set(p.agent_id, bid);
        } catch (error) {
          // Agent didn't respond in time - implicit pass
          bids.set(p.agent_id, this.createPassBid(p.agent_id));
        }
      });

    await Promise.allSettled(bidPromises);
    return bids;
  }

  evaluateBids(
    bids: Map<string, Bid>,
    conversationState: ConversationState,
    participantStats: Map<string, ParticipantStats>
  ): BidResult {
    const scores = new Map<string, number>();
    const adjustments = new Map<string, number>();

    for (const [agentId, bid] of bids) {
      if (bid.decision.action === 'pass') continue;

      // Base score from bid
      const baseScore = this.calculateBaseScore(bid.scores);

      // Fairness adjustments
      const stats = participantStats.get(agentId)!;
      const recencyPenalty = this.calculateRecencyPenalty(
        stats,
        conversationState.current_turn
      );
      const participationBonus = this.calculateParticipationBonus(
        stats,
        participantStats
      );

      // Check hard constraints
      if (this.violatesHardConstraints(stats, conversationState)) {
        continue; // Skip this agent
      }

      const finalScore = baseScore - recencyPenalty + participationBonus;
      scores.set(agentId, finalScore);
      adjustments.set(agentId, participationBonus - recencyPenalty);
    }

    // Handle deferrals
    for (const [agentId, bid] of bids) {
      if (bid.decision.action === 'defer' && bid.decision.defer_to) {
        const currentScore = scores.get(bid.decision.defer_to) ?? 0;
        scores.set(bid.decision.defer_to, currentScore + 0.1); // Deferral bonus
      }
    }

    return this.selectWinner(scores, bids, adjustments);
  }

  private calculateBaseScore(scores: BidScores): number {
    return (
      scores.relevance * this.config.weights.relevance +
      scores.confidence * this.config.weights.confidence +
      scores.novelty * this.config.weights.novelty +
      scores.urgency * this.config.weights.urgency
    );
  }

  private calculateRecencyPenalty(
    stats: ParticipantStats,
    currentTurn: number
  ): number {
    if (!stats.last_spoke_at) return 0;

    const turnsSinceSpoke = currentTurn - stats.turns_taken;
    const normalizedRecency = Math.max(
      0,
      1 - turnsSinceSpoke / this.config.fairness.cooldown_turns
    );

    return normalizedRecency * this.config.fairness.recency_penalty_weight;
  }

  private calculateParticipationBonus(
    stats: ParticipantStats,
    allStats: Map<string, ParticipantStats>
  ): number {
    const totalTurns = Array.from(allStats.values())
      .reduce((sum, s) => sum + s.turns_taken, 0);

    if (totalTurns === 0) return 0;

    const avgParticipation = totalTurns / allStats.size;
    const agentParticipation = stats.turns_taken;
    const participationRatio = agentParticipation / avgParticipation;

    // Boost underrepresented, penalize overrepresented
    return (1 - participationRatio) * this.config.fairness.participation_balance_weight;
  }

  private violatesHardConstraints(
    stats: ParticipantStats,
    state: ConversationState
  ): boolean {
    // Check max consecutive turns
    // Implementation depends on tracking consecutive turns
    return false;
  }

  private selectWinner(
    scores: Map<string, number>,
    bids: Map<string, Bid>,
    adjustments: Map<string, number>
  ): BidResult {
    if (scores.size === 0) {
      throw new Error('No valid bids received');
    }

    // Sort by score descending
    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1]);

    const [winnerId, winnerScore] = sorted[0];

    // Check for ties
    const ties = sorted.filter(([_, score]) =>
      Math.abs(score - winnerScore) < 0.001
    );

    let tieBreaker: string | undefined;
    let finalWinner = winnerId;

    if (ties.length > 1) {
      // Tie-breaking: prefer higher trust, then lower participation, then random
      tieBreaker = 'random'; // Simplified
      finalWinner = ties[Math.floor(Math.random() * ties.length)][0];
    }

    return {
      winner: finalWinner,
      final_scores: scores,
      tie_breaker_used: tieBreaker,
      fairness_adjustments: adjustments,
    };
  }

  private createPassBid(agentId: string): Bid {
    return {
      id: crypto.randomUUID(),
      conversation_id: '',
      turn_number: 0,
      agent_id: agentId,
      scores: { relevance: 0, confidence: 0, novelty: 0, urgency: 0 },
      decision: { action: 'pass' },
      submitted_at: new Date(),
    };
  }

  private async requestBid(
    agentId: string,
    context: BidContext,
    deadline: number
  ): Promise<Bid> {
    // Implementation: send WebSocket message and await response
    throw new Error('Implement with actual transport');
  }
}
```

---

## 4. Orchestrator Implementation

```typescript
// orchestrator.ts

type OrchestratorState =
  | 'idle'
  | 'collecting_bids'
  | 'evaluating_bids'
  | 'awaiting_response'
  | 'processing_response';

class Orchestrator {
  private state: OrchestratorState = 'idle';
  private biddingEngine: BiddingEngine;
  private conversationService: ConversationService;

  constructor(
    private conversation: Conversation,
    private eventBus: EventEmitter
  ) {
    this.biddingEngine = new BiddingEngine();
    this.conversationService = new ConversationService();
  }

  async processNextTurn(): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot start turn in state: ${this.state}`);
    }

    try {
      // Phase 1: Collect bids
      this.state = 'collecting_bids';
      const context = await this.buildBidContext();

      this.eventBus.emit('bid_request', {
        context,
        deadline_ms: this.conversation.config.bid_timeout_ms,
      });

      const bids = await this.biddingEngine.collectBids(
        context,
        this.conversation.participants,
        this.conversation.config.bid_timeout_ms
      );

      // Phase 2: Evaluate bids
      this.state = 'evaluating_bids';
      const participantStats = this.getParticipantStats();
      const result = this.biddingEngine.evaluateBids(
        bids,
        this.conversation.state,
        participantStats
      );

      // Phase 3: Request response from winner
      this.state = 'awaiting_response';
      const turnContext = this.buildTurnContext(context, result);

      this.eventBus.emit('turn_granted', {
        agent_id: result.winner,
        context: turnContext,
        deadline_ms: this.conversation.config.response_timeout_ms,
      });

      const response = await this.awaitResponse(
        result.winner,
        this.conversation.config.response_timeout_ms
      );

      // Phase 4: Process and broadcast response
      this.state = 'processing_response';
      const message = await this.processResponse(response, result.winner);

      this.eventBus.emit('message_received', message);

      // Update conversation state
      await this.conversationService.addMessage(
        this.conversation.id,
        message
      );

      // Check for conversation end conditions
      if (this.shouldEndConversation()) {
        await this.endConversation();
      }

    } finally {
      this.state = 'idle';
    }
  }

  private async buildBidContext(): Promise<BidContext> {
    const recentMessages = await this.conversationService.getRecentMessages(
      this.conversation.id,
      10  // Last 10 messages
    );

    const summary = await this.conversationService.getSummary(
      this.conversation.id
    );

    return {
      conversation_id: this.conversation.id,
      turn_number: this.conversation.state.current_turn + 1,
      recent_messages: recentMessages,
      summary: summary,
      topic: this.conversation.context.topic ?? '',
      active_participants: this.conversation.participants
        .filter(p => p.role === 'active')
        .map(p => p.agent_id),
    };
  }

  private buildTurnContext(
    bidContext: BidContext,
    result: BidResult
  ): TurnContext {
    return {
      ...bidContext,
      bid_result: result,
      expected_response_type: 'turn_response',
    };
  }

  private async awaitResponse(
    agentId: string,
    timeout: number
  ): Promise<MessageContent> {
    // Implementation with timeout
    throw new Error('Implement with actual transport');
  }

  private async processResponse(
    content: MessageContent,
    agentId: string
  ): Promise<Message> {
    const message: Message = {
      id: crypto.randomUUID(),
      conversation_id: this.conversation.id,
      turn_number: this.conversation.state.current_turn + 1,
      sender: { agent_id: agentId, is_human: false },
      type: 'turn_response',
      content,
      metadata: {
        tokens_used: this.estimateTokens(content.text),
        latency_ms: 0,  // Calculate actual
      },
      routing: { visibility: 'all' },
      timestamp: new Date(),
      signature: '',  // Sign with agent's key
    };

    return message;
  }

  private shouldEndConversation(): boolean {
    const { config, state, context } = this.conversation;

    if (config.max_turns && state.current_turn >= config.max_turns) {
      return true;
    }

    if (context.token_budget.total_used >= context.token_budget.total_limit) {
      return true;
    }

    return false;
  }

  private async endConversation(): Promise<void> {
    this.conversation.state.status = 'completed';
    this.eventBus.emit('conversation_ended', {
      conversation_id: this.conversation.id,
      reason: 'max_turns_reached',
    });
  }

  private getParticipantStats(): Map<string, ParticipantStats> {
    return new Map(
      this.conversation.participants.map(p => [p.agent_id, p.stats])
    );
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);  // Rough estimate
  }
}
```

---

## 5. Voice Integration

```typescript
// voice-service.ts

interface VoiceServiceConfig {
  elevenlabs_api_key: string;
  deepgram_api_key: string;
  default_voice_id: string;
  streaming_enabled: boolean;
}

interface AgentVoiceProfile {
  agent_id: string;
  voice_id: string;
  voice_settings: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
}

class VoiceService {
  private voiceProfiles: Map<string, AgentVoiceProfile> = new Map();
  private audioQueue: AudioChunk[] = [];
  private isPlaying = false;

  constructor(private config: VoiceServiceConfig) {}

  async textToSpeech(
    text: string,
    agentId: string
  ): Promise<ReadableStream<Uint8Array>> {
    const profile = this.voiceProfiles.get(agentId) ?? this.getDefaultProfile();

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${profile.voice_id}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.config.elevenlabs_api_key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: profile.voice_settings,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs error: ${response.status}`);
    }

    return response.body!;
  }

  async speechToText(
    audioStream: ReadableStream<Uint8Array>
  ): Promise<string> {
    // Using Deepgram for real-time STT
    const connection = new WebSocket(
      'wss://api.deepgram.com/v1/listen?model=nova-2',
      ['token', this.config.deepgram_api_key]
    );

    return new Promise((resolve, reject) => {
      let transcript = '';

      connection.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.channel?.alternatives?.[0]?.transcript) {
          transcript += data.channel.alternatives[0].transcript + ' ';
        }
        if (data.is_final) {
          resolve(transcript.trim());
        }
      };

      connection.onerror = reject;

      // Pipe audio to WebSocket
      this.pipeAudioToWebSocket(audioStream, connection);
    });
  }

  setAgentVoice(profile: AgentVoiceProfile): void {
    this.voiceProfiles.set(profile.agent_id, profile);
  }

  private getDefaultProfile(): AgentVoiceProfile {
    return {
      agent_id: 'default',
      voice_id: this.config.default_voice_id,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.5,
        use_speaker_boost: true,
      },
    };
  }

  private async pipeAudioToWebSocket(
    stream: ReadableStream<Uint8Array>,
    ws: WebSocket
  ): Promise<void> {
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      ws.send(value);
    }
  }
}

// Voice Turn-Taking Coordinator
class VoiceTurnCoordinator {
  private currentSpeaker: string | null = null;
  private speakerQueue: string[] = [];

  async requestFloor(agentId: string): Promise<boolean> {
    if (this.currentSpeaker === null) {
      this.currentSpeaker = agentId;
      return true;
    }

    this.speakerQueue.push(agentId);
    return false;
  }

  releaseFloor(agentId: string): void {
    if (this.currentSpeaker !== agentId) {
      throw new Error('Agent does not hold the floor');
    }

    this.currentSpeaker = this.speakerQueue.shift() ?? null;
  }

  forceInterrupt(byAgentId: string): void {
    // Human interruption - pause current speaker
    if (this.currentSpeaker) {
      this.speakerQueue.unshift(this.currentSpeaker);
    }
    this.currentSpeaker = byAgentId;
  }
}
```

---

## 6. Agent Adapter Interface

```typescript
// adapters/base-adapter.ts

interface AgentAdapterConfig {
  api_key: string;
  model: string;
  base_url?: string;
  timeout_ms: number;
}

interface GenerateRequest {
  messages: Array<{ role: string; content: string }>;
  system_prompt?: string;
  max_tokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
}

interface GenerateResponse {
  content: string;
  tokens_used: { input: number; output: number };
  model: string;
  finish_reason: string;
  tool_calls?: ToolCall[];
}

abstract class AgentAdapter {
  abstract readonly provider: AgentProvider;

  constructor(protected config: AgentAdapterConfig) {}

  abstract generate(request: GenerateRequest): Promise<GenerateResponse>;

  abstract generateBid(context: BidContext): Promise<BidScores>;

  abstract healthCheck(): Promise<boolean>;
}

// adapters/claude-adapter.ts
class ClaudeAdapter extends AgentAdapter {
  readonly provider = 'anthropic';

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.config.api_key,
        'anthropic-version': '2024-01-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: request.max_tokens ?? 4096,
        system: request.system_prompt,
        messages: request.messages,
        tools: request.tools,
      }),
    });

    const data = await response.json();

    return {
      content: data.content[0].text,
      tokens_used: {
        input: data.usage.input_tokens,
        output: data.usage.output_tokens,
      },
      model: data.model,
      finish_reason: data.stop_reason,
      tool_calls: data.content.filter((c: any) => c.type === 'tool_use'),
    };
  }

  async generateBid(context: BidContext): Promise<BidScores> {
    const bidPrompt = this.buildBidPrompt(context);
    const response = await this.generate({
      messages: [{ role: 'user', content: bidPrompt }],
      system_prompt: BID_SYSTEM_PROMPT,
      max_tokens: 200,
    });

    return this.parseBidResponse(response.content);
  }

  private buildBidPrompt(context: BidContext): string {
    return `
Given this conversation context, rate your ability to contribute (0-1 for each):

Topic: ${context.topic}
Summary: ${context.summary}
Recent messages:
${context.recent_messages.map(m => `- ${m.sender.agent_id}: ${m.content.text.slice(0, 200)}`).join('\n')}

Respond in JSON: {"relevance": 0.X, "confidence": 0.X, "novelty": 0.X, "urgency": 0.X, "pass": false}
    `.trim();
  }

  private parseBidResponse(content: string): BidScores {
    const json = JSON.parse(content);
    return {
      relevance: Math.min(1, Math.max(0, json.relevance)),
      confidence: Math.min(1, Math.max(0, json.confidence)),
      novelty: Math.min(1, Math.max(0, json.novelty)),
      urgency: Math.min(1, Math.max(0, json.urgency)),
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.generate({
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      });
      return true;
    } catch {
      return false;
    }
  }
}

const BID_SYSTEM_PROMPT = `You are evaluating whether to contribute to a multi-agent conversation.
Rate your scores honestly - only bid high if you genuinely have valuable input.
If the topic is outside your expertise, score low on relevance and confidence.
Return valid JSON only.`;

// adapters/openai-adapter.ts
class OpenAIAdapter extends AgentAdapter {
  readonly provider = 'openai';

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          ...(request.system_prompt
            ? [{ role: 'system', content: request.system_prompt }]
            : []),
          ...request.messages,
        ],
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        tools: request.tools,
      }),
    });

    const data = await response.json();
    const choice = data.choices[0];

    return {
      content: choice.message.content ?? '',
      tokens_used: {
        input: data.usage.prompt_tokens,
        output: data.usage.completion_tokens,
      },
      model: data.model,
      finish_reason: choice.finish_reason,
      tool_calls: choice.message.tool_calls,
    };
  }

  async generateBid(context: BidContext): Promise<BidScores> {
    // Similar implementation to ClaudeAdapter
    throw new Error('Implement');
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.generate({
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      });
      return true;
    } catch {
      return false;
    }
  }
}
```

---

## 7. Database Schema

```sql
-- agents table
CREATE TABLE agents (
  id VARCHAR(36) PRIMARY KEY,
  owner_id VARCHAR(36) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  model_config JSONB NOT NULL,
  identity JSONB NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]',
  preferences JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'offline',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active_at TIMESTAMP WITH TIME ZONE,

  INDEX idx_agents_owner (owner_id),
  INDEX idx_agents_status (status),
  INDEX idx_agents_capabilities ((capabilities->'domain'))
);

-- conversations table
CREATE TABLE conversations (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(255),
  mode VARCHAR(20) NOT NULL,
  topology VARCHAR(20) NOT NULL DEFAULT 'linear',
  config JSONB NOT NULL,
  context JSONB NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  INDEX idx_conversations_mode (mode),
  INDEX idx_conversations_created (created_at DESC)
);

-- conversation_participants table
CREATE TABLE conversation_participants (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL REFERENCES conversations(id),
  agent_id VARCHAR(36) NOT NULL REFERENCES agents(id),
  role VARCHAR(20) NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]',
  stats JSONB NOT NULL DEFAULT '{}',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE (conversation_id, agent_id),
  INDEX idx_participants_conv (conversation_id),
  INDEX idx_participants_agent (agent_id)
);

-- messages table
CREATE TABLE messages (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL REFERENCES conversations(id),
  turn_number INTEGER NOT NULL,
  sender_agent_id VARCHAR(36) NOT NULL,
  sender_is_human BOOLEAN NOT NULL DEFAULT FALSE,
  type VARCHAR(30) NOT NULL,
  content JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  routing JSONB NOT NULL DEFAULT '{}',
  signature VARCHAR(512),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  INDEX idx_messages_conv (conversation_id),
  INDEX idx_messages_turn (conversation_id, turn_number),
  INDEX idx_messages_sender (sender_agent_id),
  INDEX idx_messages_type (type)
);

-- bids table
CREATE TABLE bids (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL REFERENCES conversations(id),
  turn_number INTEGER NOT NULL,
  agent_id VARCHAR(36) NOT NULL REFERENCES agents(id),
  scores JSONB NOT NULL,
  decision JSONB NOT NULL,
  final_score DECIMAL(5,4),
  won BOOLEAN DEFAULT FALSE,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,

  INDEX idx_bids_conv_turn (conversation_id, turn_number),
  INDEX idx_bids_agent (agent_id)
);

-- agent_trust table
CREATE TABLE agent_trust (
  id VARCHAR(36) PRIMARY KEY,
  agent_id VARCHAR(36) NOT NULL REFERENCES agents(id),
  trust_level VARCHAR(20) NOT NULL DEFAULT 'registered',
  reputation_score DECIMAL(5,4) DEFAULT 0.5,
  vouched_by VARCHAR(36)[] DEFAULT '{}',
  violations INTEGER DEFAULT 0,
  last_review_at TIMESTAMP WITH TIME ZONE,

  UNIQUE (agent_id),
  INDEX idx_trust_level (trust_level),
  INDEX idx_trust_reputation (reputation_score DESC)
);
```

---

## 8. Environment Variables

```bash
# .env.example

# Core
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/macp
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRY=24h

# AI Providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...

# Voice
ELEVENLABS_API_KEY=...
ELEVENLABS_DEFAULT_VOICE=EXAVITQu4vr4xnSDxMaL
DEEPGRAM_API_KEY=...

# Rate Limiting
RATE_LIMIT_REQUESTS_PER_MINUTE=60
RATE_LIMIT_TOKENS_PER_MINUTE=100000

# Monitoring
SENTRY_DSN=...
OTEL_EXPORTER_OTLP_ENDPOINT=...
```

---

*This technical specification provides the foundation for implementing MACP. Each section can be expanded as implementation progresses.*
