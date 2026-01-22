# MACP AWS Deployment Architecture

## Overview

Server-side deployment on AWS provides full control over security, compliance, and performance. This document outlines the AWS-native architecture optimized for multi-agent communication.

---

## Architecture Diagram

```
                                    ┌─────────────────────────────────────────────────────────────┐
                                    │                        AWS Cloud                            │
                                    │  ┌───────────────────────────────────────────────────────┐  │
                                    │  │                      VPC                              │  │
┌──────────────┐                    │  │                                                       │  │
│   Mobile     │                    │  │  ┌─────────────┐      ┌─────────────────────────┐    │  │
│   (iOS/      │───┐                │  │  │   ALB       │      │    Private Subnets      │    │  │
│   Android)   │   │                │  │  │ + WAF       │      │                         │    │  │
└──────────────┘   │                │  │  └──────┬──────┘      │  ┌───────────────────┐  │    │  │
                   │  ┌──────────┐  │  │         │             │  │   ECS Fargate     │  │    │  │
┌──────────────┐   ├──│ CloudFront│──┼──┼─────────┤             │  │   Cluster         │  │    │  │
│   Web App    │───┤  │ + Shield │  │  │         │             │  │                   │  │    │  │
│   (React)    │   │  └──────────┘  │  │  ┌──────▼──────┐      │  │ ┌───────────────┐ │  │    │  │
└──────────────┘   │                │  │  │ API Gateway │      │  │ │ Orchestrator  │ │  │    │  │
                   │                │  │  │ (WebSocket  │◄─────┼──┼─│   Service     │ │  │    │  │
┌──────────────┐   │                │  │  │  + REST)    │      │  │ └───────────────┘ │  │    │  │
│   CLI/SDK    │───┘                │  │  └──────┬──────┘      │  │                   │  │    │  │
│   Clients    │                    │  │         │             │  │ ┌───────────────┐ │  │    │  │
└──────────────┘                    │  │  ┌──────▼──────┐      │  │ │ Conversation  │ │  │    │  │
                                    │  │  │  Cognito    │      │  │ │   Service     │ │  │    │  │
                                    │  │  │ User Pools  │      │  │ └───────────────┘ │  │    │  │
                                    │  │  │ + Apple ID  │      │  │                   │  │    │  │
                                    │  │  └─────────────┘      │  │ ┌───────────────┐ │  │    │  │
                                    │  │                       │  │ │ Agent Proxy   │ │  │    │  │
                                    │  │                       │  │ │   Service     │ │  │    │  │
                                    │  │                       │  │ └───────┬───────┘ │  │    │  │
                                    │  │                       │  └─────────┼─────────┘  │    │  │
                                    │  │                       │            │            │    │  │
                                    │  │  ┌────────────────────┼────────────┼────────────┼──┐ │  │
                                    │  │  │   Data Layer       │            │            │  │ │  │
                                    │  │  │                    │            │            │  │ │  │
                                    │  │  │  ┌─────────────┐   │   ┌────────▼────────┐   │  │ │  │
                                    │  │  │  │ Aurora      │   │   │  ElastiCache    │   │  │ │  │
                                    │  │  │  │ PostgreSQL  │   │   │  (Redis)        │   │  │ │  │
                                    │  │  │  │ Serverless  │   │   │                 │   │  │ │  │
                                    │  │  │  └─────────────┘   │   └─────────────────┘   │  │ │  │
                                    │  │  │                    │                         │  │ │  │
                                    │  │  └────────────────────┼─────────────────────────┘  │ │  │
                                    │  │                       │                            │ │  │
                                    │  └───────────────────────┼────────────────────────────┘ │  │
                                    │                          │                              │  │
                                    │  ┌───────────────────────┼────────────────────────────┐ │  │
                                    │  │   External Services   │                            │ │  │
                                    │  │                       ▼                            │ │  │
                                    │  │  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │ │  │
                                    │  │  │ Anthropic   │  │ OpenAI      │  │ ElevenLabs │ │ │  │
                                    │  │  │ API         │  │ API         │  │ API        │ │ │  │
                                    │  │  └─────────────┘  └─────────────┘  └────────────┘ │ │  │
                                    │  └──────────────────────────────────────────────────────┘ │  │
                                    └─────────────────────────────────────────────────────────────┘
```

---

## AWS Services Selection

### Compute

| Service | Use Case | Rationale |
|---------|----------|-----------|
| **ECS Fargate** | Core services | Serverless containers, no EC2 management, auto-scaling |
| **Lambda** | Event handlers, webhooks | Cost-effective for sporadic workloads |
| **App Runner** | Simple microservices | Alternative for simpler deployment needs |

**Recommendation:** ECS Fargate for core services. Provides container flexibility without EC2 overhead. Lambda for event-driven tasks (cleanup, notifications).

### Networking

| Service | Use Case | Rationale |
|---------|----------|-----------|
| **API Gateway** | REST + WebSocket APIs | Managed, scales automatically, built-in throttling |
| **ALB** | Internal service routing | Health checks, path-based routing |
| **CloudFront** | CDN, DDoS protection | Global edge, integrates with Shield |
| **VPC** | Network isolation | Private subnets for services |

### Data

| Service | Use Case | Rationale |
|---------|----------|-----------|
| **Aurora Serverless v2** | Primary database | Auto-scaling, PostgreSQL compatible |
| **ElastiCache (Redis)** | Caching, pub/sub, sessions | Low-latency, supports Streams |
| **DynamoDB** | High-throughput metadata | Optional for specific access patterns |
| **S3** | Conversation archives, assets | Cost-effective storage |

### Security & Auth

| Service | Use Case | Rationale |
|---------|----------|-----------|
| **Cognito** | User authentication | Native Apple Sign-In, OAuth flows |
| **Secrets Manager** | API keys storage | Rotation, audit trail |
| **IAM** | Service-to-service auth | Fine-grained permissions |
| **WAF** | API protection | SQL injection, rate limiting |
| **Shield** | DDoS protection | Standard included, Advanced optional |
| **KMS** | Encryption keys | Managed key rotation |

### Observability

| Service | Use Case | Rationale |
|---------|----------|-----------|
| **CloudWatch** | Logs, metrics, alarms | Native integration |
| **X-Ray** | Distributed tracing | Request flow visualization |
| **CloudWatch RUM** | Client-side monitoring | Real user metrics |

### Messaging

| Service | Use Case | Rationale |
|---------|----------|-----------|
| **SQS** | Async task queues | Reliable, exactly-once processing |
| **SNS** | Fan-out notifications | Pub/sub to multiple subscribers |
| **EventBridge** | Event routing | Rules-based event processing |

---

## Authentication Architecture

### User Authentication (Cognito)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Mobile    │     │   Cognito   │     │   Apple     │
│   Client    │────►│   Hosted UI │────►│   Sign-In   │
└─────────────┘     └──────┬──────┘     └─────────────┘
                          │
                   ┌──────▼──────┐
                   │   Cognito   │
                   │  User Pool  │
                   └──────┬──────┘
                          │
                   ┌──────▼──────┐
                   │  JWT Token  │
                   │  (id_token) │
                   └──────┬──────┘
                          │
                   ┌──────▼──────┐
                   │ API Gateway │
                   │ Authorizer  │
                   └─────────────┘
```

### Cognito Configuration

```typescript
// cognito-config.ts

const cognitoConfig = {
  userPool: {
    name: 'macp-users',
    selfSignUpEnabled: true,
    autoVerify: { email: true },
    signInAliases: { email: true },
    standardAttributes: {
      email: { required: true, mutable: true },
      fullname: { required: false, mutable: true },
    },
    customAttributes: {
      organizationId: { type: 'String' },
      tier: { type: 'String' },  // free, pro, enterprise
    },
    passwordPolicy: {
      minLength: 12,
      requireLowercase: true,
      requireUppercase: true,
      requireDigits: true,
      requireSymbols: true,
    },
    mfa: 'OPTIONAL',
    mfaSecondFactor: { sms: false, otp: true },
  },

  identityProviders: {
    apple: {
      clientId: process.env.APPLE_CLIENT_ID,
      teamId: process.env.APPLE_TEAM_ID,
      keyId: process.env.APPLE_KEY_ID,
      privateKey: process.env.APPLE_PRIVATE_KEY,
      scopes: ['email', 'name'],
    },
    // Future: Google, Microsoft
  },

  appClients: {
    web: {
      name: 'macp-web',
      generateSecret: false,
      authFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      oauthFlows: ['code'],
      callbackUrls: ['https://app.macp.io/callback'],
      logoutUrls: ['https://app.macp.io/logout'],
    },
    mobile: {
      name: 'macp-mobile',
      generateSecret: false,
      authFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      oauthFlows: ['code'],
      callbackUrls: ['macp://callback'],
      logoutUrls: ['macp://logout'],
    },
    cli: {
      name: 'macp-cli',
      generateSecret: true,
      authFlows: ['ALLOW_USER_PASSWORD_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
    },
  },
};
```

### Agent Identity (Service-Level)

For agent-to-agent communication within our infrastructure, we use IAM + internal tokens rather than the external Ed25519 signatures (those are for cross-platform scenarios).

```typescript
// agent-identity.ts

interface InternalAgentToken {
  agentId: string;
  ownerId: string;           // Cognito user sub
  capabilities: string[];
  issuedAt: number;
  expiresAt: number;
  signature: string;         // HMAC-SHA256 with KMS-managed key
}

class AgentTokenService {
  constructor(
    private kmsKeyId: string,
    private kmsClient: KMSClient
  ) {}

  async issueToken(agent: Agent, ttlSeconds: number = 3600): Promise<string> {
    const payload: InternalAgentToken = {
      agentId: agent.id,
      ownerId: agent.owner_id,
      capabilities: agent.capabilities.map(c => c.domain),
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
      signature: '',  // Populated below
    };

    // Sign with KMS
    const dataToSign = JSON.stringify({ ...payload, signature: undefined });
    const signResponse = await this.kmsClient.send(new SignCommand({
      KeyId: this.kmsKeyId,
      Message: Buffer.from(dataToSign),
      MessageType: 'RAW',
      SigningAlgorithm: 'HMAC_SHA_256',
    }));

    payload.signature = Buffer.from(signResponse.Signature!).toString('base64');

    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  async verifyToken(token: string): Promise<InternalAgentToken | null> {
    try {
      const payload: InternalAgentToken = JSON.parse(
        Buffer.from(token, 'base64').toString()
      );

      // Check expiry
      if (payload.expiresAt < Math.floor(Date.now() / 1000)) {
        return null;
      }

      // Verify signature with KMS
      const dataToVerify = JSON.stringify({ ...payload, signature: undefined });
      const verifyResponse = await this.kmsClient.send(new VerifyCommand({
        KeyId: this.kmsKeyId,
        Message: Buffer.from(dataToVerify),
        MessageType: 'RAW',
        Signature: Buffer.from(payload.signature, 'base64'),
        SigningAlgorithm: 'HMAC_SHA_256',
      }));

      return verifyResponse.SignatureValid ? payload : null;
    } catch {
      return null;
    }
  }
}
```

---

## Service Architecture

### ECS Service Definitions

```yaml
# ecs-services.yaml (CDK/CloudFormation style)

services:
  orchestrator:
    image: macp/orchestrator:latest
    cpu: 512
    memory: 1024
    desiredCount: 2
    minCount: 2
    maxCount: 10
    healthCheck:
      path: /health
      interval: 30
    environment:
      - REDIS_URL: ${redis_endpoint}
      - DATABASE_URL: ${aurora_endpoint}
    secrets:
      - ANTHROPIC_API_KEY: arn:aws:secretsmanager:...
      - OPENAI_API_KEY: arn:aws:secretsmanager:...
    scaling:
      targetCpuUtilization: 70
      targetMemoryUtilization: 80

  conversation:
    image: macp/conversation:latest
    cpu: 256
    memory: 512
    desiredCount: 2
    minCount: 2
    maxCount: 20
    scaling:
      targetCpuUtilization: 70

  agent-proxy:
    image: macp/agent-proxy:latest
    cpu: 1024
    memory: 2048
    desiredCount: 3
    minCount: 3
    maxCount: 50
    scaling:
      # Scale based on queue depth
      customMetric:
        metric: PendingAgentRequests
        target: 10
```

### API Gateway Configuration

```yaml
# api-gateway.yaml

apis:
  rest:
    name: macp-rest-api
    stageName: v1
    throttling:
      rateLimit: 1000
      burstLimit: 2000
    authorizer:
      type: COGNITO_USER_POOLS
      userPoolArn: ${cognito_user_pool_arn}

    routes:
      - path: /agents
        methods: [GET, POST]
        integration: conversation-service
      - path: /agents/{id}
        methods: [GET, PATCH, DELETE]
        integration: conversation-service
      - path: /conversations
        methods: [GET, POST]
        integration: conversation-service
      - path: /conversations/{id}
        methods: [GET, PATCH, DELETE]
        integration: conversation-service

  websocket:
    name: macp-websocket-api
    routeSelectionExpression: $request.body.action

    routes:
      - $connect:
          integration: orchestrator-service
          authorizer: cognito
      - $disconnect:
          integration: orchestrator-service
      - $default:
          integration: orchestrator-service
      - bid:
          integration: orchestrator-service
      - message:
          integration: orchestrator-service
```

---

## Consumption-Based Metering

### Metering Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Service   │────►│  Metering   │────►│   Kinesis   │────►│  Metering   │
│   Request   │     │  Middleware │     │   Firehose  │     │   Lambda    │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                   │
                                                            ┌──────▼──────┐
                                                            │  DynamoDB   │
                                                            │  (Usage)    │
                                                            └──────┬──────┘
                                                                   │
                                                            ┌──────▼──────┐
                                                            │   Billing   │
                                                            │   Service   │
                                                            └─────────────┘
```

### Usage Events Schema

```typescript
// metering.ts

interface UsageEvent {
  eventId: string;
  timestamp: string;
  userId: string;
  agentId: string;
  conversationId: string;
  eventType: UsageEventType;
  dimensions: UsageDimensions;
}

type UsageEventType =
  | 'agent_turn'           // Agent took a turn
  | 'orchestration'        // Orchestrator processed a turn
  | 'voice_synthesis'      // TTS generated
  | 'voice_transcription'  // STT processed
  | 'storage'              // Conversation stored
  | 'api_call';            // External API consumed

interface UsageDimensions {
  // Token-based
  inputTokens?: number;
  outputTokens?: number;

  // Time-based
  durationMs?: number;

  // Volume-based
  audioSeconds?: number;
  storageMb?: number;

  // Provider-based
  provider?: 'anthropic' | 'openai' | 'elevenlabs';
  model?: string;
}

// Pricing configuration (example)
const pricingTiers = {
  free: {
    included: {
      agentTurns: 100,
      orchestrations: 50,
      voiceMinutes: 5,
      storageMb: 100,
    },
    overage: null,  // Hard limit
  },
  pro: {
    included: {
      agentTurns: 10000,
      orchestrations: 5000,
      voiceMinutes: 60,
      storageMb: 1000,
    },
    overage: {
      agentTurnPer1k: 0.50,
      orchestrationPer1k: 0.25,
      voicePerMinute: 0.10,
      storagePerGbMonth: 0.50,
    },
  },
  enterprise: {
    // Custom pricing
  },
};
```

### Metering Middleware

```typescript
// metering-middleware.ts

class MeteringMiddleware {
  constructor(
    private firehoseClient: FirehoseClient,
    private streamName: string
  ) {}

  async recordUsage(event: UsageEvent): Promise<void> {
    await this.firehoseClient.send(new PutRecordCommand({
      DeliveryStreamName: this.streamName,
      Record: {
        Data: Buffer.from(JSON.stringify(event) + '\n'),
      },
    }));
  }

  // Middleware for Express/Fastify
  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      // Capture response
      const originalSend = res.send;
      res.send = (body: any) => {
        const duration = Date.now() - startTime;

        // Extract usage from response if applicable
        const usage = this.extractUsage(req, body, duration);
        if (usage) {
          this.recordUsage(usage).catch(console.error);
        }

        return originalSend.call(res, body);
      };

      next();
    };
  }

  private extractUsage(
    req: Request,
    body: any,
    durationMs: number
  ): UsageEvent | null {
    // Implementation depends on endpoint
    return null;
  }
}
```

---

## Infrastructure as Code

### CDK Stack Structure

```
infrastructure/
├── bin/
│   └── macp.ts                 # CDK app entry
├── lib/
│   ├── stacks/
│   │   ├── vpc-stack.ts        # Networking
│   │   ├── data-stack.ts       # Aurora, Redis, S3
│   │   ├── auth-stack.ts       # Cognito
│   │   ├── compute-stack.ts    # ECS, Lambda
│   │   ├── api-stack.ts        # API Gateway
│   │   └── monitoring-stack.ts # CloudWatch, X-Ray
│   └── constructs/
│       ├── fargate-service.ts  # Reusable ECS construct
│       └── metered-api.ts      # API with metering
├── cdk.json
└── package.json
```

### Example CDK Stack

```typescript
// lib/stacks/compute-stack.ts

import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class ComputeStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;
  public readonly orchestratorService: ecs.FargateService;

  constructor(scope: cdk.App, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // ECS Cluster
    this.cluster = new ecs.Cluster(this, 'MACPCluster', {
      vpc: props.vpc,
      containerInsights: true,
    });

    // Orchestrator Service
    const orchestratorTaskDef = new ecs.FargateTaskDefinition(
      this,
      'OrchestratorTask',
      {
        memoryLimitMiB: 1024,
        cpu: 512,
      }
    );

    orchestratorTaskDef.addContainer('orchestrator', {
      image: ecs.ContainerImage.fromRegistry('macp/orchestrator:latest'),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'orchestrator' }),
      environment: {
        NODE_ENV: 'production',
        REDIS_URL: props.redisEndpoint,
      },
      secrets: {
        DATABASE_URL: ecs.Secret.fromSecretsManager(props.dbSecret),
        ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(props.anthropicSecret),
      },
      portMappings: [{ containerPort: 3000 }],
    });

    this.orchestratorService = new ecs.FargateService(
      this,
      'OrchestratorService',
      {
        cluster: this.cluster,
        taskDefinition: orchestratorTaskDef,
        desiredCount: 2,
        assignPublicIp: false,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      }
    );

    // Auto-scaling
    const scaling = this.orchestratorService.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 10,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
    });
  }
}
```

---

## Cost Estimation

### Monthly Cost Breakdown (Estimated)

| Service | Configuration | Est. Monthly Cost |
|---------|---------------|-------------------|
| ECS Fargate | 3 services × 2 tasks × 0.5 vCPU | $50-100 |
| Aurora Serverless v2 | 2-8 ACUs | $100-400 |
| ElastiCache Redis | cache.t4g.medium | $50-100 |
| API Gateway | 10M requests | $35 |
| CloudFront | 100GB transfer | $20 |
| Cognito | 10K MAUs (free tier) | $0-50 |
| Secrets Manager | 10 secrets | $4 |
| CloudWatch | Logs + metrics | $20-50 |
| **External APIs** | | |
| Anthropic | Variable | Pass-through + margin |
| OpenAI | Variable | Pass-through + margin |
| ElevenLabs | Variable | Pass-through + margin |

**Base Infrastructure:** ~$300-700/month
**Scales with:** Active users, conversation volume, voice usage

---

## Deployment Environments

```
┌─────────────────────────────────────────────────────────────┐
│                     AWS Organization                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    Dev      │  │   Staging   │  │ Production  │         │
│  │   Account   │  │   Account   │  │   Account   │         │
│  │             │  │             │  │             │         │
│  │ • Feature   │  │ • Release   │  │ • Blue/Green│         │
│  │   branches  │  │   candidates│  │   deploy    │         │
│  │ • Minimal   │  │ • Full      │  │ • Multi-AZ  │         │
│  │   resources │  │   replica   │  │ • DR ready  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Checklist

- [ ] VPC with private subnets for all services
- [ ] Security groups with minimal required access
- [ ] WAF rules for SQL injection, XSS, rate limiting
- [ ] Secrets Manager for all API keys (no env vars)
- [ ] KMS encryption for data at rest
- [ ] TLS 1.3 for data in transit
- [ ] Cognito MFA enabled
- [ ] CloudTrail enabled for audit
- [ ] GuardDuty enabled for threat detection
- [ ] Regular security scans with Inspector
- [ ] IAM roles with least privilege
- [ ] No public subnets for compute resources
