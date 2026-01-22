#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/stacks/auth-stack';
import { DatabaseStack } from '../lib/stacks/database-stack';
import { ApiStack } from '../lib/stacks/api-stack';
import { BuildStack } from '../lib/stacks/build-stack';

const app = new cdk.App();

// Environment configuration
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
  region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1',
};

// Stack configuration from context or environment
const config = {
  appName: app.node.tryGetContext('appName') || 'macp',
  environment: app.node.tryGetContext('environment') || 'dev',
  appleServicesId: app.node.tryGetContext('appleServicesId') || process.env.APPLE_SERVICES_ID,
  appleTeamId: app.node.tryGetContext('appleTeamId') || process.env.APPLE_TEAM_ID,
  domainName: app.node.tryGetContext('domainName') || process.env.DOMAIN_NAME,
};

// Prefix for all resource names
const prefix = `${config.appName}-${config.environment}`;

// Authentication Stack (Cognito + Apple Sign-In)
const authStack = new AuthStack(app, `${prefix}-auth`, {
  env,
  prefix,
  appleServicesId: config.appleServicesId,
  appleTeamId: config.appleTeamId,
});

// Database Stack (Aurora PostgreSQL + ElastiCache Redis)
const databaseStack = new DatabaseStack(app, `${prefix}-database`, {
  env,
  prefix,
});

// Build Stack (ECR + CodeBuild for container builds)
const buildStack = new BuildStack(app, `${prefix}-build`, {
  env,
  prefix,
});

// API Stack (ECS Fargate + API Gateway + WebSocket)
const apiStack = new ApiStack(app, `${prefix}-api`, {
  env,
  prefix,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  database: databaseStack.database,
  redis: databaseStack.redis,
  vpc: databaseStack.vpc,
  repository: buildStack.repository,
  memoryBucket: buildStack.memoryBucket,
  archiveBucket: buildStack.archiveBucket,
  archiveKey: buildStack.archiveKey,
  archiveTable: buildStack.archiveTable,
  domainName: config.domainName,
});

// Add dependencies
databaseStack.addDependency(authStack);
apiStack.addDependency(databaseStack);
apiStack.addDependency(buildStack);

// Tags for all resources
cdk.Tags.of(app).add('Project', 'MACP');
cdk.Tags.of(app).add('Environment', config.environment);
