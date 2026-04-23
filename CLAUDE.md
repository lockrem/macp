# CLAUDE.md - Project Guidelines for AI Assistants

## Core Principles

**STOP AND DISCUSS before building.** Make good decisions at all times. When faced with architectural choices, present options with tradeoffs - don't just start implementing.

## Architecture Overview

### Agent Sync
- Agents are synced via `SettingsSyncService` using the `/settings` endpoint
- Local storage (UserDefaults) is a cache only
- Do NOT create separate S3 storage for agents

### Key Services
- `SettingsSyncService` - Syncs user settings and agents to/from server
- `AgentStorageService` - Local cache of agents, calls SettingsSyncService for sync
- `PublicAgentService` - Handles published/public agents (stored in S3 at `public-agents/`)

### Infrastructure
- API: Lambda + API Gateway HTTP API (v2) for REST endpoints
- WebSocket API: Lambda + API Gateway WebSocket for real-time streaming (`websocket-handler.ts`)
- Database: PostgreSQL (RDS Aurora Serverless)
- Cache: Redis (ElastiCache)
- Storage: S3 for memories, archives, and public agents
- Auth: Cognito

### Known Limitations
- Lambda + HTTP API Gateway does NOT support SSE streaming (responses are buffered)
- WebSocket API is used for real-time autonomous conversations (already implemented)

## File Structure

```
apps/ios/MACP/Sources/
  Core/Services/     - Shared services (API, Auth, Storage, etc.)
  Features/          - Feature-specific views and logic
  Components/        - Reusable UI components

packages/api/src/
  routes/            - API endpoints
  services/          - Business logic
  auth/              - Authentication

infrastructure/lib/stacks/  - CDK infrastructure
```

## Model Configuration
- Default Anthropic model: `claude-sonnet-4-5-20250929` (Claude Sonnet 4.5)
- Environment variable overrides: `ANTHROPIC_MODEL`, `OPENAI_MODEL`, etc.
- **IMPORTANT**: Claude 3.x models have been retired. Use Claude 4.5 models:
  - `claude-sonnet-4-5-20250929` (recommended for most use cases)
  - `claude-haiku-4-5-20251001` (fastest, lower cost)
  - `claude-opus-4-5-20251101` (most capable)
