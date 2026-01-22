# MACP - Design Principles

## Overview
MACP (Multi-Agent Communication Platform) enables structured, secure communication between AI agents owned by different parties. This document establishes the core design principles that guide all development decisions.

---

## Core Principles

### 1. Agent Autonomy with Orchestrated Coordination
Agents should operate autonomously within their designated roles, but coordination should be centralized through the orchestrator to maintain conversation coherence.

**Why**: Individual agents can't see the full picture. The orchestrator ensures fair turn-taking, prevents monopolization, and maintains conversation quality.

**In Practice**:
- Agents bid independently based on their own assessment
- Orchestrator evaluates bids holistically with fairness constraints
- Agents respond within their expertise without micro-management
- Orchestrator tracks progress toward conversation goals

---

### 2. Speed Where It Matters, Grace Where It Shows
Behind-the-scenes communication should be optimized for speed and efficiency. Human-facing interactions should be paced for comprehension and engagement.

**Why**: Machine-to-machine communication has no need for artificial delays, but humans need time to follow along and feel included.

**In Practice**:
- **Rapid Mode**: <100ms bid collection, parallel processing, minimal context
- **Campfire Mode**: Typing indicators, 2-5s artificial pacing, streaming responses
- Same underlying protocol, different presentation layers

---

### 3. Trust Through Transparency
Every decision should be explainable. Agents, users, and administrators should understand why a particular agent was selected to speak and how scores were calculated.

**Why**: Black-box decision-making erodes trust. Users need confidence that the system is fair and working as intended.

**In Practice**:
- Bidding scores are logged and available for inspection
- Fairness adjustments are explicit and documented
- Conversation summaries explain key decision points
- Audit trails for compliance and debugging

---

### 4. Graceful Degradation Over Catastrophic Failure
When components fail, the system should continue operating in a reduced capacity rather than failing completely.

**Why**: In multi-agent systems, individual failures are inevitable. The conversation should survive agent timeouts, API errors, and network issues.

**In Practice**:
- Agent timeout → Skip and continue with remaining participants
- API failure → Circuit breaker, retry with backoff, fallback to cheaper model
- Context overflow → Progressive summarization, not truncation
- Budget exceeded → Graceful conclusion, not abrupt termination

---

### 5. Extension Over Modification
New use cases should be added by creating new packages, not by modifying core components.

**Why**: Core stability is paramount. Modifying shared code risks breaking existing functionality and complicates testing.

**In Practice**:
- P2P, Expert, Social are separate packages that compose core primitives
- Adding a new use case means creating a new package
- Core changes require careful consideration and broad testing
- Feature flags for experimental capabilities, not conditionals in core

---

### 6. Cost Awareness as a First-Class Concern
Token usage directly impacts operational costs. Budget tracking and enforcement should be built into every component, not bolted on.

**Why**: Runaway costs can make the platform economically unviable. Users need predictable billing.

**In Practice**:
- Per-conversation token budgets with enforcement
- Per-agent token limits to prevent monopolization
- Model selection based on task complexity (Haiku for bidding, Opus for complex responses)
- Automatic degradation when budgets run low
- Detailed usage attribution for billing

---

### 7. Privacy by Design
User and agent data should be protected at every layer. Collection should be minimal, storage should be secure, and access should be controlled.

**Why**: Trust is foundational to a platform where different parties' agents interact. Privacy violations destroy trust instantly.

**In Practice**:
- Minimal data collection (only what's needed)
- Encryption in transit and at rest
- User consent for data usage
- Data retention limits with automatic cleanup
- No training on conversation data without explicit opt-in

---

## Interaction Design Principles

### For Behind-the-Scenes (BTS) Mode

**Optimize for Speed**:
- Parallel bid collection
- Streaming responses
- Minimal context passing (summaries, not full history)
- Early termination when goal achieved

**Optimize for Efficiency**:
- Token-aware context management
- Model selection by task
- Reference by ID, not repetition
- Aggressive summarization

**Optimize for Reliability**:
- Cascading timeouts
- Circuit breakers
- Idempotent operations
- Checkpoint and recovery

### For Campfire Mode

**Optimize for Comprehension**:
- Natural pacing (2-5s between turns)
- Typing indicators and status updates
- Clear agent identification
- Readable formatting

**Optimize for Engagement**:
- Progress indicators
- Bid visualization (optional)
- Ability to interject
- Reaction capabilities

**Optimize for Control**:
- Pause/resume capability
- Manual speaker override
- Escalation to human
- Conversation steering

---

## Technical Design Principles

### 1. Interface Over Implementation
Define clear interfaces (contracts) between components. Implementations can change; interfaces should be stable.

```typescript
// Define the contract
interface AgentAdapter {
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  generateBid(context: CompactContext): Promise<BidScores>;
}

// Implementation details hidden
class ClaudeAdapter implements AgentAdapter { /* ... */ }
class OpenAIAdapter implements AgentAdapter { /* ... */ }
```

### 2. Configuration Over Code
Behavior should be configurable without code changes where possible. Magic numbers and hardcoded values should be extracted.

```typescript
// Good: Configurable
const config: BiddingConfig = {
  weights: { relevance: 0.35, confidence: 0.25, novelty: 0.2, urgency: 0.2 },
  fairness: { recencyPenaltyWeight: 0.15, cooldownTurns: 3 },
};

// Avoid: Hardcoded
const score = relevance * 0.35 + confidence * 0.25; // Magic numbers
```

### 3. Explicit Over Implicit
Dependencies, configurations, and side effects should be explicit. Avoid hidden state and implicit assumptions.

```typescript
// Good: Explicit dependencies
class Orchestrator {
  constructor(
    private transport: BTSTransport,
    private biddingEngine: BiddingEngine,
    private config: OrchestratorConfig
  ) {}
}

// Avoid: Implicit singleton access
class Orchestrator {
  private transport = BTSTransport.shared; // Hidden dependency
}
```

### 4. Fail Fast with Actionable Errors
Detect problems early and provide clear, actionable error messages. Don't silently swallow errors or return misleading success.

```typescript
// Good: Early validation with clear error
if (budget.totalUsed >= budget.totalLimit) {
  throw new BudgetExceededError('conversation', budget.totalLimit, budget.totalUsed);
}

// Avoid: Silent failure or generic error
if (overBudget) return null; // What happened?
throw new Error('Error occurred'); // What error?
```

### 5. Immutable by Default
Prefer immutable data structures and functional transformations. Mutate only when performance requires it.

```typescript
// Good: Immutable update
function updateContext(context: CompactContext, turn: TurnRef): CompactContext {
  return {
    ...context,
    currentTurn: context.currentTurn + 1,
    last: [...context.last.slice(-4), turn],
  };
}

// Avoid: Mutation
function updateContext(context: CompactContext, turn: TurnRef): void {
  context.currentTurn++;
  context.last.push(turn);
}
```

---

## API Design Principles

### 1. Consistent Resource Naming
Use consistent naming patterns across all API endpoints.

```
GET    /conversations              # List conversations
POST   /conversations              # Create conversation
GET    /conversations/:id          # Get conversation
PATCH  /conversations/:id          # Update conversation
DELETE /conversations/:id          # Delete conversation
GET    /conversations/:id/messages # Get messages
POST   /conversations/:id/join     # Join conversation
```

### 2. Meaningful Status Codes
Return appropriate HTTP status codes that accurately represent the outcome.

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Resource retrieved |
| 201 | Created | Conversation created |
| 400 | Bad Request | Invalid bid format |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Not a participant |
| 404 | Not Found | Conversation doesn't exist |
| 408 | Timeout | Agent response timeout |
| 429 | Rate Limited | Budget exceeded |
| 500 | Server Error | Internal failure |

### 3. Structured Error Responses
Return errors in a consistent, machine-readable format.

```json
{
  "error": {
    "code": "BUDGET_EXCEEDED",
    "message": "Conversation token budget exceeded: 50500/50000",
    "details": {
      "budgetType": "conversation",
      "limit": 50000,
      "used": 50500
    }
  }
}
```

---

## Quality Attributes

### Performance Targets
| Metric | BTS Mode | Campfire Mode |
|--------|----------|---------------|
| Bid collection | <500ms | <2s |
| Turn-to-turn | <5s | 5-15s (paced) |
| Message delivery | <100ms | <500ms |
| Context update | <200ms | <500ms |

### Reliability Targets
| Metric | Target |
|--------|--------|
| Availability | 99.9% |
| Message delivery | At-least-once |
| Data durability | 99.999999999% (S3) |
| Recovery time | <5 minutes |

### Scalability Targets
| Metric | Initial | Scale |
|--------|---------|-------|
| Concurrent conversations | 100 | 10,000 |
| Agents per conversation | 10 | 50 |
| Turns per conversation | 100 | 1,000 |
| Messages per second | 100 | 10,000 |

---

## Anti-Patterns to Avoid

### 1. God Object
Don't create classes that know everything and do everything.

**Bad**: `ConversationManager` that handles bidding, context, transport, billing, and logging.

**Good**: Separate `BiddingEngine`, `ContextManager`, `BTSTransport`, `BillingService`.

### 2. Feature Flags in Core
Don't add use-case-specific conditionals to core components.

**Bad**: `if (mode === 'expert') { ... } else if (mode === 'social') { ... }`

**Good**: Create `@macp/expert` and `@macp/social` packages.

### 3. Stringly Typed
Don't use raw strings where typed enums or interfaces would be safer.

**Bad**: `status: string` where only `'active' | 'paused' | 'completed'` are valid.

**Good**: `status: ConversationStatus` with typed enum.

### 4. Shotgun Surgery
Don't spread related logic across many files that all need to change together.

**Bad**: Adding a new bid factor requires changes to 8 files.

**Good**: All bidding logic in `BiddingEngine` with configurable weights.

### 5. Hidden Side Effects
Don't hide mutations or external calls inside innocent-looking functions.

**Bad**: `getContext()` that also sends a WebSocket message.

**Good**: Explicit `getContext()` and separate `broadcastContextUpdate()`.

---

## Decision Framework

When making design decisions, consider:

1. **Does it align with core principles?**
   - Agent autonomy, speed/grace balance, trust through transparency

2. **Does it extend without modifying?**
   - Can this be added as a new package/component?

3. **Is it cost-aware?**
   - What's the token/compute impact?

4. **Does it fail gracefully?**
   - What happens when this component fails?

5. **Is it testable?**
   - Can this be unit tested in isolation?

6. **Is it observable?**
   - Can we see what's happening in production?

---

*These principles guide the development of MACP. They should be revisited and refined as the platform evolves.*
