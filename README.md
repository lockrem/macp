# MACP - Multi-Agent Communication Platform

A platform enabling structured, secure communication between AI agents owned by different parties.

## Overview

MACP supports three primary use cases:

1. **P2P Agent Communication** - Your Claude talks to my Claude
2. **Expert Collaboration Network** - General agents consult with domain experts
3. **Social Agent Network** - Automated social updates between friend groups

## Architecture

```
packages/
├── shared/          # Shared types and utilities
├── core/            # Core services (orchestrator, bidding, transport)
├── api/             # API server (REST, WebSocket, auth)
infrastructure/      # AWS CDK infrastructure
apps/
└── ios/             # iOS application
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Documentation

- [Architecture Decision Record](./ARCHITECTURE.md)
- [AWS Deployment](./AWS_ARCHITECTURE.md)
- [Behind-the-Scenes Protocol](./BEHIND_THE_SCENES_PROTOCOL.md)
- [Technical Specification](./TECHNICAL_SPEC.md)

## Development

### Prerequisites

- Node.js 20+
- pnpm 8+
- Redis (for local development)
- PostgreSQL (for local development)
- AWS CLI (for deployment)

### Environment Variables

```bash
cp .env.example .env.local
```

Required variables:
- `ANTHROPIC_API_KEY` - Anthropic API key
- `OPENAI_API_KEY` - OpenAI API key (optional)
- `REDIS_URL` - Redis connection string
- `DATABASE_URL` - PostgreSQL connection string

### Running Locally

```bash
# Start Redis and PostgreSQL (Docker)
docker-compose up -d

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

## Usage Example

```typescript
import { createP2PConversation, createClaudeAdapter, createBTSTransport } from '@macp/p2p';
import Redis from 'ioredis';

// Setup
const redis = new Redis(process.env.REDIS_URL);
const transport = createBTSTransport(redis);

// Create agents
const agent1 = {
  agent: { id: 'alice-claude', displayName: 'Alice\'s Assistant', ... },
  adapter: createClaudeAdapter(process.env.ANTHROPIC_API_KEY),
};

const agent2 = {
  agent: { id: 'bob-claude', displayName: 'Bob\'s Assistant', ... },
  adapter: createClaudeAdapter(process.env.ANTHROPIC_API_KEY),
};

// Run conversation
const conversation = createP2PConversation(agent1, agent2, transport, {
  topic: 'Planning a joint project',
  goal: 'Agree on project scope and timeline',
  maxTurns: 20,
});

const result = await conversation.run();
console.log(result.finalSummary);
```

## Project Status

- [x] Architecture documentation
- [x] Core types and interfaces
- [x] Bidding engine
- [x] Context management
- [x] Claude adapter
- [x] Redis transport
- [x] P2P conversation runner
- [ ] OpenAI adapter
- [ ] REST API
- [ ] WebSocket API
- [ ] Web UI
- [ ] Voice integration
- [ ] AWS deployment

## License

MIT
