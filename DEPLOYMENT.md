# MACP Deployment Guide

Complete guide to deploying the Multi-Agent Communication Platform to AWS.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 20+
- pnpm installed
- Apple Developer Account (for Sign in with Apple)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         AWS Cloud                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────────────────────────────┐   │
│  │   Cognito   │     │            VPC                       │   │
│  │  User Pool  │     │  ┌─────────────────────────────────┐ │   │
│  │  + Apple    │     │  │        Public Subnets            │ │   │
│  │   Sign-In   │     │  │  ┌───────────────────────────┐  │ │   │
│  └──────┬──────┘     │  │  │    API Gateway (HTTP)     │  │ │   │
│         │            │  │  └─────────────┬─────────────┘  │ │   │
│         │            │  └────────────────┼────────────────┘ │   │
│         │            │  ┌────────────────┼────────────────┐ │   │
│         │            │  │        Private Subnets          │ │   │
│         ▼            │  │  ┌─────────────┴─────────────┐  │ │   │
│  ┌─────────────┐     │  │  │     Lambda Function       │  │ │   │
│  │ iOS App     │◄────┼──┼──│     (MACP API)            │  │ │   │
│  │             │     │  │  └─────────────┬─────────────┘  │ │   │
│  └─────────────┘     │  └────────────────┼────────────────┘ │   │
│                      │  ┌────────────────┼────────────────┐ │   │
│                      │  │       Isolated Subnets          │ │   │
│                      │  │  ┌────────────┐ ┌────────────┐  │ │   │
│                      │  │  │  Aurora    │ │ ElastiCache│  │ │   │
│                      │  │  │ PostgreSQL │ │   Redis    │  │ │   │
│                      │  │  └────────────┘ └────────────┘  │ │   │
│                      │  └─────────────────────────────────┘ │   │
│                      └─────────────────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     S3 Buckets                           │   │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐   │   │
│  │  │  Memory Bucket  │  │  Archive Bucket (KMS)       │   │   │
│  │  │  (Agent Facts)  │  │  (Conversation History)     │   │   │
│  │  └─────────────────┘  └─────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Step 1: Apple Developer Setup

### 1.1 Create App ID

1. Go to [Apple Developer Portal](https://developer.apple.com/account)
2. Navigate to Certificates, Identifiers & Profiles → Identifiers
3. Click "+" to create new App ID
4. Select "App IDs" and continue
5. Configure:
   - Description: `MACP`
   - Bundle ID: `com.yourcompany.macp` (explicit)
6. Enable "Sign in with Apple" capability
7. Click Continue and Register

### 1.2 Create Services ID (for web/server auth)

1. In Identifiers, click "+" again
2. Select "Services IDs" and continue
3. Configure:
   - Description: `MACP Web Service`
   - Identifier: `com.yourcompany.macp.service`
4. Enable "Sign in with Apple"
5. Click Configure:
   - Primary App ID: Select your App ID
   - Domains: `your-domain.com` (or your API Gateway domain)
   - Return URLs: `https://your-domain.com/callback`
6. Save and Register

### 1.3 Create Sign-In Key

1. Navigate to Keys
2. Click "+" to create new key
3. Configure:
   - Key Name: `MACP Sign In Key`
   - Enable "Sign in with Apple"
   - Configure: Select your Primary App ID
4. Click Continue, then Register
5. **Download the key file (.p8) - you can only download this ONCE!**
6. Note the Key ID

### 1.4 Store Apple Credentials in AWS Secrets Manager

```bash
# Create secret for Apple Sign-In
aws secretsmanager create-secret \
  --name macp/apple-signin \
  --secret-string '{
    "keyId": "YOUR_KEY_ID",
    "privateKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
  }'
```

## Step 2: APNs Setup (Push Notifications)

### 2.1 Create APNs Key

1. In Apple Developer Portal, go to Keys
2. Click "+" to create new key
3. Configure:
   - Key Name: `MACP Push Notifications`
   - Enable "Apple Push Notifications service (APNs)"
4. Click Continue, then Register
5. **Download the key file (.p8)**
6. Note the Key ID

### 2.2 Store APNs Credentials

```bash
# Add APNs credentials to Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id macp/apple-signin \
  --secret-string '{
    "keyId": "SIGN_IN_KEY_ID",
    "privateKey": "...",
    "apnsKeyId": "APNS_KEY_ID",
    "apnsPrivateKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
  }'
```

## Step 3: Deploy Infrastructure

### 3.1 Install Dependencies

```bash
cd infrastructure
pnpm install
```

### 3.2 Configure Environment

Create `infrastructure/.env`:

```bash
# AWS Configuration
AWS_ACCOUNT_ID=123456789012
AWS_REGION=us-east-1

# Apple Configuration
APPLE_TEAM_ID=ABC123XYZ
APPLE_SERVICES_ID=com.yourcompany.macp.service

# Domain (optional)
DOMAIN_NAME=api.macp.app
```

### 3.3 Deploy Stacks

```bash
# Bootstrap CDK (first time only)
pnpm cdk bootstrap

# Review changes
pnpm cdk diff

# Deploy all stacks
pnpm cdk deploy --all

# Or deploy individually:
pnpm cdk deploy macp-dev-auth      # Cognito
pnpm cdk deploy macp-dev-database  # Aurora + Redis
pnpm cdk deploy macp-dev-build     # S3 + DynamoDB
pnpm cdk deploy macp-dev-api       # Lambda + API Gateway
```

### 3.4 Note the Outputs

After deployment, note these values:

```
MACPAuthStack.UserPoolId = us-east-1_XXXXXXXXX
MACPAuthStack.UserPoolClientId = XXXXXXXXXXXXXXXXXXXXXXXXX
MACPApiStack.ApiUrl = https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com
```

## Step 4: Configure API Keys

Add your AI provider keys to Secrets Manager:

```bash
# Get the secret ARN from CDK output
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name macp-dev-api \
  --query "Stacks[0].Outputs[?OutputKey=='ApiKeysSecretArn'].OutputValue" \
  --output text)

# Add API keys
aws secretsmanager put-secret-value \
  --secret-id $SECRET_ARN \
  --secret-string '{
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "OPENAI_API_KEY": "sk-proj-..."
  }'
```

## Step 5: Run Database Migrations

```bash
# Get database connection string
DB_SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name macp-dev-database \
  --query "Stacks[0].Outputs[?OutputKey=='DatabaseSecretArn'].OutputValue" \
  --output text)

# Get connection string
DATABASE_URL=$(aws secretsmanager get-secret-value \
  --secret-id $DB_SECRET_ARN \
  --query "SecretString" \
  --output text | jq -r '.connectionString')

# Run migrations
DATABASE_URL=$DATABASE_URL pnpm --filter @macp/core db:push
DATABASE_URL=$DATABASE_URL pnpm --filter @macp/core db:seed
```

## Step 6: Configure iOS App

### 6.1 Update App Configuration

Edit `apps/ios/MACP/Sources/Networking/APIClient.swift`:

```swift
#if DEBUG
let baseURL = "http://localhost:3000"
#else
let baseURL = "https://XXXXXXXXXX.execute-api.us-east-1.amazonaws.com"
#endif
```

### 6.2 Configure Cognito in iOS

Add to your iOS app configuration:

```swift
// CognitoConfig.swift
struct CognitoConfig {
    static let userPoolId = "us-east-1_XXXXXXXXX"
    static let clientId = "XXXXXXXXXXXXXXXXXXXXXXXXX"
    static let region = "us-east-1"
}
```

### 6.3 Add URL Schemes

In Xcode, add URL schemes for OAuth callback:
- `macp` (for `macp://callback`)

## Step 7: Deploy Updates

To deploy code changes:

```bash
# From project root
./scripts/deploy.sh
```

This will:
1. Build the API TypeScript code
2. Package with production dependencies
3. Deploy to Lambda via CDK

## Step 8: Verify Deployment

### 8.1 Health Check

```bash
API_URL=$(aws cloudformation describe-stacks \
  --stack-name macp-dev-api \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text)

curl $API_URL/health
# Should return: {"status":"healthy","timestamp":"...","version":"0.1.0"}
```

### 8.2 Test API

```bash
# Create a conversation
curl -X POST $API_URL/conversations \
  -H "Content-Type: application/json" \
  -H "x-user-id: test-user" \
  -d '{"topic":"Test conversation","mode":"campfire","maxTurns":10}'
```

## Monitoring

### CloudWatch Logs

```bash
# View API logs
aws logs tail /aws/lambda/macp-dev-api --follow
```

### Lambda Function Status

```bash
aws lambda get-function --function-name macp-dev-api
```

## Cost Optimization

For development/testing, the infrastructure uses:
- Aurora Serverless v2 (scales to 0.5 ACU when idle)
- ElastiCache t4g.micro (smallest instance)
- Lambda (pay-per-request, scales automatically)
- API Gateway HTTP API (lower cost than REST API)
- 1 NAT Gateway (instead of per-AZ)

**Estimated monthly cost: ~$50-100/month** (lower than container-based deployment)

For production, consider:
- Reserved capacity for predictable workloads
- Multi-AZ NAT Gateways for redundancy
- Larger ElastiCache instances for performance
- Provisioned concurrency for Lambda (reduces cold starts)

## Troubleshooting

### Lambda Function Errors

```bash
# Check recent invocations
aws logs filter-log-events \
  --log-group-name /aws/lambda/macp-dev-api \
  --filter-pattern "ERROR" \
  --limit 20
```

### Database Connection Issues

```bash
# Verify security groups allow access
aws ec2 describe-security-groups \
  --group-ids <lambda-sg-id> <database-sg-id>
```

### Apple Sign-In Not Working

1. Verify Services ID is correctly configured
2. Check return URLs match exactly
3. Verify key hasn't expired
4. Check Secrets Manager has correct values

### Cold Start Issues

If experiencing slow cold starts:
1. Consider provisioned concurrency
2. Optimize Lambda package size
3. Keep functions warm with scheduled pings

## Cleanup

To destroy all resources:

```bash
# WARNING: This will delete all data!
pnpm cdk destroy --all
```

Note: Database has deletion protection enabled. To delete:
1. Disable deletion protection in AWS Console
2. Then run `cdk destroy`
