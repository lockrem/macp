#!/bin/bash
set -e

# MACP Deployment Script
# Builds and deploys the P2P server using AWS CodeBuild (no local Docker required)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PREFIX="${PREFIX:-macp-dev}"

echo "=========================================="
echo "MACP P2P Server Deployment"
echo "=========================================="

# Get AWS account info
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region || echo "us-east-1")

echo "AWS Account: $AWS_ACCOUNT_ID"
echo "AWS Region: $AWS_REGION"
echo "Prefix: $PREFIX"

# Get stack outputs
echo ""
echo "Fetching infrastructure details..."

SOURCE_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ${PREFIX}-build \
  --query "Stacks[0].Outputs[?OutputKey=='SourceBucketName'].OutputValue" \
  --output text 2>/dev/null || echo "")

BUILD_PROJECT=$(aws cloudformation describe-stacks \
  --stack-name ${PREFIX}-build \
  --query "Stacks[0].Outputs[?OutputKey=='BuildProjectName'].OutputValue" \
  --output text 2>/dev/null || echo "")

ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name ${PREFIX}-build \
  --query "Stacks[0].Outputs[?OutputKey=='RepositoryUri'].OutputValue" \
  --output text 2>/dev/null || echo "")

if [ -z "$SOURCE_BUCKET" ] || [ -z "$BUILD_PROJECT" ]; then
  echo "Error: Build stack not found. Deploy it first with:"
  echo "  cd infrastructure && npx cdk deploy ${PREFIX}-build"
  exit 1
fi

echo "Source Bucket: $SOURCE_BUCKET"
echo "Build Project: $BUILD_PROJECT"
echo "ECR Repository: $ECR_URI"

# Package source code
echo ""
echo "Packaging source code..."
cd "$PROJECT_ROOT"

# Create a temporary directory for the build
BUILD_DIR=$(mktemp -d)
trap "rm -rf $BUILD_DIR" EXIT

# Copy necessary files
echo "Copying files..."
cp -r packages "$BUILD_DIR/"
cp -r package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json turbo.json "$BUILD_DIR/"

# Create the zip file
echo "Creating archive..."
cd "$BUILD_DIR"
zip -rq source.zip . -x "*.git*" -x "*node_modules*" -x "*.DS_Store"

# Upload to S3
echo ""
echo "Uploading source to S3..."
aws s3 cp source.zip "s3://${SOURCE_BUCKET}/source.zip"

# Start CodeBuild
echo ""
echo "Starting CodeBuild..."
BUILD_ID=$(aws codebuild start-build \
  --project-name "$BUILD_PROJECT" \
  --query 'build.id' \
  --output text)

echo "Build started: $BUILD_ID"
echo ""
echo "Waiting for build to complete..."

# Wait for build to complete
while true; do
  BUILD_STATUS=$(aws codebuild batch-get-builds \
    --ids "$BUILD_ID" \
    --query 'builds[0].buildStatus' \
    --output text)

  BUILD_PHASE=$(aws codebuild batch-get-builds \
    --ids "$BUILD_ID" \
    --query 'builds[0].currentPhase' \
    --output text)

  echo "  Status: $BUILD_STATUS | Phase: $BUILD_PHASE"

  if [ "$BUILD_STATUS" = "SUCCEEDED" ]; then
    echo ""
    echo "Build completed successfully!"
    break
  elif [ "$BUILD_STATUS" = "FAILED" ] || [ "$BUILD_STATUS" = "FAULT" ] || [ "$BUILD_STATUS" = "STOPPED" ]; then
    echo ""
    echo "Build failed with status: $BUILD_STATUS"
    echo "Check the CodeBuild logs for details:"
    echo "  https://${AWS_REGION}.console.aws.amazon.com/codesuite/codebuild/projects/${BUILD_PROJECT}/build/${BUILD_ID}"
    exit 1
  fi

  sleep 10
done

# Get the image URI from the build
IMAGE_URI="${ECR_URI}:latest"
echo ""
echo "Image built: $IMAGE_URI"

# Update ECS service
echo ""
echo "Updating ECS service..."

CLUSTER_NAME="${PREFIX}-cluster"
SERVICE_NAME="${PREFIX}-api"

# Force a new deployment with the latest image
aws ecs update-service \
  --cluster "$CLUSTER_NAME" \
  --service "$SERVICE_NAME" \
  --force-new-deployment \
  --query 'service.deployments[0].status' \
  --output text

echo ""
echo "=========================================="
echo "Deployment initiated!"
echo "=========================================="
echo ""
echo "The ECS service is updating. Monitor progress with:"
echo "  aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME"
echo ""
echo "Or view in AWS Console:"
echo "  https://${AWS_REGION}.console.aws.amazon.com/ecs/home?region=${AWS_REGION}#/clusters/${CLUSTER_NAME}/services/${SERVICE_NAME}"
echo ""

# Get the API URL
API_URL=$(aws cloudformation describe-stacks \
  --stack-name ${PREFIX}-api \
  --query "Stacks[0].Outputs[?contains(OutputKey,'ServiceURL')].OutputValue" \
  --output text 2>/dev/null || echo "")

if [ -n "$API_URL" ]; then
  echo "API will be available at: $API_URL"
fi
