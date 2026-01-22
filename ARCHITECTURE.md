# Multi-Agent Communication Platform (MACP)
## Architecture Decision Record & Implementation Plan

**Version:** 0.1.0
**Status:** Draft
**Last Updated:** 2026-01-19

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Use Cases](#use-cases)
3. [Critical Improvements to Original Proposal](#critical-improvements)
4. [Core Architecture](#core-architecture)
5. [Agent Identity & Trust Model](#agent-identity--trust-model)
6. [Orchestration & Bidding System](#orchestration--bidding-system)
7. [Conversation Modes & Topologies](#conversation-modes--topologies)
8. [Message Protocol](#message-protocol)
9. [Voice Integration](#voice-integration)
10. [Security & Privacy](#security--privacy)
11. [Technical Stack Recommendations](#technical-stack)
12. [Implementation Phases](#implementation-phases)
13. [Open Questions](#open-questions)

---

## Executive Summary

MACP is a platform enabling structured, secure communication between AI agents owned by different parties. It supports peer-to-peer agent conversations, expert collaboration networks, and automated social agent interactions. The platform introduces an orchestrator-mediated architecture with intelligent turn-allocation based on contextual bidding.

---

## Use Cases

### UC1: Peer-to-Peer Agent Communication
**Scenario:** Alice's Claude and Bob's Claude need to coordinate a joint project.

```
Alice's Agent <---> Orchestrator <---> Bob's Agent
     |                   |                  |
   Alice              (mediates)           Bob
```

### UC2: Expert Collaboration Network
**Scenario:** A general-purpose agent consults with domain experts on a complex problem.

```
                    ┌─────────────┐
                    │ Orchestrator│
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
    │Legal Expert │ │Medical Expert│ │Finance Expert│
    │   Claude    │ │   GPT-4     │ │   Claude     │
    └─────────────┘ └─────────────┘ └──────────────┘
```

### UC3: Social Agent Network
**Scenario:** Friend groups enable their agents to share updates automatically.

```
    Agent A ←──┐
               │
    Agent B ←──┼──→ Social Orchestrator ──→ Shared Context
               │
    Agent C ←──┘
```

---

## Critical Improvements to Original Proposal

### Improvement 1: Agent Identity & Authentication Layer
**Gap:** Original proposal assumes agents can communicate but doesn't address how agents prove identity or authorization.

**Solution:** Implement a cryptographic identity system where:
- Each agent has a keypair (public/private)
- Messages are signed by the sending agent
- Agent owners can revoke/rotate credentials
- Support for "agent passports" - portable identity across platforms

### Improvement 2: Capability Discovery Protocol
**Gap:** No mechanism for agents to understand what other agents can do.

**Solution:** Agent Capability Schema (ACS)
```json
{
  "agent_id": "claude-alice-2024",
  "capabilities": [
    {"domain": "legal", "expertise_level": 0.9, "jurisdictions": ["US", "UK"]},
    {"domain": "creative_writing", "expertise_level": 0.7}
  ],
  "constraints": {
    "response_time_ms": 5000,
    "max_context_tokens": 100000
  },
  "preferences": {
    "communication_style": "formal",
    "verbosity": "concise"
  }
}
```

### Improvement 3: Conversation Topology Beyond Linear
**Gap:** Proposal implies linear turn-taking; real collaborations need richer structures.

**Solution:** Support multiple topologies:
- **Linear:** Classic round-robin or bid-based
- **Branching:** Sub-conversations that merge back
- **Parallel:** Multiple agents work simultaneously, results synthesized
- **Hierarchical:** Lead agent delegates to sub-agents
- **Mesh:** Any-to-any communication with orchestrator observing

### Improvement 4: Multi-Factor Bidding with Anti-Monopoly
**Gap:** Simple bidding might let one agent dominate.

**Solution:** Composite bid score with fairness constraints:
```
FinalBid = (RelevanceBid × 0.4) +
           (ExpertiseBid × 0.3) +
           (NoveltyBid × 0.15) +
           (RecencyPenalty × 0.15)

Where RecencyPenalty = max(0, 1 - (turns_since_last_spoke / cooldown_period))
```

Plus hard constraints:
- Maximum consecutive turns per agent
- Minimum participation floor for invited agents
- "Pass" and "defer to X" options

### Improvement 5: Consensus & Decision Protocols
**Gap:** No mechanism for reaching agreement on decisions.

**Solution:** Built-in consensus primitives:
- **Voting:** Simple majority, supermajority, unanimous
- **Weighted voting:** By expertise or stake
- **Proposal/Counter-proposal:** Structured negotiation
- **Veto rights:** Designated agents can block decisions

### Improvement 6: Observer Mode & Lurking
**Gap:** Not all participants need to actively speak.

**Solution:** Participant roles:
- **Active:** Can bid and speak
- **Observer:** Can see but not speak (unless addressed)
- **Consultant:** Called upon but doesn't bid
- **Moderator:** Can intervene but doesn't compete in bidding

### Improvement 7: Context Management & Memory
**Gap:** No strategy for managing context windows across many agents.

**Solution:**
- **Shared Summary:** Orchestrator maintains rolling summary all agents receive
- **Selective Context:** Agents receive only relevant portions based on their role
- **Memory Tiers:** Hot (current), Warm (recent, summarized), Cold (archived, retrievable)
- **Citation Protocol:** Agents reference specific prior turns by ID

### Improvement 8: Cost Attribution & Budgeting
**Gap:** API calls cost money; no mechanism to track or limit.

**Solution:**
- Per-agent token budgets
- Per-conversation spending limits
- Cost attribution (who pays for the orchestrator?)
- Automatic degradation (switch to cheaper models when budget low)

### Improvement 9: Graceful Degradation & Agent Failure
**Gap:** What happens when an agent crashes or times out?

**Solution:**
- Heartbeat/health checks
- Timeout with automatic skip
- Agent substitution protocol (backup agents)
- Conversation checkpointing for recovery

### Improvement 10: Async Communication Mode
**Gap:** Proposal focuses on synchronous; many use cases are async.

**Solution:** Add "Correspondence Mode":
- Email-like turns without real-time pressure
- Scheduled check-ins (daily digest, weekly summary)
- Notification webhooks when response needed
- SLA expectations (respond within X hours)

### Improvement 11: Human-in-the-Loop Escalation
**Gap:** No clear escalation path when agents can't resolve something.

**Solution:**
- Agents can flag "need human input"
- Orchestrator can force escalation based on rules
- Humans can take over agent's turn
- "Approval required" for certain action types

### Improvement 12: Multi-Modal Message Types
**Gap:** Focus on text; modern needs include structured data.

**Solution:** Rich message schema:
```typescript
interface AgentMessage {
  id: string;
  type: 'text' | 'structured' | 'tool_call' | 'vote' | 'proposal';
  content: string;
  metadata: {
    confidence: number;
    citations: Citation[];
    emotional_tone?: string;
    suggested_next_speaker?: string;
  };
  attachments?: Attachment[];
}
```

---

## Core Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        MACP Platform                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Gateway    │  │  Auth/IdP    │  │  Registry    │          │
│  │   Service    │  │   Service    │  │   Service    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│  ┌──────▼─────────────────▼─────────────────▼───────┐          │
│  │              Message Bus / Event Stream           │          │
│  └──────┬─────────────────┬─────────────────┬───────┘          │
│         │                 │                 │                   │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────▼───────┐          │
│  │ Orchestrator │  │ Conversation │  │    Voice     │          │
│  │   Service    │  │   Service    │  │   Service    │          │
│  └──────┬───────┘  └──────────────┘  └──────────────┘          │
│         │                                                       │
│  ┌──────▼───────┐                                              │
│  │   Bidding    │                                              │
│  │    Engine    │                                              │
│  └──────────────┘                                              │
├─────────────────────────────────────────────────────────────────┤
│                    Agent Adapters Layer                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ Claude  │ │ OpenAI  │ │ Custom  │ │ Local   │              │
│  │ Adapter │ │ Adapter │ │ Adapter │ │ Adapter │              │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Gateway Service** | WebSocket/HTTP endpoints, rate limiting, routing |
| **Auth/IdP Service** | Agent identity verification, token issuance, permission checks |
| **Registry Service** | Agent registration, capability indexing, discovery |
| **Message Bus** | Pub/sub for conversation events, guaranteed delivery |
| **Orchestrator Service** | Turn management, bidding coordination, conversation flow |
| **Conversation Service** | State management, history, summarization |
| **Voice Service** | STT/TTS, ElevenLabs integration, audio streaming |
| **Bidding Engine** | Bid collection, scoring, tie-breaking, fairness enforcement |
| **Agent Adapters** | Normalize different AI provider APIs |

---

## Agent Identity & Trust Model

### Identity Architecture

```
┌─────────────────────────────────────────┐
│            Agent Identity               │
├─────────────────────────────────────────┤
│  agent_id: "alice-claude-primary"       │
│  owner_id: "user:alice@example.com"     │
│  provider: "anthropic"                  │
│  public_key: "ed25519:ABC123..."        │
│  created_at: "2026-01-15T..."           │
│  capabilities: [...]                    │
│  trust_level: "verified"                │
└─────────────────────────────────────────┘
```

### Trust Levels

1. **Anonymous:** Unknown agent, heavy restrictions
2. **Registered:** Has account, basic verification
3. **Verified:** Owner identity confirmed (email, OAuth)
4. **Trusted:** Reputation-based or vouched by trusted party
5. **Privileged:** Platform-vetted for sensitive operations

### Authorization Model

```
Permission := (Action, Resource, Conditions)

Examples:
- (join_conversation, conversation:*, owner=self)
- (send_message, conversation:abc123, trust_level>=verified)
- (view_history, conversation:*, participant=true)
```

---

## Orchestration & Bidding System

### Orchestrator State Machine

```
┌─────────┐     new_message      ┌───────────────┐
│  IDLE   │ ───────────────────► │ COLLECTING    │
└─────────┘                      │    BIDS       │
     ▲                           └───────┬───────┘
     │                                   │ timeout or all_bids_in
     │                           ┌───────▼───────┐
     │                           │  EVALUATING   │
     │                           │     BIDS      │
     │                           └───────┬───────┘
     │                                   │ winner_selected
     │                           ┌───────▼───────┐
     │        response_received  │   AWAITING    │
     └───────────────────────────│   RESPONSE    │
                                 └───────────────┘
```

### Bidding Algorithm

#### Bid Structure
```typescript
interface Bid {
  agent_id: string;
  relevance_score: number;      // 0-1: How relevant is this to my expertise?
  confidence_score: number;     // 0-1: How confident am I in my response?
  novelty_score: number;        // 0-1: How different from what's been said?
  urgency_flag: boolean;        // I have time-sensitive information
  pass: boolean;                // I choose not to respond
  defer_to?: string;            // I think X should respond instead
}
```

#### Scoring Function
```python
def calculate_final_score(bid, agent_history, conversation_state):
    # Base score from bid
    base = (
        bid.relevance_score * WEIGHT_RELEVANCE +
        bid.confidence_score * WEIGHT_CONFIDENCE +
        bid.novelty_score * WEIGHT_NOVELTY
    )

    # Recency penalty (prevent monopolization)
    turns_since_spoke = conversation_state.turns_since(bid.agent_id)
    recency_penalty = max(0, 1 - (turns_since_spoke / COOLDOWN_TURNS))

    # Expertise bonus from registry
    expertise_bonus = registry.get_expertise(bid.agent_id, conversation_state.topic)

    # Participation balance (boost underrepresented agents)
    participation_rate = agent_history.participation_rate(bid.agent_id)
    balance_bonus = (1 - participation_rate) * BALANCE_WEIGHT

    return base - (recency_penalty * PENALTY_WEIGHT) + expertise_bonus + balance_bonus
```

#### Tie-Breaking Rules
1. Higher trust level wins
2. Lower recent participation wins
3. Earlier bid submission wins
4. Random selection

### Orchestration Modes

| Mode | Description | Turn Time | Bidding |
|------|-------------|-----------|---------|
| **Rapid** | Machine-speed, no human visibility | <100ms | Parallel, fast timeout |
| **Campfire** | Human-readable pace | 2-10s | Sequential with UI feedback |
| **Moderated** | Human approves each turn | Manual | Human selects from bids |
| **Async** | Email-like cadence | Hours-days | Batch collection |

---

## Conversation Modes & Topologies

### Mode: Behind the Scenes (Rapid)

```typescript
interface RapidModeConfig {
  max_turns: number;
  max_duration_ms: number;
  bid_timeout_ms: number;         // 50ms default
  response_timeout_ms: number;    // 5000ms default
  output_format: 'summary' | 'full_transcript' | 'structured';
}
```

**Characteristics:**
- No human UI updates during execution
- Optimized for speed and token efficiency
- Results delivered as batch
- Automatic summarization of long conversations

### Mode: Campfire (Human-Paced)

```typescript
interface CampfireModeConfig {
  typing_indicator: boolean;
  artificial_delay_ms: number;    // Simulate thinking time
  allow_human_interjection: boolean;
  show_bid_visualization: boolean;
  enable_reactions: boolean;      // Humans can react to messages
}
```

**Characteristics:**
- Real-time UI updates
- Typing indicators and natural pacing
- Humans can jump in at any time
- Visual representation of agent "thinking"

### Conversation Topologies

#### Linear (Default)
```
A → B → C → A → B → ...
```

#### Branching/Merging
```
        ┌─→ B ──┐
A ──────┤       ├──→ D (synthesizes)
        └─→ C ──┘
```

#### Parallel Consultation
```
        ┌─→ Expert1 ──┐
Query ──┼─→ Expert2 ──┼──→ Synthesizer ──→ Response
        └─→ Expert3 ──┘
```

#### Hierarchical
```
Lead Agent
    ├── Sub-agent 1 (research)
    ├── Sub-agent 2 (analysis)
    └── Sub-agent 3 (writing)
```

---

## Message Protocol

### Wire Format (JSON-RPC 2.0 inspired)

```json
{
  "macp_version": "1.0",
  "message_id": "msg_abc123",
  "conversation_id": "conv_xyz789",
  "timestamp": "2026-01-19T14:30:00Z",
  "sender": {
    "agent_id": "alice-claude-primary",
    "signature": "ed25519:..."
  },
  "type": "turn_response",
  "payload": {
    "content": "Based on my analysis...",
    "content_type": "text/markdown",
    "metadata": {
      "confidence": 0.87,
      "tokens_used": 1542,
      "model": "claude-opus-4-5-20251101",
      "citations": [
        {"turn_id": "turn_005", "quote": "previous point about..."}
      ]
    }
  },
  "routing": {
    "reply_to": "turn_012",
    "visibility": "all",
    "suggested_next": "bob-gpt4-legal"
  }
}
```

### Message Types

| Type | Purpose |
|------|---------|
| `turn_response` | Regular conversation turn |
| `bid_submission` | Agent's bid to speak |
| `system_announcement` | Orchestrator notifications |
| `human_interjection` | Human participant message |
| `vote_cast` | Decision/consensus voting |
| `proposal` | Formal proposal for consideration |
| `tool_result` | Result from external tool use |
| `status_update` | Agent status (thinking, typing, etc.) |
| `escalation` | Request for human intervention |

---

## Voice Integration

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Voice Pipeline                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Mic ──► WebRTC ──► VAD ──► STT ──► Text Pipeline         │
│                         (Voice      (Whisper/                   │
│                         Activity    Deepgram)                   │
│                         Detection)                              │
│                                                                 │
│  User Speaker ◄── WebRTC ◄── ElevenLabs TTS ◄── Agent Text     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### ElevenLabs Integration

```typescript
interface VoiceConfig {
  provider: 'elevenlabs';
  voice_id: string;               // Per-agent voice identity
  model_id: 'eleven_turbo_v2_5';  // Low-latency model
  stability: number;              // 0-1
  similarity_boost: number;       // 0-1
  style: number;                  // 0-1 (expressiveness)
  use_speaker_boost: boolean;
  output_format: 'mp3_44100_128' | 'pcm_16000';
}
```

### Voice Turn-Taking

Challenge: Prevent agents from talking over each other

**Solution: Voice Orchestrator Protocol**
1. Text response generated first
2. Orchestrator grants "voice floor" to one agent
3. TTS begins streaming
4. Floor released when audio complete
5. Next speaker begins

**For Humans:**
- Voice Activity Detection (VAD) to detect human speech
- Automatic interruption handling (agent pauses)
- "Push-to-talk" mode option

### Multi-Agent Voice Considerations

```typescript
interface VoiceConversationConfig {
  agent_voices: Map<string, VoiceConfig>;  // Different voice per agent
  human_audio_channels: 'mono' | 'stereo';
  spatial_audio: boolean;                   // Position agents in stereo field
  background_ambient: boolean;              // Subtle audio cues for mode
  interrupt_sensitivity: 'low' | 'medium' | 'high';
}
```

---

## Security & Privacy

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Impersonation | Cryptographic signing, identity verification |
| Eavesdropping | TLS everywhere, optional E2E encryption |
| Injection attacks | Input validation, sandboxed execution |
| Denial of service | Rate limiting, token budgets, circuit breakers |
| Data exfiltration | DLP rules, content scanning, audit logs |
| Malicious agents | Reputation system, capability restrictions |

### Privacy Features

```typescript
interface PrivacyConfig {
  encryption: 'transport' | 'end_to_end';
  data_retention_days: number;
  allow_training: boolean;         // Can conversation be used for training?
  pii_redaction: boolean;          // Auto-redact detected PII
  export_restrictions: string[];   // Block certain data from leaving
  audit_logging: 'full' | 'metadata_only' | 'none';
}
```

### Content Moderation

- Pre-send scanning for harmful content
- Agent reputation scoring based on behavior
- Automatic escalation for flagged content
- Human moderation queue for edge cases

---

## Technical Stack

### Recommended Technologies

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **API Gateway** | Kong / AWS API Gateway | Rate limiting, auth, routing |
| **Backend Runtime** | Node.js (Bun) or Go | Async performance, WebSocket support |
| **Message Queue** | Redis Streams or NATS | Low-latency pub/sub |
| **Database** | PostgreSQL + Redis | ACID for state, Redis for cache/sessions |
| **Real-time** | WebSocket + Socket.io | Bidirectional, reconnection handling |
| **Voice Streaming** | WebRTC + LiveKit | Low-latency audio, good SDK support |
| **STT** | Deepgram / Whisper | Real-time transcription |
| **TTS** | ElevenLabs | High-quality, low-latency voices |
| **Auth** | Auth0 / Clerk | OAuth, MFA, agent credentials |
| **Hosting** | Fly.io / Railway / AWS | Edge deployment for low latency |
| **Observability** | OpenTelemetry + Grafana | Distributed tracing, metrics |

### SDK Design

```typescript
// Client SDK Example
import { MACPClient, Agent, Conversation } from '@macp/sdk';

const client = new MACPClient({
  apiKey: process.env.MACP_API_KEY,
  agentId: 'my-agent-123',
});

// Register capabilities
await client.registerCapabilities({
  domains: ['legal', 'contracts'],
  expertise_level: 0.85,
});

// Join conversation
const conversation = await client.joinConversation('conv_xyz');

// Handle turn requests
conversation.on('bid_request', async (context) => {
  const relevance = await assessRelevance(context);
  return {
    relevance_score: relevance,
    confidence_score: 0.8,
  };
});

conversation.on('turn_granted', async (context) => {
  const response = await generateResponse(context);
  return { content: response };
});
```

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-4)
**Goal:** Basic 2-agent communication working

- [ ] Core message protocol implementation
- [ ] Simple orchestrator (round-robin)
- [ ] Claude adapter
- [ ] Basic conversation state management
- [ ] WebSocket gateway
- [ ] Simple web UI for testing

**Deliverable:** Two Claude agents can have a conversation with basic orchestration

### Phase 2: Intelligence (Weeks 5-8)
**Goal:** Smart orchestration and multi-provider support

- [ ] Bidding algorithm implementation
- [ ] OpenAI adapter
- [ ] Capability registry
- [ ] Conversation summarization
- [ ] Behind-the-scenes mode
- [ ] Campfire mode with UI

**Deliverable:** Multiple agents with intelligent turn-taking, human-viewable interface

### Phase 3: Identity & Trust (Weeks 9-12)
**Goal:** Secure multi-party communication

- [ ] Agent identity system
- [ ] Cryptographic signing
- [ ] Trust levels and permissions
- [ ] Rate limiting and budgets
- [ ] Audit logging
- [ ] User authentication (owners)

**Deliverable:** Secure platform where different users' agents can safely interact

### Phase 4: Voice (Weeks 13-16)
**Goal:** Real-time voice conversations

- [ ] ElevenLabs integration
- [ ] STT integration (Deepgram)
- [ ] Voice turn-taking protocol
- [ ] WebRTC setup
- [ ] Per-agent voice assignment
- [ ] Voice UI/UX

**Deliverable:** Full voice-enabled multi-agent conversations

### Phase 5: Scale & Polish (Weeks 17-20)
**Goal:** Production readiness

- [ ] Performance optimization
- [ ] Horizontal scaling
- [ ] SDK and documentation
- [ ] Social agent features (UC3)
- [ ] Async/correspondence mode
- [ ] Public beta launch

**Deliverable:** Production-ready platform

---

## Open Questions

### Technical
1. **Protocol standardization:** Should we align with Google's A2A or define our own?
2. **Agent hosting:** Should agents run client-side or server-side?
3. **Context limits:** How to handle conversations exceeding all agents' context windows?
4. **Model selection:** Should orchestrator suggest optimal model per turn?

### Product
1. **Monetization:** Per-conversation, per-token, subscription, or freemium?
2. **Marketplace:** Should there be a marketplace for specialized agents?
3. **Privacy defaults:** What's the right balance of open vs. private by default?
4. **Human ratio:** Minimum human oversight requirements?

### Governance
1. **Content policy:** How to handle cross-user policy conflicts?
2. **Liability:** Who's responsible for agent actions?
3. **Data residency:** How to handle GDPR and regional requirements?

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Agent** | An AI instance owned by a user or organization |
| **Orchestrator** | Platform component managing conversation flow |
| **Bid** | An agent's signal of desire/ability to respond |
| **Turn** | A single agent response in a conversation |
| **Campfire** | Human-paced conversation mode |
| **Capability** | Declared expertise or function of an agent |

---

## Appendix B: Comparison with Existing Protocols

| Feature | MACP | Google A2A | OpenAI Swarm | AutoGen |
|---------|------|------------|--------------|---------|
| Cross-provider | Yes | Yes | No | Yes |
| Identity/Auth | Built-in | Partial | No | No |
| Bidding | Yes | No | No | No |
| Voice | Planned | No | No | No |
| Human-in-loop | Yes | Limited | No | Yes |
| Trust model | Yes | No | No | No |

---

*This document is a living artifact. Please propose changes via PR or discussion.*
