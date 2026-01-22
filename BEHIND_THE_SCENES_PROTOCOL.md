# Behind-the-Scenes Agent Communication Protocol

## Overview

"Behind the scenes" (BTS) mode enables high-speed, machine-optimized agent communication without human-readable pacing. This document defines the protocol, best practices, and optimizations for efficient multi-agent coordination.

---

## Design Principles

### 1. Speed Over Readability
- No artificial delays
- Parallel execution where possible
- Streaming responses preferred
- Minimal serialization overhead

### 2. Token Efficiency
- Compressed context passing
- Structured outputs (JSON mode)
- Incremental summarization
- Reference by ID, not repetition

### 3. Reliability
- Idempotent operations
- Automatic retry with backoff
- Circuit breakers for failing providers
- Graceful degradation

### 4. Cost Awareness
- Track tokens per agent per turn
- Budget enforcement
- Model selection based on task complexity
- Early termination when goal achieved

---

## Protocol Specification

### Message Format (Internal)

Unlike the external protocol (designed for interoperability), the internal BTS protocol is optimized for speed within our infrastructure.

```typescript
// Compact internal message format
interface BTSMessage {
  id: string;              // ULID for time-sortable IDs
  cid: string;             // Conversation ID
  t: number;               // Turn number
  a: string;               // Agent ID
  type: BTSMessageType;
  p: BTSPayload;           // Payload
  ts: number;              // Unix timestamp ms
}

type BTSMessageType =
  | 'req'      // Turn request (orchestrator -> agent)
  | 'res'      // Turn response (agent -> orchestrator)
  | 'bid'      // Bid submission
  | 'ctx'      // Context update
  | 'end'      // Conversation end signal
  | 'err';     // Error

interface BTSPayload {
  // For 'req' type
  ctx?: CompactContext;
  deadline?: number;       // Unix timestamp ms

  // For 'res' type
  content?: string;
  meta?: ResponseMeta;

  // For 'bid' type
  scores?: BidScores;
  action?: 'bid' | 'pass' | 'defer';

  // For 'err' type
  code?: string;
  msg?: string;
}

interface CompactContext {
  sum: string;             // Rolling summary
  last: TurnRef[];         // Last N turns (references + key content)
  topic: string;
  goal: string;
  participants: string[];  // Agent IDs only
}

interface TurnRef {
  t: number;               // Turn number
  a: string;               // Agent ID
  key: string;             // Key point (1-2 sentences max)
}

interface ResponseMeta {
  tokens: { in: number; out: number };
  model: string;
  latency: number;
  confidence?: number;
}
```

### Transport: Redis Streams

For BTS communication within AWS, Redis Streams provides the optimal balance of speed, reliability, and observability.

```typescript
// redis-transport.ts

interface RedisStreamConfig {
  conversationStreamPrefix: string;  // 'bts:conv:'
  agentStreamPrefix: string;         // 'bts:agent:'
  maxLen: number;                    // Max messages per stream
  blockTimeout: number;              // Read block timeout ms
}

class BTSTransport {
  constructor(
    private redis: Redis,
    private config: RedisStreamConfig
  ) {}

  // Orchestrator publishes to conversation stream
  async publishToConversation(
    conversationId: string,
    message: BTSMessage
  ): Promise<string> {
    const streamKey = `${this.config.conversationStreamPrefix}${conversationId}`;
    const messageId = await this.redis.xadd(
      streamKey,
      'MAXLEN', '~', this.config.maxLen,
      '*',
      'data', JSON.stringify(message)
    );
    return messageId;
  }

  // Agent subscribes to its personal stream for requests
  async subscribeAgent(
    agentId: string,
    handler: (message: BTSMessage) => Promise<void>
  ): Promise<void> {
    const streamKey = `${this.config.agentStreamPrefix}${agentId}`;
    let lastId = '$';  // Start from new messages

    while (true) {
      const results = await this.redis.xread(
        'BLOCK', this.config.blockTimeout,
        'STREAMS', streamKey, lastId
      );

      if (results) {
        for (const [, messages] of results) {
          for (const [id, fields] of messages) {
            const message = JSON.parse(fields[1]) as BTSMessage;
            await handler(message);
            lastId = id;
          }
        }
      }
    }
  }

  // Agent responds via orchestrator's inbox
  async respondToOrchestrator(
    conversationId: string,
    message: BTSMessage
  ): Promise<void> {
    const streamKey = `bts:orch:${conversationId}`;
    await this.redis.xadd(
      streamKey,
      'MAXLEN', '~', 1000,
      '*',
      'data', JSON.stringify(message)
    );
  }
}
```

---

## Orchestration Patterns

### Pattern 1: Rapid Round-Robin

Simplest pattern for quick back-and-forth between two agents.

```typescript
async function rapidRoundRobin(
  agents: [string, string],
  context: CompactContext,
  maxTurns: number
): Promise<ConversationResult> {
  const turns: BTSMessage[] = [];
  let currentIdx = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const agent = agents[currentIdx];

    const response = await requestTurn(agent, {
      ctx: context,
      deadline: Date.now() + RESPONSE_TIMEOUT_MS,
    });

    turns.push(response);

    // Update context with new turn
    context = updateContext(context, response);

    // Check for natural conclusion
    if (detectConclusion(response)) {
      break;
    }

    currentIdx = (currentIdx + 1) % 2;
  }

  return { turns, finalContext: context };
}
```

### Pattern 2: Parallel Consultation

Query multiple agents simultaneously, synthesize results.

```typescript
async function parallelConsultation(
  agents: string[],
  question: string,
  context: CompactContext
): Promise<SynthesizedResponse> {
  // Fan out to all agents in parallel
  const responsePromises = agents.map(agent =>
    requestTurnWithTimeout(agent, {
      ctx: { ...context, goal: question },
      deadline: Date.now() + RESPONSE_TIMEOUT_MS,
    })
  );

  // Collect responses (with error handling)
  const results = await Promise.allSettled(responsePromises);

  const responses = results
    .filter((r): r is PromiseFulfilledResult<BTSMessage> =>
      r.status === 'fulfilled'
    )
    .map(r => r.value);

  // Synthesize responses (can use another agent or algorithmic)
  return synthesizeResponses(responses, question);
}

async function synthesizeResponses(
  responses: BTSMessage[],
  originalQuestion: string
): Promise<SynthesizedResponse> {
  // Option 1: Use a synthesizer agent
  const synthesizerPrompt = buildSynthesisPrompt(responses, originalQuestion);
  const synthesis = await callSynthesizerAgent(synthesizerPrompt);

  // Option 2: Algorithmic synthesis for structured responses
  // const synthesis = algorithmicMerge(responses);

  return {
    synthesis: synthesis.content,
    sources: responses.map(r => ({ agent: r.a, response: r.p.content })),
    agreement: calculateAgreementScore(responses),
  };
}
```

### Pattern 3: Iterative Refinement

Agents iteratively improve a response until quality threshold met.

```typescript
async function iterativeRefinement(
  producer: string,
  critic: string,
  task: string,
  context: CompactContext,
  qualityThreshold: number = 0.9
): Promise<RefinedResponse> {
  let draft = await requestTurn(producer, {
    ctx: { ...context, goal: `Produce: ${task}` },
  });

  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    // Get critique
    const critique = await requestTurn(critic, {
      ctx: {
        ...context,
        goal: 'Critique this response. Score 0-1 and suggest improvements.',
        last: [{ t: 0, a: producer, key: draft.p.content! }],
      },
    });

    const { score, suggestions } = parseCritique(critique.p.content!);

    if (score >= qualityThreshold) {
      return { final: draft.p.content!, iterations, finalScore: score };
    }

    // Refine based on critique
    draft = await requestTurn(producer, {
      ctx: {
        ...context,
        goal: `Improve based on feedback: ${suggestions}`,
        last: [
          { t: 0, a: producer, key: draft.p.content! },
          { t: 1, a: critic, key: suggestions },
        ],
      },
    });

    iterations++;
  }

  return { final: draft.p.content!, iterations, finalScore: 0 };
}
```

### Pattern 4: Bidding-Based (Full Protocol)

Complete bidding protocol for dynamic agent selection.

```typescript
async function biddingBasedTurn(
  orchestrator: BTSOrchestrator,
  participants: string[],
  context: CompactContext
): Promise<BTSMessage> {
  // Phase 1: Broadcast bid request
  const bidDeadline = Date.now() + BID_TIMEOUT_MS;

  const bidRequests = participants.map(agent =>
    orchestrator.transport.publishToAgent(agent, {
      id: ulid(),
      cid: context.conversationId,
      t: context.currentTurn,
      a: 'orchestrator',
      type: 'req',
      p: { ctx: context, deadline: bidDeadline },
      ts: Date.now(),
    })
  );

  await Promise.all(bidRequests);

  // Phase 2: Collect bids with timeout
  const bids = await orchestrator.collectBids(
    context.conversationId,
    participants,
    bidDeadline
  );

  // Phase 3: Evaluate and select winner
  const winner = orchestrator.biddingEngine.evaluateBids(
    bids,
    orchestrator.getParticipantStats()
  );

  // Phase 4: Request response from winner
  const responseDeadline = Date.now() + RESPONSE_TIMEOUT_MS;

  await orchestrator.transport.publishToAgent(winner.winner, {
    id: ulid(),
    cid: context.conversationId,
    t: context.currentTurn,
    a: 'orchestrator',
    type: 'req',
    p: {
      ctx: context,
      deadline: responseDeadline,
      // Signal that this agent won the bid
      granted: true,
    },
    ts: Date.now(),
  });

  // Phase 5: Await response
  const response = await orchestrator.awaitResponse(
    winner.winner,
    context.conversationId,
    responseDeadline
  );

  return response;
}
```

---

## Context Management

### Rolling Summary Strategy

Maintain a compressed summary that all agents receive.

```typescript
class ContextManager {
  private summarizerAgent: string;
  private maxSummaryTokens: number = 500;
  private summarizeEveryNTurns: number = 5;

  async updateContext(
    currentContext: CompactContext,
    newTurn: BTSMessage
  ): Promise<CompactContext> {
    // Add to recent turns (keep last 3)
    const updatedLast = [
      ...currentContext.last.slice(-2),
      {
        t: newTurn.t,
        a: newTurn.a,
        key: this.extractKeyPoint(newTurn.p.content!),
      },
    ];

    // Periodically re-summarize
    if (newTurn.t % this.summarizeEveryNTurns === 0) {
      const newSummary = await this.generateSummary(
        currentContext.sum,
        updatedLast
      );
      return {
        ...currentContext,
        sum: newSummary,
        last: updatedLast,
      };
    }

    return {
      ...currentContext,
      last: updatedLast,
    };
  }

  private extractKeyPoint(content: string): string {
    // Truncate to key information
    // In production: use small/fast model to extract
    const sentences = content.split(/[.!?]+/);
    return sentences.slice(0, 2).join('. ').slice(0, 200);
  }

  private async generateSummary(
    existingSummary: string,
    recentTurns: TurnRef[]
  ): Promise<string> {
    const prompt = `
Current summary: ${existingSummary}

Recent turns:
${recentTurns.map(t => `- ${t.a}: ${t.key}`).join('\n')}

Provide an updated summary in 2-3 sentences. Focus on key decisions and current state.
    `.trim();

    // Use fast/cheap model for summarization
    const response = await this.callSummarizer(prompt);
    return response.slice(0, this.maxSummaryTokens * 4);  // ~4 chars per token
  }
}
```

### Selective Context Routing

Not all agents need all context. Route based on role.

```typescript
interface ContextRoutingRules {
  [role: string]: {
    includeSummary: boolean;
    includeRecentTurns: number;
    includeParticipantList: boolean;
    additionalContext?: string[];
  };
}

const defaultRoutingRules: ContextRoutingRules = {
  'expert': {
    includeSummary: true,
    includeRecentTurns: 5,
    includeParticipantList: false,
    additionalContext: ['domain_context'],
  },
  'synthesizer': {
    includeSummary: true,
    includeRecentTurns: 10,
    includeParticipantList: true,
  },
  'critic': {
    includeSummary: false,
    includeRecentTurns: 1,  // Only needs the response being critiqued
    includeParticipantList: false,
  },
};

function routeContext(
  fullContext: CompactContext,
  agentRole: string,
  rules: ContextRoutingRules
): CompactContext {
  const rule = rules[agentRole] || rules['expert'];

  return {
    sum: rule.includeSummary ? fullContext.sum : '',
    last: fullContext.last.slice(-rule.includeRecentTurns),
    topic: fullContext.topic,
    goal: fullContext.goal,
    participants: rule.includeParticipantList ? fullContext.participants : [],
  };
}
```

---

## Reliability Patterns

### Timeout Cascade

Set cascading timeouts to ensure overall operation completes.

```typescript
interface TimeoutConfig {
  overall: number;      // Total operation timeout
  bid: number;          // Per-agent bid timeout
  response: number;     // Per-agent response timeout
  summary: number;      // Summarization timeout
}

const defaultTimeouts: TimeoutConfig = {
  overall: 60000,       // 60 seconds total
  bid: 500,             // 500ms to bid
  response: 30000,      // 30s to respond
  summary: 5000,        // 5s to summarize
};

async function withCascadingTimeout<T>(
  operation: () => Promise<T>,
  config: TimeoutConfig,
  operationType: keyof TimeoutConfig
): Promise<T> {
  const timeout = config[operationType];

  return Promise.race([
    operation(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(operationType, timeout)), timeout)
    ),
  ]);
}
```

### Circuit Breaker

Prevent cascading failures when an agent/provider is struggling.

```typescript
class CircuitBreaker {
  private failures: Map<string, number> = new Map();
  private lastFailure: Map<string, number> = new Map();
  private state: Map<string, 'closed' | 'open' | 'half-open'> = new Map();

  private readonly threshold = 5;
  private readonly resetTimeout = 30000;  // 30 seconds

  async call<T>(
    agentId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const state = this.state.get(agentId) || 'closed';

    if (state === 'open') {
      const lastFail = this.lastFailure.get(agentId) || 0;
      if (Date.now() - lastFail > this.resetTimeout) {
        this.state.set(agentId, 'half-open');
      } else {
        throw new CircuitOpenError(agentId);
      }
    }

    try {
      const result = await operation();
      this.onSuccess(agentId);
      return result;
    } catch (error) {
      this.onFailure(agentId);
      throw error;
    }
  }

  private onSuccess(agentId: string): void {
    this.failures.set(agentId, 0);
    this.state.set(agentId, 'closed');
  }

  private onFailure(agentId: string): void {
    const failures = (this.failures.get(agentId) || 0) + 1;
    this.failures.set(agentId, failures);
    this.lastFailure.set(agentId, Date.now());

    if (failures >= this.threshold) {
      this.state.set(agentId, 'open');
    }
  }
}
```

### Retry with Exponential Backoff

```typescript
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  retryableErrors: ['TIMEOUT', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE'],
};

async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = defaultRetryConfig
): Promise<T> {
  let lastError: Error | null = null;
  let delay = config.initialDelayMs;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      const isRetryable = config.retryableErrors.some(
        code => (error as any).code === code
      );

      if (!isRetryable || attempt === config.maxRetries) {
        throw error;
      }

      await sleep(delay + Math.random() * 100);  // Add jitter
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
    }
  }

  throw lastError;
}
```

---

## Cost Optimization

### Model Selection Based on Task

```typescript
interface ModelSelectionStrategy {
  summarization: ModelConfig;
  bidding: ModelConfig;
  simpleResponse: ModelConfig;
  complexResponse: ModelConfig;
  synthesis: ModelConfig;
}

const modelStrategy: ModelSelectionStrategy = {
  summarization: {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',  // Fast, cheap
    maxTokens: 500,
  },
  bidding: {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',  // Speed critical
    maxTokens: 100,
  },
  simpleResponse: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',  // Balanced
    maxTokens: 1000,
  },
  complexResponse: {
    provider: 'anthropic',
    model: 'claude-opus-4-5-20251101',  // Best quality
    maxTokens: 4000,
  },
  synthesis: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',  // Good at combining
    maxTokens: 2000,
  },
};

function selectModel(
  taskComplexity: number,  // 0-1
  taskType: keyof ModelSelectionStrategy
): ModelConfig {
  // Override based on complexity
  if (taskComplexity > 0.8 && taskType === 'simpleResponse') {
    return modelStrategy.complexResponse;
  }

  return modelStrategy[taskType];
}
```

### Token Budget Enforcement

```typescript
class TokenBudgetEnforcer {
  private used: Map<string, number> = new Map();

  constructor(
    private conversationBudget: number,
    private perAgentBudget: number
  ) {}

  canProceed(agentId: string, estimatedTokens: number): boolean {
    const agentUsed = this.used.get(agentId) || 0;
    const totalUsed = Array.from(this.used.values()).reduce((a, b) => a + b, 0);

    return (
      agentUsed + estimatedTokens <= this.perAgentBudget &&
      totalUsed + estimatedTokens <= this.conversationBudget
    );
  }

  record(agentId: string, tokens: number): void {
    const current = this.used.get(agentId) || 0;
    this.used.set(agentId, current + tokens);
  }

  getRemainingBudget(): { conversation: number; byAgent: Map<string, number> } {
    const totalUsed = Array.from(this.used.values()).reduce((a, b) => a + b, 0);
    const byAgent = new Map<string, number>();

    for (const [agent, used] of this.used) {
      byAgent.set(agent, this.perAgentBudget - used);
    }

    return {
      conversation: this.conversationBudget - totalUsed,
      byAgent,
    };
  }
}
```

### Early Termination Detection

```typescript
interface TerminationSignals {
  explicit: string[];       // Phrases indicating completion
  consensus: boolean;       // Agents agree on conclusion
  goalAchieved: boolean;    // Original goal satisfied
  stagnation: boolean;      // No new information being added
}

class TerminationDetector {
  private recentResponses: string[] = [];
  private readonly stagnationThreshold = 3;

  detectTermination(
    response: BTSMessage,
    context: CompactContext,
    allAgentsResponded: boolean
  ): TerminationSignals {
    const content = response.p.content?.toLowerCase() || '';

    // Check explicit completion phrases
    const explicitPhrases = [
      'we have reached a conclusion',
      'the task is complete',
      'final answer:',
      'in summary, we agree',
      'this concludes our discussion',
    ];

    const explicit = explicitPhrases.filter(phrase =>
      content.includes(phrase)
    );

    // Check for stagnation (similar content repeated)
    this.recentResponses.push(content);
    if (this.recentResponses.length > this.stagnationThreshold) {
      this.recentResponses.shift();
    }

    const stagnation = this.detectStagnation();

    // Goal achievement would require more sophisticated NLU
    // Placeholder: check if response mentions goal completion
    const goalAchieved = content.includes(context.goal.toLowerCase());

    return {
      explicit,
      consensus: explicit.length > 0 && allAgentsResponded,
      goalAchieved,
      stagnation,
    };
  }

  private detectStagnation(): boolean {
    if (this.recentResponses.length < this.stagnationThreshold) {
      return false;
    }

    // Simple: check if responses are very similar
    // In production: use embedding similarity
    const first = this.recentResponses[0];
    return this.recentResponses.every(
      r => this.stringSimilarity(r, first) > 0.8
    );
  }

  private stringSimilarity(a: string, b: string): number {
    // Jaccard similarity on words
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.size / union.size;
  }
}
```

---

## Monitoring & Observability

### Metrics to Track

```typescript
interface BTSMetrics {
  // Latency
  turnLatencyMs: Histogram;
  bidCollectionLatencyMs: Histogram;
  contextUpdateLatencyMs: Histogram;

  // Throughput
  turnsPerSecond: Gauge;
  messagesProcessed: Counter;

  // Quality
  bidWinDistribution: Histogram;      // Which agents win most often
  averageConfidenceScore: Gauge;
  earlyTerminationRate: Gauge;

  // Errors
  timeoutCount: Counter;
  circuitBreakerTrips: Counter;
  retryCount: Counter;

  // Cost
  tokensConsumedByModel: Counter;
  estimatedCostUsd: Gauge;
}

// OpenTelemetry instrumentation
const tracer = trace.getTracer('macp-bts');

async function instrumentedTurn(
  orchestrator: BTSOrchestrator,
  context: CompactContext
): Promise<BTSMessage> {
  return tracer.startActiveSpan('bts.turn', async (span) => {
    span.setAttribute('conversation.id', context.conversationId);
    span.setAttribute('turn.number', context.currentTurn);

    try {
      const startTime = Date.now();

      // Bid collection span
      const bids = await tracer.startActiveSpan('bts.collect_bids', async (bidSpan) => {
        const result = await orchestrator.collectBids(context);
        bidSpan.setAttribute('bids.count', result.size);
        return result;
      });

      // Response span
      const response = await tracer.startActiveSpan('bts.get_response', async (respSpan) => {
        const result = await orchestrator.getWinnerResponse(bids, context);
        respSpan.setAttribute('response.tokens', result.p.meta?.tokens.out);
        respSpan.setAttribute('response.agent', result.a);
        return result;
      });

      span.setAttribute('turn.latency_ms', Date.now() - startTime);
      span.setStatus({ code: SpanStatusCode.OK });

      return response;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      throw error;
    }
  });
}
```

---

## Best Practices Summary

### Do

1. **Use structured outputs (JSON mode)** - Reliable parsing, lower token usage
2. **Implement cascading timeouts** - Overall > individual operation timeouts
3. **Track tokens obsessively** - Budget per agent, per conversation
4. **Use Redis Streams for transport** - Fast, reliable, observable
5. **Summarize aggressively** - Keep context small, update frequently
6. **Implement circuit breakers** - One failing agent shouldn't kill everything
7. **Detect early termination** - Don't waste tokens on concluded conversations
8. **Use fast models for bidding** - Haiku-class for speed-critical operations
9. **Parallelize where possible** - Fan-out queries, parallel bids
10. **Add jitter to retries** - Prevent thundering herd

### Don't

1. **Don't pass full history** - Use summaries + recent turns
2. **Don't wait for slow agents** - Timeout and skip
3. **Don't retry forever** - Circuit break after threshold
4. **Don't use expensive models for simple tasks** - Match model to task
5. **Don't ignore cost** - Track and enforce budgets
6. **Don't trust agent self-reporting** - Verify claims, track actual behavior
7. **Don't serialize unnecessarily** - Stream where possible
8. **Don't log full responses in production** - Sample or summarize
9. **Don't hard-code timeouts** - Make configurable per conversation type
10. **Don't forget idempotency** - Retries must be safe

---

## Example: Complete P2P Conversation

```typescript
// p2p-conversation.ts

async function runP2PConversation(
  agent1: AgentConfig,
  agent2: AgentConfig,
  topic: string,
  goal: string
): Promise<P2PResult> {
  const orchestrator = new BTSOrchestrator({
    transport: new RedisTransport(redis),
    biddingEngine: new BiddingEngine(),
    contextManager: new ContextManager(),
    budgetEnforcer: new TokenBudgetEnforcer(50000, 25000),
    terminationDetector: new TerminationDetector(),
  });

  const conversation = await orchestrator.createConversation({
    mode: 'rapid',
    topology: 'linear',
    participants: [agent1.id, agent2.id],
  });

  let context: CompactContext = {
    conversationId: conversation.id,
    currentTurn: 0,
    sum: '',
    last: [],
    topic,
    goal,
    participants: [agent1.id, agent2.id],
  };

  const turns: BTSMessage[] = [];
  const maxTurns = 20;

  // Opening: Agent 1 starts
  const opening = await orchestrator.requestTurn(agent1.id, context);
  turns.push(opening);
  context = await orchestrator.contextManager.updateContext(context, opening);

  // Main loop: Bidding-based turns
  while (context.currentTurn < maxTurns) {
    context.currentTurn++;

    // Check budget
    if (!orchestrator.budgetEnforcer.canProceed('any', 2000)) {
      break;
    }

    // Get next turn via bidding
    const turn = await biddingBasedTurn(orchestrator, [agent1.id, agent2.id], context);
    turns.push(turn);

    // Update context
    context = await orchestrator.contextManager.updateContext(context, turn);

    // Record usage
    orchestrator.budgetEnforcer.record(turn.a, turn.p.meta?.tokens.out || 0);

    // Check for termination
    const termination = orchestrator.terminationDetector.detectTermination(
      turn,
      context,
      true
    );

    if (termination.consensus || termination.goalAchieved || termination.stagnation) {
      break;
    }
  }

  return {
    conversationId: conversation.id,
    turns,
    finalSummary: context.sum,
    totalTokens: orchestrator.budgetEnforcer.getRemainingBudget(),
    terminationReason: 'goal_achieved',  // or 'max_turns', 'budget', etc.
  };
}
```

---

*This protocol is optimized for the "behind the scenes" use case. For human-facing "campfire" mode, add artificial delays, streaming updates, and richer formatting.*
