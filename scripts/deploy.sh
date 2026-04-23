#!/bin/bash
set -e

# MACP Deployment Script
# Builds and deploys the API server to AWS Lambda (no Docker required)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PREFIX="${PREFIX:-macp-dev}"

echo "=========================================="
echo "MACP API Server Deployment"
echo "=========================================="

# Get AWS account info
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region || echo "us-east-1")

echo "AWS Account: $AWS_ACCOUNT_ID"
echo "AWS Region: $AWS_REGION"
echo "Prefix: $PREFIX"

# Step 1: Build all workspace packages
echo ""
echo "Building workspace packages..."
cd "$PROJECT_ROOT"
pnpm install
pnpm --filter @macp/shared build
pnpm --filter @macp/core build
pnpm --filter @macp/api build

# Step 2: Prepare Lambda deployment package
echo ""
echo "Preparing Lambda deployment..."
cd "$PROJECT_ROOT"

# Clean up previous deployment
rm -rf lambda-deploy

# Create lambda-deploy directory
mkdir -p lambda-deploy

# Copy the built dist folders
cp -r packages/api/dist lambda-deploy/

# Create package.json without workspace: references for npm install
cat > lambda-deploy/package.json << 'EOF'
{
  "name": "@macp/api",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/lambda.js",
  "dependencies": {
    "@aws-sdk/client-cognito-identity-provider": "^3.500.0",
    "@aws-sdk/client-dynamodb": "^3.972.0",
    "@aws-sdk/client-s3": "^3.500.0",
    "@aws-sdk/client-secrets-manager": "^3.500.0",
    "@aws-sdk/client-apigatewaymanagementapi": "^3.500.0",
    "@aws-sdk/lib-dynamodb": "^3.972.0",
    "@fastify/aws-lambda": "^6.3.1",
    "@fastify/cors": "^9.0.0",
    "@fastify/websocket": "^9.0.0",
    "aws-jwt-verify": "^5.1.1",
    "drizzle-orm": "^0.45.1",
    "fastify": "^4.26.0",
    "fastify-plugin": "^5.1.0",
    "ioredis": "^5.3.0",
    "jose": "^4.15.0",
    "jsonwebtoken": "^9.0.2",
    "pino": "^8.17.0",
    "pino-pretty": "^13.1.3",
    "postgres": "^3.4.0",
    "ulid": "^2.3.0",
    "zod": "^3.22.0"
  }
}
EOF

# Install production dependencies with npm (creates flat node_modules)
cd lambda-deploy
npm install --production --ignore-scripts --omit=dev

# Now add workspace packages AFTER npm install
mkdir -p node_modules/@macp/shared
mkdir -p node_modules/@macp/core

# Copy shared package (maintaining dist structure for correct main path)
cp -r ../packages/shared/dist node_modules/@macp/shared/
cp ../packages/shared/package.json node_modules/@macp/shared/

# Copy core package (maintaining dist structure for correct main path)
cp -r ../packages/core/dist node_modules/@macp/core/
cp ../packages/core/package.json node_modules/@macp/core/

# Go back to project root
cd "$PROJECT_ROOT"

# Step 3: Deploy using CDK
echo ""
echo "Deploying via CDK..."
cd "$PROJECT_ROOT/infrastructure"

# Deploy only the API stack (exclusively to avoid updating build stack)
npx cdk deploy ${PREFIX}-api --exclusively --require-approval never

# Clean up
cd "$PROJECT_ROOT"
rm -rf lambda-deploy

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="

# Get the API URL
API_URL=$(aws cloudformation describe-stacks \
  --stack-name ${PREFIX}-api \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text 2>/dev/null || echo "")

if [ -n "$API_URL" ]; then
  echo ""
  echo "API URL: $API_URL"
  echo ""
  echo "Test the API:"
  echo "  curl $API_URL/health"
fi

# Get the WebSocket URL
WS_URL=$(aws cloudformation describe-stacks \
  --stack-name ${PREFIX}-api \
  --query "Stacks[0].Outputs[?OutputKey=='WebSocketUrl'].OutputValue" \
  --output text 2>/dev/null || echo "")

if [ -n "$WS_URL" ]; then
  echo ""
  echo "WebSocket URL: $WS_URL"
fi
