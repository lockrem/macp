import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  prefix: string;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  database: rds.DatabaseCluster;
  redis: elasticache.CfnCacheCluster;
  vpc: ec2.Vpc;
  memoryBucket: s3.IBucket;
  archiveBucket: s3.IBucket;
  archiveKey: kms.IKey;
  archiveTable: dynamodb.ITable;
  domainName?: string;
}

export class ApiStack extends cdk.Stack {
  public readonly apiFunction: lambda.Function;
  public readonly httpApi: apigateway.HttpApi;
  public readonly webSocketApi: apigateway.WebSocketApi;
  public readonly webSocketFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Log Group
    const logGroup = new logs.LogGroup(this, 'ApiLogs', {
      logGroupName: `/aws/lambda/${props.prefix}-api`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Get database secret
    const databaseSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'DatabaseSecret',
      `${props.prefix}/database`
    );

    // Create secret for API keys (Anthropic, OpenAI)
    const apiKeysSecret = new secretsmanager.Secret(this, 'ApiKeysSecret', {
      secretName: `${props.prefix}/api-keys`,
      description: 'API keys for AI providers',
    });

    // Create secret for JWT signing
    const jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: `${props.prefix}/jwt-secret`,
      description: 'Secret for signing JWTs',
      generateSecretString: {
        excludePunctuation: false,
        includeSpace: false,
        passwordLength: 64,
      },
    });

    // Security group for Lambda in VPC
    const lambdaSG = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc: props.vpc,
      securityGroupName: `${props.prefix}-lambda-sg`,
      description: 'Security group for MACP API Lambda',
    });

    // Allow Lambda to access database
    lambdaSG.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow outbound to PostgreSQL'
    );

    // Allow Lambda to access Redis
    lambdaSG.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(6379),
      'Allow outbound to Redis'
    );

    // Allow HTTPS outbound for AWS services and external APIs
    lambdaSG.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow outbound HTTPS'
    );

    // Lambda function for API (bundled with esbuild)
    this.apiFunction = new lambda.Function(this, 'ApiFunction', {
      functionName: `${props.prefix}-api`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'dist/lambda.handler',
      code: lambda.Code.fromAsset('../lambda-deploy'),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSG],
      logGroup,
      environment: {
        NODE_ENV: 'production',
        PREFIX: props.prefix,
        REDIS_HOST: props.redis.attrRedisEndpointAddress,
        REDIS_PORT: props.redis.attrRedisEndpointPort,
        COGNITO_USER_POOL_ID: props.userPool.userPoolId,
        COGNITO_CLIENT_ID: props.userPoolClient.userPoolClientId,
        MEMORY_BUCKET: props.memoryBucket.bucketName,
        ARCHIVE_BUCKET: props.archiveBucket.bucketName,
        ARCHIVE_TABLE: props.archiveTable.tableName,
        PUBLIC_AGENTS_USE_DB: 'true',
        PUBLIC_AGENTS_DUAL_WRITE: 'true',
      },
    });

    // Add secrets to Lambda environment (via IAM, not direct injection)
    databaseSecret.grantRead(this.apiFunction);
    apiKeysSecret.grantRead(this.apiFunction);
    jwtSecret.grantRead(this.apiFunction);

    // Grant permissions for S3 buckets
    props.memoryBucket.grantReadWrite(this.apiFunction);
    props.archiveBucket.grantReadWrite(this.apiFunction);
    props.archiveKey.grantEncryptDecrypt(this.apiFunction);
    props.archiveTable.grantReadWriteData(this.apiFunction);

    // HTTP API Gateway
    this.httpApi = new apigateway.HttpApi(this, 'HttpApi', {
      apiName: `${props.prefix}-api`,
      description: 'MACP API Gateway',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigateway.CorsHttpMethod.ANY],
        allowHeaders: ['*'],
      },
    });

    // Lambda integration
    const lambdaIntegration = new apigatewayIntegrations.HttpLambdaIntegration(
      'LambdaIntegration',
      this.apiFunction
    );

    // Add routes - catch all to Lambda
    this.httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigateway.HttpMethod.ANY],
      integration: lambdaIntegration,
    });

    // Root path
    this.httpApi.addRoutes({
      path: '/',
      methods: [apigateway.HttpMethod.ANY],
      integration: lambdaIntegration,
    });

    // =========================================================================
    // WebSocket API for real-time autonomous conversations
    // =========================================================================

    // Log group for WebSocket Lambda
    const wsLogGroup = new logs.LogGroup(this, 'WebSocketLogs', {
      logGroupName: `/aws/lambda/${props.prefix}-websocket`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Lambda for WebSocket handling (longer timeout for conversations)
    this.webSocketFunction = new lambda.Function(this, 'WebSocketFunction', {
      functionName: `${props.prefix}-websocket`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'dist/websocket-handler.handler',
      code: lambda.Code.fromAsset('../lambda-deploy'),
      memorySize: 1024,
      timeout: cdk.Duration.minutes(5), // Longer timeout for conversations
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSG],
      logGroup: wsLogGroup,
      environment: {
        NODE_ENV: 'production',
        PREFIX: props.prefix,
        REDIS_HOST: props.redis.attrRedisEndpointAddress,
        REDIS_PORT: props.redis.attrRedisEndpointPort,
        MEMORY_BUCKET: props.memoryBucket.bucketName,
        PUBLIC_AGENTS_USE_DB: 'true',
      },
    });

    // Grant WebSocket Lambda access to S3
    props.memoryBucket.grantReadWrite(this.webSocketFunction);

    // Grant WebSocket Lambda access to database secret for agent lookups
    databaseSecret.grantRead(this.webSocketFunction);

    // WebSocket API
    this.webSocketApi = new apigateway.WebSocketApi(this, 'WebSocketApi', {
      apiName: `${props.prefix}-websocket`,
      description: 'MACP WebSocket API for real-time conversations',
      connectRouteOptions: {
        integration: new apigatewayIntegrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          this.webSocketFunction
        ),
      },
      disconnectRouteOptions: {
        integration: new apigatewayIntegrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          this.webSocketFunction
        ),
      },
      defaultRouteOptions: {
        integration: new apigatewayIntegrations.WebSocketLambdaIntegration(
          'DefaultIntegration',
          this.webSocketFunction
        ),
      },
    });

    // WebSocket Stage
    const wsStage = new apigateway.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName: 'v1',
      autoDeploy: true,
    });

    // Grant Lambda permission to send messages to WebSocket clients
    this.webSocketFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${wsStage.stageName}/*`,
      ],
    }));

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.httpApi.apiEndpoint,
      description: 'API URL',
      exportName: `${props.prefix}-api-url`,
    });

    new cdk.CfnOutput(this, 'ApiKeysSecretArn', {
      value: apiKeysSecret.secretArn,
      description: 'API Keys Secret ARN (add your Anthropic/OpenAI keys here)',
      exportName: `${props.prefix}-api-keys-secret-arn`,
    });

    new cdk.CfnOutput(this, 'LambdaFunctionArn', {
      value: this.apiFunction.functionArn,
      description: 'Lambda Function ARN',
      exportName: `${props.prefix}-lambda-arn`,
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: this.apiFunction.functionName,
      description: 'Lambda Function Name',
      exportName: `${props.prefix}-lambda-name`,
    });

    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: wsStage.url,
      description: 'WebSocket URL for real-time conversations',
      exportName: `${props.prefix}-websocket-url`,
    });
  }
}
