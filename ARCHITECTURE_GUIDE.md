# MACP - Architecture Guide

## Table of Contents
1. [Overview](#overview)
2. [Architectural Principles](#architectural-principles)
3. [Project Structure](#project-structure)
4. [Layer Responsibilities](#layer-responsibilities)
5. [Data Flow](#data-flow)
6. [Package Organization](#package-organization)
7. [Dependency Management](#dependency-management)
8. [Scalability Guidelines](#scalability-guidelines)

---

## Overview

The MACP (Multi-Agent Communication Platform) follows a **modular, layered architecture** that emphasizes:
- Clear separation of concerns
- **Extension separation at the package level**
- Composition over inheritance
- Unidirectional data flow
- Maximum code reusability
- Scalability for multiple use cases (P2P, Expert, Social)

### Core Architecture Pattern
- **Service-Oriented Architecture** with TypeScript
- **Event-driven communication** via Redis Streams
- **Adapter pattern** for AI provider abstraction
- **Protocol-oriented design** for flexibility and testability
- **Factory pattern** for extension selection

---

## Architectural Principles

### 1. Single Responsibility Principle (SRP)
- Each file, class, and function has ONE clear purpose
- If you can't describe a component's purpose in one sentence, it's doing too much
- Split large components into smaller, focused pieces

### 2. Composition Over Inheritance
- Favor interfaces and composition over class hierarchies
- Use interface implementations for shared behavior
- Create small, reusable components that can be combined

**Example:**
```typescript
// Good: Interface composition
interface BidEvaluator {
  evaluateBids(bids: Map<string, Bid>): BidResult;
}

interface ContextManager {
  updateContext(turn: BTSMessage): Promise<CompactContext>;
}

class Orchestrator implements BidEvaluator, ContextManager {
  // Implements both interfaces
}

// Avoid: Deep inheritance
class BaseOrchestrator { }
class P2POrchestrator extends BaseOrchestrator { }
class AdvancedP2POrchestrator extends P2POrchestrator { }
```

### 3. Dependency Inversion Principle (DIP)
- High-level modules should not depend on low-level modules
- Both should depend on abstractions (interfaces)
- Inject dependencies rather than creating them internally

### 4. Interface Segregation Principle (ISP)
- Many small, focused interfaces are better than one large interface
- Don't force types to implement methods they don't need

### 5. Open/Closed Principle (OCP)
- Open for extension, closed for modification
- Use interfaces and composition to add functionality
- Avoid modifying existing, working code

### 6. Don't Repeat Yourself (DRY)
- Extract common code into reusable components
- If code appears 3+ times, refactor it
- Create shared utilities and helper functions

### 7. Extension Separation
- Separate by use case (P2P, Expert, Social) at the package level
- Each use case has its own package under `packages/`
- Avoid conditional use case logic in core components
- Use factory pattern for use case selection
- Keep core services use case-agnostic

**Why this matters**:
- Each use case has unique orchestration requirements
- Enables independent development and testing per use case
- Allows teams to work on different extensions without conflicts
- Makes adding new use cases straightforward

**Example:**
```typescript
// Good: Extension-specific packages
packages/
├── core/                    // Shared primitives
├── api/                     // API server (REST, WebSocket, auth)
├── expert/ExpertNetwork.ts  // Expert-specific (future)
└── social/SocialHub.ts      // Social-specific (future)

// Bad: Mixed use case logic
class Orchestrator {
  if (useCase === 'p2p') {
    // P2P logic
  } else if (useCase === 'expert') {
    // Expert logic
  }
}
```

---

## Project Structure

### Monorepo Hierarchy

```
macp/
├── package.json                    # Root package config (pnpm workspaces)
├── pnpm-workspace.yaml             # Workspace definition
├── turbo.json                      # Build pipeline config
├── tsconfig.json                   # Base TypeScript config
│
├── packages/
│   ├── shared/                     # Shared types and utilities
│   │   ├── src/
│   │   │   ├── types/              # Core type definitions
│   │   │   │   └── index.ts        # Agent, Conversation, Message, etc.
│   │   │   ├── errors/             # Error classes
│   │   │   │   └── index.ts        # MACPError, TimeoutError, etc.
│   │   │   ├── utils/              # Shared utilities
│   │   │   │   ├── scoring.ts      # Score calculations
│   │   │   │   └── validation.ts   # Input validation
│   │   │   ├── constants.ts        # Shared constants
│   │   │   └── index.ts            # Package exports
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── core/                       # Core orchestration primitives
│   │   ├── src/
│   │   │   ├── orchestrator/       # Turn management
│   │   │   │   ├── orchestrator.ts
│   │   │   │   ├── bidding-engine.ts
│   │   │   │   └── context-manager.ts
│   │   │   ├── adapters/           # AI provider adapters
│   │   │   │   ├── base-adapter.ts
│   │   │   │   ├── claude-adapter.ts
│   │   │   │   └── openai-adapter.ts
│   │   │   ├── transport/          # Communication layer
│   │   │   │   └── bts-transport.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── p2p/                        # P2P extension
│   │   ├── src/
│   │   │   ├── p2p-conversation.ts # Main P2P runner
│   │   │   ├── p2p-config.ts       # P2P-specific config
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── expert/                     # Expert collaboration extension
│   │   ├── src/
│   │   │   ├── expert-network.ts   # Multi-expert coordination
│   │   │   ├── consensus-builder.ts
│   │   │   ├── expert-discovery.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── social/                     # Social agent extension
│       ├── src/
│       │   ├── social-hub.ts       # Social network coordinator
│       │   ├── check-in-scheduler.ts
│       │   ├── update-aggregator.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── infrastructure/                 # AWS CDK deployment
│   ├── bin/
│   │   └── macp.ts                 # CDK app entry
│   ├── lib/
│   │   └── stacks/                 # CDK stacks
│   │       ├── vpc-stack.ts
│   │       ├── data-stack.ts
│   │       ├── compute-stack.ts
│   │       └── api-stack.ts
│   ├── package.json
│   └── cdk.json
│
├── apps/
│   └── api/                        # REST/WebSocket API server
│       ├── src/
│       │   ├── routes/
│       │   ├── middleware/
│       │   ├── websocket/
│       │   └── server.ts
│       ├── package.json
│       └── tsconfig.json
│
├── docs/                           # Documentation
│   ├── ARCHITECTURE.md
│   ├── CODING_STANDARDS.md
│   ├── TECHNICAL_SPEC.md
│   └── AWS_ARCHITECTURE.md
│
└── scripts/                        # Development scripts
    ├── setup.sh
    └── test-conversation.ts
```

---

## Layer Responsibilities

### 1. Shared Layer (`@macp/shared`)
**Purpose**: Define types, interfaces, errors, and utilities shared across all packages

**Responsibilities**:
- Define domain models (Agent, Conversation, Message, etc.)
- Define error types (MACPError, TimeoutError, etc.)
- Provide utility functions (scoring, validation)
- Define constants

**Rules**:
- No dependencies on other `@macp/*` packages
- No business logic
- No external service calls
- Types are interfaces/types, not classes (except errors)

**Example**:
```typescript
// packages/shared/src/types/index.ts
export interface Agent {
  id: string;
  ownerId: string;
  displayName: string;
  provider: AgentProvider;
  capabilities: AgentCapability[];
}

export interface Conversation {
  id: string;
  mode: ConversationMode;
  participants: Participant[];
  state: ConversationState;
}
```

### 2. Core Layer (`@macp/core`)
**Purpose**: Provide the foundational building blocks for agent communication

**Responsibilities**:
- Orchestrator: Turn management, state machine
- Bidding Engine: Score calculation, winner selection
- Context Manager: Summary generation, context routing
- Adapters: AI provider abstraction (Claude, OpenAI)
- Transport: Redis Streams communication

**Rules**:
- May depend on `@macp/shared`
- No use case-specific logic (P2P, Expert, Social)
- Exports abstract base classes and interfaces
- Configurable via dependency injection

**Example**:
```typescript
// packages/core/src/orchestrator/orchestrator.ts
export class Orchestrator extends EventEmitter {
  constructor(
    private conversation: Conversation,
    private transport: BTSTransport,
    private config: OrchestratorConfig
  ) {
    super();
  }

  async processNextTurn(context: CompactContext): Promise<BTSMessage> {
    const bids = await this.collectBids(context);
    const winner = this.evaluateBids(bids);
    const response = await this.requestResponse(winner, context);
    return this.createMessage(response, winner);
  }
}
```

### 3. Extension Layer (`@macp/p2p`, `@macp/expert`, `@macp/social`)
**Purpose**: Implement use case-specific orchestration and business logic

**Responsibilities**:
- Use case-specific conversation runners
- Custom orchestration patterns
- Domain-specific configurations
- Integration logic

**Rules**:
- May depend on `@macp/shared` and `@macp/core`
- Self-contained for their use case
- Export high-level APIs for consumers
- May have use case-specific types

**Example**:
```typescript
// packages/p2p/src/p2p-conversation.ts
export class P2PConversationRunner {
  async run(): Promise<P2PConversationResult> {
    // P2P-specific orchestration
    const conversation = this.createConversation();
    const orchestrator = this.createOrchestrator(conversation);

    while (this.canContinue()) {
      const turn = await orchestrator.processNextTurn(context);
      // P2P-specific handling
    }

    return this.buildResult();
  }
}
```

### 4. Infrastructure Layer (`infrastructure/`)
**Purpose**: Define AWS deployment resources

**Responsibilities**:
- VPC and networking
- ECS/Fargate services
- Aurora PostgreSQL, ElastiCache
- API Gateway, Cognito
- Monitoring and logging

**Rules**:
- Uses AWS CDK
- Environment-specific configurations
- No business logic

### 5. Application Layer (`apps/`)
**Purpose**: Expose APIs and user interfaces

**Responsibilities**:
- REST API endpoints
- WebSocket handlers
- Authentication middleware
- Request validation

**Rules**:
- May depend on any `@macp/*` package
- Thin layer - delegates to services
- Handles HTTP/WebSocket protocol concerns

---

## Data Flow

### Unidirectional Data Flow

```
Client Request → API Handler → Extension → Core → Adapter → AI Provider
                     ↓
              Transport (Redis)
                     ↓
              Other Clients/Services
```

### Example Flow: P2P Conversation Turn

```typescript
// 1. Client initiates conversation
const runner = createP2PConversation(agent1, agent2, config);

// 2. Extension orchestrates
const result = await runner.run();

// 3. Inside run(), for each turn:
//    a. Core collects bids from adapters
//    b. Core evaluates bids
//    c. Core requests response from winner via adapter
//    d. Adapter calls AI provider (Anthropic/OpenAI)
//    e. Response flows back through layers

// 4. Result returned to client
console.log(result.finalSummary);
```

### Event Flow (Behind the Scenes)

```
Orchestrator                    Redis Streams                    Agents
     │                              │                              │
     │──── bid_request ────────────►│                              │
     │                              │──── bid_request ────────────►│
     │                              │◄──── bid_submission ─────────│
     │◄──── bid_submission ─────────│                              │
     │                              │                              │
     │──── turn_granted ───────────►│                              │
     │                              │──── turn_granted ───────────►│
     │                              │◄──── turn_response ──────────│
     │◄──── turn_response ──────────│                              │
     │                              │                              │
     │──── message_broadcast ──────►│                              │
     │                              │──── message_broadcast ──────►│
```

---

## Package Organization

### Dependency Graph

```
                    ┌─────────────────┐
                    │   @macp/shared  │
                    │  (types, utils) │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   @macp/core    │
                    │  (orchestrator, │
                    │   adapters)     │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐   ┌────────▼────────┐   ┌───────▼───────┐
│  @macp/p2p    │   │  @macp/expert   │   │ @macp/social  │
│  (P2P ext)    │   │  (Expert ext)   │   │ (Social ext)  │
└───────────────┘   └─────────────────┘   └───────────────┘
```

### Package Dependencies

| Package | Depends On |
|---------|------------|
| `@macp/shared` | (none - leaf package) |
| `@macp/core` | `@macp/shared` |
| `@macp/p2p` | `@macp/shared`, `@macp/core` |
| `@macp/expert` | `@macp/shared`, `@macp/core` |
| `@macp/social` | `@macp/shared`, `@macp/core` |
| `apps/api` | All `@macp/*` packages |

---

## Dependency Management

### Dependency Injection

**Prefer constructor injection**:
```typescript
class Orchestrator {
  constructor(
    private transport: BTSTransport,
    private biddingEngine: BiddingEngine = new BiddingEngine(),
    private contextManager: ContextManager = new ContextManager()
  ) {}
}
```

**Benefits**:
- Testable (can inject mocks)
- Explicit dependencies
- Flexible configuration

### Interface Abstraction

Abstract external dependencies behind interfaces:

```typescript
// Define interface
interface AgentAdapter {
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  generateBid(context: CompactContext): Promise<BidScores>;
  healthCheck(): Promise<boolean>;
}

// Implement for each provider
class ClaudeAdapter implements AgentAdapter {
  // Claude-specific implementation
}

class OpenAIAdapter implements AgentAdapter {
  // OpenAI-specific implementation
}

// Use via interface
class Orchestrator {
  constructor(private adapters: Map<string, AgentAdapter>) {}
}
```

---

## Scalability Guidelines

### Adding New Use Cases

When adding a new use case (e.g., Gaming):

1. **Create extension package**:
   ```
   packages/gaming/
   ├── src/
   │   ├── gaming-session.ts
   │   ├── turn-coordinator.ts
   │   └── index.ts
   ├── package.json
   └── tsconfig.json
   ```

2. **Define use case-specific types** (if needed):
   ```typescript
   interface GameState {
     players: Player[];
     currentPlayer: string;
     board: BoardState;
   }
   ```

3. **Implement extension class**:
   ```typescript
   export class GamingSession {
     private orchestrator: Orchestrator;

     async playTurn(): Promise<TurnResult> {
       // Gaming-specific orchestration
     }
   }
   ```

4. **No changes needed to**:
   - Core orchestrator
   - Bidding engine
   - Adapters
   - Transport

### Adding New AI Providers

When adding a new provider (e.g., Google Gemini):

1. **Create adapter**:
   ```typescript
   // packages/core/src/adapters/gemini-adapter.ts
   export class GeminiAdapter extends AgentAdapter {
     readonly provider = 'google';

     async generate(request: GenerateRequest): Promise<GenerateResponse> {
       // Gemini-specific implementation
     }
   }
   ```

2. **Export from package**:
   ```typescript
   // packages/core/src/index.ts
   export { GeminiAdapter } from './adapters/gemini-adapter.js';
   ```

3. **No changes needed to**:
   - Orchestrator
   - Extensions
   - Transport

### Adding New Transport Methods

When adding new transport (e.g., NATS):

1. **Implement transport interface**:
   ```typescript
   export class NATSTransport implements Transport {
     async publish(channel: string, message: BTSMessage): Promise<void> {
       // NATS-specific implementation
     }
   }
   ```

2. **Inject into orchestrator**:
   ```typescript
   const natsTransport = new NATSTransport(natsConnection);
   const orchestrator = new Orchestrator(conversation, natsTransport, config);
   ```

### Managing Growing Complexity

As the platform grows:

1. **Split large files**: If a file exceeds 400 lines, break it up
2. **Extract sub-packages**: For large extensions, create sub-packages
3. **Create interfaces**: Abstract common behavior
4. **Use generics**: Make components work with multiple types
5. **Document decisions**: Update architecture guide

---

## Testing Strategy

### Unit Testing
- Test each package independently
- Mock dependencies using interfaces
- Focus on business logic, not integration

### Integration Testing
- Test package interactions
- Use real Redis (testcontainers) for transport tests
- Test adapter communication (with rate limits)

### End-to-End Testing
- Test complete conversation flows
- Use mock AI responses for deterministic tests
- Test API endpoints

---

## Summary

This architecture emphasizes:
1. **Modularity**: Package-level separation by use case
2. **Layering**: Clear separation between shared, core, and extensions
3. **Composition**: Interfaces and composition over inheritance
4. **Scalability**: Easy to add new use cases, providers, and transports
5. **Testability**: Dependency injection and interface abstraction
6. **Maintainability**: Organized structure, clear responsibilities

By following this architecture, MACP can scale to support multiple use cases, AI providers, and features while remaining maintainable and testable.
