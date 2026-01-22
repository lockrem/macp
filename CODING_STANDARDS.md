# MACP - Coding Standards

## Table of Contents
1. [File Organization](#file-organization)
2. [Extension Separation](#extension-separation)
3. [Naming Conventions](#naming-conventions)
4. [Code Structure](#code-structure)
5. [TypeScript Best Practices](#typescript-best-practices)
6. [State Management](#state-management)
7. [Error Handling](#error-handling)
8. [Comments and Documentation](#comments-and-documentation)
9. [Code Reusability](#code-reusability)
10. [Testing](#testing)

---

## File Organization

### One Type Per File
- Each class, interface, or major type should be in its own file
- File name must match the primary export (e.g., `BiddingEngine.ts` contains `class BiddingEngine`)
- Exception: Tightly coupled helper types may share a file (e.g., config interfaces)

### File Length
- Maximum 400 lines per file
- If a module exceeds 400 lines, break into smaller components
- Extract utilities, helpers, and sub-components into separate files

### Import Order
```typescript
// 1. Node.js built-ins
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

// 2. External packages
import { Redis } from 'ioredis';
import { z } from 'zod';

// 3. Internal packages (workspace)
import type { Agent, Conversation } from '@macp/shared';

// 4. Relative imports (same package)
import { BiddingEngine } from './bidding-engine.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
```

### File Extensions
- Always use `.js` extension in import statements (required for ESM)
- TypeScript files use `.ts` extension
- Test files use `.test.ts` suffix

---

## Extension Separation

### Core Principle
When multiple use cases (P2P, Expert Collaboration, Social) exist, **apply separation at a high architectural level** rather than supporting all options within the same classes.

### Why This Matters
- Each use case has unique orchestration patterns, UI requirements, and data models
- Mixed use case logic creates complexity and reduces maintainability
- Use case-specific code should be isolated for easier testing and modification
- Allows independent evolution of each use case's features
- Enables teams to work on different extensions without conflicts

### Rules

#### ✅ DO: Separate by Use Case at Package Level
```
packages/
├── core/                         # Shared orchestration primitives
│   ├── src/
│   │   ├── orchestrator/
│   │   ├── adapters/
│   │   └── transport/
├── p2p/                          # P2P-specific implementation
│   ├── src/
│   │   ├── P2PConversation.ts
│   │   ├── P2POrchestrator.ts
│   │   └── P2PConfig.ts
├── expert/                       # Expert collaboration extension
│   ├── src/
│   │   ├── ExpertNetwork.ts
│   │   ├── ConsensusBuilder.ts
│   │   └── ExpertDiscovery.ts
└── social/                       # Social agent extension
    ├── src/
    │   ├── SocialHub.ts
    │   ├── CheckInScheduler.ts
    │   └── UpdateAggregator.ts
```

#### ✅ DO: Use Factory Pattern for Use Case Selection
```typescript
// packages/core/src/factory.ts
export function createConversation(
  type: 'p2p' | 'expert' | 'social',
  config: ConversationConfig
): Conversation {
  switch (type) {
    case 'p2p':
      return new P2PConversation(config);
    case 'expert':
      return new ExpertConversation(config);
    case 'social':
      return new SocialConversation(config);
    default:
      throw new Error(`Unknown conversation type: ${type}`);
  }
}
```

#### ✅ DO: Keep Core Services Use Case-Agnostic
```typescript
// Core services should handle all use cases generically
class BiddingEngine {
  evaluateBids(
    bids: Map<string, Bid>,
    state: ConversationState,
    stats: Map<string, ParticipantStats>
  ): BidResult {
    // Works for P2P, Expert, Social
  }
}
```

#### ✅ DO: Name Files by Use Case
```typescript
// Good
P2PConversation.ts
ExpertOrchestrator.ts
SocialCheckIn.ts

// Avoid
Conversation.ts  // Which use case?
```

#### ❌ DON'T: Mix Use Case Logic in Core Components
```typescript
// Bad - conditional use case logic in core
class Orchestrator {
  processNextTurn() {
    if (this.type === 'p2p') {
      // P2P logic
    } else if (this.type === 'expert') {
      // Expert logic - use extension instead
    }
  }
}

// Good - use case-specific classes
class P2POrchestrator extends BaseOrchestrator {
  processNextTurn() {
    // P2P-specific logic
  }
}
```

### When to Apply Separation

**Separate if**:
- Use case has unique orchestration patterns (P2P linear vs Expert parallel)
- Use case has unique domain rules (consensus mechanisms, scheduling)
- Use case has unique user interactions (real-time vs async)
- Use case uses different terminology ("conversation" vs "consultation" vs "check-in")

**Keep shared if**:
- Logic applies to all use cases (bidding algorithm, context management)
- Component is truly universal (adapters, transport, auth)
- Service handles generic data operations

### Adding New Extensions

With proper separation, adding a new extension is straightforward:

```typescript
1. Create packages/gaming/
   - GamingConversation.ts
   - TurnBasedOrchestrator.ts

2. Create use case-specific types
   - GameState.ts
   - PlayerAction.ts

3. Update factory
   - Add case 'gaming' to createConversation

4. No changes needed to:
   - Core orchestrator
   - Bidding engine
   - Adapters
   - Transport
```

---

## Naming Conventions

### Files and Directories
- **Files**: kebab-case (e.g., `bidding-engine.ts`, `context-manager.ts`)
- **Directories**: kebab-case (e.g., `agent-adapters/`, `error-handling/`)
- **Test files**: Same name with `.test.ts` suffix (e.g., `bidding-engine.test.ts`)

### Classes and Interfaces
- **Classes**: PascalCase (e.g., `BiddingEngine`, `ContextManager`)
- **Interfaces**: PascalCase, no `I` prefix (e.g., `Agent`, `Conversation`)
- **Type aliases**: PascalCase (e.g., `AgentProvider`, `ConversationMode`)

### Functions and Methods
- Use verb phrases (e.g., `evaluateBids()`, `processNextTurn()`, `updateContext()`)
- Boolean returning: Use `is`, `has`, `should`, `can` prefix (e.g., `isConnected()`, `canProceed()`)
- Factory methods: Use `create` prefix (e.g., `createAdapter()`, `createConversation()`)
- Async methods: No special suffix (async is in signature)

### Variables and Constants
- **Variables**: camelCase (e.g., `bidTimeout`, `maxRetries`)
- **Boolean**: Use `is`, `has`, `should`, `can` prefix (e.g., `isLoading`, `hasError`)
- **Collections**: Use plural (e.g., `bids`, `participants`, `messages`)
- **Constants**: camelCase, not SCREAMING_SNAKE_CASE (e.g., `defaultTimeout`, not `DEFAULT_TIMEOUT`)
- **Private properties**: No underscore prefix (use `private` keyword)

### Enums
- Enum name: PascalCase singular (e.g., `AgentStatus`, `MessageType`)
- Enum values: snake_case (e.g., `turn_response`, `bid_submission`)

```typescript
// Good
enum ConversationMode {
  rapid = 'rapid',
  campfire = 'campfire',
  moderated = 'moderated',
  async = 'async',
}

// Avoid
enum CONVERSATION_MODES {
  RAPID = 'RAPID',
}
```

---

## Code Structure

### Composition Over Inheritance
- **Prefer interfaces and composition over class inheritance**
- Use interface extensions for shared behavior
- Create small, reusable modules that can be combined

**Good:**
```typescript
interface BidEvaluator {
  evaluateBids(bids: Map<string, Bid>): BidResult;
}

interface ContextProvider {
  getContext(): CompactContext;
  updateContext(turn: BTSMessage): Promise<CompactContext>;
}

class Orchestrator implements BidEvaluator, ContextProvider {
  // Implements both interfaces
}
```

**Avoid:**
```typescript
class BaseOrchestrator {
  evaluateBids() { /* base impl */ }
}

class P2POrchestrator extends BaseOrchestrator {
  override evaluateBids() { /* override */ }
}

class ExpertOrchestrator extends P2POrchestrator {
  override evaluateBids() { /* override again - getting complex */ }
}
```

### Small, Focused Classes
- Each class should have a single, well-defined responsibility
- Maximum 10 public methods per class
- Maximum 15 properties per class
- If exceeded, split into multiple focused types

### Function Structure
- Maximum 50 lines per function
- Single level of abstraction per function
- Extract complex logic into helper functions

**Good:**
```typescript
async processNextTurn(context: CompactContext): Promise<BTSMessage> {
  const bids = await this.collectBids(context);
  const winner = this.evaluateBids(bids);
  const response = await this.requestResponse(winner, context);
  return this.createMessage(response, winner);
}

private async collectBids(context: CompactContext): Promise<Map<string, Bid>> {
  // Focused on bid collection
}

private evaluateBids(bids: Map<string, Bid>): BidResult {
  // Focused on evaluation
}
```

**Avoid:**
```typescript
async processNextTurn(context: CompactContext): Promise<BTSMessage> {
  // 200 lines of mixed logic
}
```

---

## TypeScript Best Practices

### Explicit Types
- Always declare explicit return types for public functions
- Use explicit types for function parameters
- Let TypeScript infer types for simple local variables

```typescript
// Good - explicit for public API
export function evaluateBids(
  bids: Map<string, Bid>,
  state: ConversationState
): BidResult {
  const scores = new Map<string, number>(); // Inferred is fine here
  // ...
}

// Avoid - implicit return type on public function
export function evaluateBids(bids, state) {
  // No types!
}
```

### Prefer Interfaces Over Type Aliases for Objects
```typescript
// Good - interface for object shapes
interface Agent {
  id: string;
  name: string;
  capabilities: AgentCapability[];
}

// Good - type alias for unions/primitives
type AgentProvider = 'anthropic' | 'openai' | 'google';
type AgentId = string;

// Avoid - type alias for object shapes (use interface)
type Agent = {
  id: string;
  name: string;
};
```

### Use `unknown` Over `any`
```typescript
// Good
async function parseResponse(data: unknown): Promise<ParsedData> {
  if (isValidResponse(data)) {
    return data as ParsedData;
  }
  throw new Error('Invalid response');
}

// Avoid
async function parseResponse(data: any): Promise<ParsedData> {
  return data; // No type safety
}
```

### Null Handling
- Prefer `undefined` over `null` for optional values
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Avoid non-null assertions (`!`) except in tests

```typescript
// Good
const name = agent?.displayName ?? 'Unknown';

// Avoid
const name = agent!.displayName || 'Unknown';
```

---

## State Management

### Observable Objects
- Use classes with explicit state for complex state management
- Emit events for state changes when needed
- Keep state mutations in dedicated methods

```typescript
class ConversationState extends EventEmitter {
  private _currentTurn: number = 0;
  private _status: ConversationStatus = 'active';

  get currentTurn(): number {
    return this._currentTurn;
  }

  advanceTurn(): void {
    this._currentTurn++;
    this.emit('turn_advanced', this._currentTurn);
  }
}
```

### Immutable Data
- Prefer immutable patterns for data structures
- Use spread operators for updates
- Don't mutate arrays or objects directly

```typescript
// Good
function updateContext(context: CompactContext, turn: TurnRef): CompactContext {
  return {
    ...context,
    currentTurn: context.currentTurn + 1,
    last: [...context.last.slice(-4), turn],
  };
}

// Avoid
function updateContext(context: CompactContext, turn: TurnRef): CompactContext {
  context.currentTurn++;
  context.last.push(turn);
  return context;
}
```

---

## Error Handling

### Error Types
- Define specific error classes for each domain
- Extend a base error class for consistency
- Include error codes and HTTP status codes

```typescript
// packages/shared/src/errors.ts

export class MACPError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
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

export class BudgetExceededError extends MACPError {
  constructor(budgetType: 'conversation' | 'agent', limit: number, used: number) {
    super(
      `${budgetType} token budget exceeded: ${used}/${limit}`,
      'BUDGET_EXCEEDED',
      429
    );
  }
}
```

### Error Propagation
- Use `throws` for synchronous recoverable errors
- Use `Promise.reject` or `throw` in async functions
- Log errors at the boundary, not at every level

### User-Facing Errors
- Always provide clear, actionable error messages
- Never expose internal details (stack traces, SQL queries)
- Include error codes for debugging

---

## Comments and Documentation

### When to Comment
- **Do comment**: Complex algorithms, business logic, workarounds, non-obvious decisions
- **Don't comment**: Self-evident code, redundant descriptions

**Good:**
```typescript
// Calculate recency penalty to prevent one agent from dominating
// Agents who spoke recently get penalized, encouraging turn variety
private calculateRecencyPenalty(
  stats: ParticipantStats,
  currentTurn: number
): number {
  // ...
}
```

**Avoid:**
```typescript
// This function gets the agent ID
function getAgentId(): string {
  return this.agentId; // Return the agent ID
}
```

### JSDoc Documentation
- Use JSDoc for public API documentation
- Include parameter descriptions for non-obvious parameters
- Document return values and thrown errors

```typescript
/**
 * Evaluates collected bids and determines the winner using a multi-factor
 * scoring algorithm with fairness constraints.
 *
 * @param bids - Map of agent IDs to their submitted bids
 * @param state - Current conversation state
 * @param stats - Participation statistics per agent
 * @returns The bid result including winner and all scores
 * @throws {Error} If no valid bids are received
 */
evaluateBids(
  bids: Map<string, Bid>,
  state: ConversationState,
  stats: Map<string, ParticipantStats>
): BidResult {
  // ...
}
```

### Section Comments
- Use `// ----` separators for major sections within a file

```typescript
// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

interface BiddingConfig {
  // ...
}

// -----------------------------------------------------------------------------
// Bidding Engine
// -----------------------------------------------------------------------------

export class BiddingEngine {
  // ...
}
```

---

## Code Reusability

### Extract Reusable Components
- If a pattern appears 3+ times, extract it
- Create generic utilities when possible
- Use interfaces for flexible reusability

### Shared Utilities
- Place in dedicated `utils/` folder
- Group related functionality
- Make utilities pure functions when possible

```typescript
// packages/shared/src/utils/scoring.ts

export function clampScore(value: number, min: number = 0, max: number = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeScores(scores: number[]): number[] {
  const total = scores.reduce((sum, s) => sum + s, 0);
  return total > 0 ? scores.map(s => s / total) : scores;
}
```

### Shared Constants
- Define magic numbers and strings as constants
- Group related constants in objects

```typescript
// packages/shared/src/constants.ts

export const BiddingDefaults = {
  bidTimeoutMs: 1000,
  responseTimeoutMs: 30000,
  cooldownTurns: 3,
  maxConsecutiveTurns: 2,
} as const;

export const TokenLimits = {
  defaultConversationBudget: 50000,
  defaultPerAgentBudget: 25000,
  summaryMaxTokens: 500,
} as const;
```

---

## Testing

### Test File Organization
- Test files live next to source files
- Use `.test.ts` suffix
- Group tests by function/method

```typescript
// bidding-engine.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { BiddingEngine } from './bidding-engine.js';

describe('BiddingEngine', () => {
  let engine: BiddingEngine;

  beforeEach(() => {
    engine = new BiddingEngine();
  });

  describe('evaluateBids', () => {
    it('should select the highest scoring agent', () => {
      // ...
    });

    it('should apply recency penalty to recent speakers', () => {
      // ...
    });

    it('should throw when no valid bids received', () => {
      // ...
    });
  });
});
```

### Test Naming
- Use descriptive test names that explain the scenario
- Follow "should [expected behavior] when [condition]" pattern

```typescript
// Good
it('should apply participation bonus to underrepresented agents', () => {});
it('should throw TimeoutError when bid collection exceeds deadline', () => {});

// Avoid
it('test1', () => {});
it('works', () => {});
```

### Mock Dependencies
- Use dependency injection for testability
- Create mock implementations using interfaces
- Avoid mocking internal implementation details

---

## Version Control

### Commit Messages
- Use conventional commit format: `type(scope): message`
- Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`
- Examples:
  - `feat(bidding): add participation balance scoring`
  - `fix(transport): handle redis connection timeout`
  - `refactor(orchestrator): extract context management`

### Pull Requests
- Keep PRs focused and small (< 400 lines when possible)
- Include description of changes and testing performed
- Reference related issues

---

## Summary

These coding standards prioritize:
1. **Clarity**: Code should be self-documenting and easy to understand
2. **Maintainability**: Small, focused, testable components
3. **Reusability**: Extract common patterns, avoid duplication
4. **Composition**: Prefer interfaces and composition over inheritance
5. **Type Safety**: Leverage TypeScript's type system fully
6. **Separation**: Keep use case-specific code isolated from core

By following these standards, the MACP codebase will remain clean, scalable, and maintainable as it grows.
