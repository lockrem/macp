import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  prefix: string;
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
  database: rds.DatabaseCluster;
  redis: elasticache.CfnCacheCluster;
  vpc: ec2.Vpc;
  repository: ecr.IRepository;
  memoryBucket: s3.IBucket;
  archiveBucket: s3.IBucket;
  archiveKey: kms.IKey;
  archiveTable: dynamodb.ITable;
  domainName?: string;
}

export class ApiStack extends cdk.Stack {
  public readonly service: ecsPatterns.ApplicationLoadBalancedFargateService;
  public readonly cluster: ecs.Cluster;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // ECS Cluster
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `${props.prefix}-cluster`,
      vpc: props.vpc,
      containerInsights: true,
    });

    // Log Group
    const logGroup = new logs.LogGroup(this, 'ServiceLogs', {
      logGroupName: `/ecs/${props.prefix}-api`,
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

    // Security group for the service
    const serviceSG = new ec2.SecurityGroup(this, 'ServiceSG', {
      vpc: props.vpc,
      securityGroupName: `${props.prefix}-service-sg`,
      description: 'Security group for MACP API service',
    });

    // Allow service to access database (defined in database stack's security group)
    serviceSG.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow outbound to PostgreSQL'
    );

    // Allow service to access Redis
    serviceSG.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(6379),
      'Allow outbound to Redis'
    );

    // Fargate Service with ALB
    this.service = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      'Service',
      {
        cluster: this.cluster,
        serviceName: `${props.prefix}-api`,
        cpu: 512,
        memoryLimitMiB: 1024,
        desiredCount: 2,
        publicLoadBalancer: true,
        taskSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        securityGroups: [serviceSG],
        taskImageOptions: {
          image: ecs.ContainerImage.fromEcrRepository(props.repository, 'latest'),
          containerPort: 3000,
          logDriver: ecs.LogDrivers.awsLogs({
            streamPrefix: 'api',
            logGroup,
          }),
          environment: {
            NODE_ENV: 'production',
            REDIS_HOST: props.redis.attrRedisEndpointAddress,
            REDIS_PORT: props.redis.attrRedisEndpointPort,
            COGNITO_USER_POOL_ID: props.userPool.userPoolId,
            COGNITO_CLIENT_ID: props.userPoolClient.userPoolClientId,
            MEMORY_BUCKET: props.memoryBucket.bucketName,
            ARCHIVE_BUCKET: props.archiveBucket.bucketName,
            ARCHIVE_TABLE: props.archiveTable.tableName,
          },
          secrets: {
            DATABASE_URL: ecs.Secret.fromSecretsManager(databaseSecret, 'connectionString'),
            ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(apiKeysSecret, 'ANTHROPIC_API_KEY'),
            OPENAI_API_KEY: ecs.Secret.fromSecretsManager(apiKeysSecret, 'OPENAI_API_KEY'),
            JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
          },
        },
        circuitBreaker: {
          rollback: true,
        },
        enableExecuteCommand: true, // Allow ECS Exec for debugging
      }
    );

    // Health check configuration
    this.service.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200',
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    // Auto-scaling
    const scaling = this.service.service.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 10,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // Grant permissions
    databaseSecret.grantRead(this.service.taskDefinition.taskRole);
    apiKeysSecret.grantRead(this.service.taskDefinition.taskRole);
    jwtSecret.grantRead(this.service.taskDefinition.taskRole);

    // Allow task to use Secrets Manager
    this.service.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [databaseSecret.secretArn, apiKeysSecret.secretArn, jwtSecret.secretArn],
      })
    );

    // Grant read/write access to memory bucket
    props.memoryBucket.grantReadWrite(this.service.taskDefinition.taskRole);

    // Grant access to archive resources
    props.archiveBucket.grantReadWrite(this.service.taskDefinition.taskRole);
    props.archiveKey.grantEncryptDecrypt(this.service.taskDefinition.taskRole);
    props.archiveTable.grantReadWriteData(this.service.taskDefinition.taskRole);

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `https://${this.service.loadBalancer.loadBalancerDnsName}`,
      description: 'API URL',
      exportName: `${props.prefix}-api-url`,
    });

    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: `wss://${this.service.loadBalancer.loadBalancerDnsName}/ws`,
      description: 'WebSocket URL',
      exportName: `${props.prefix}-ws-url`,
    });

    new cdk.CfnOutput(this, 'ApiKeysSecretArn', {
      value: apiKeysSecret.secretArn,
      description: 'API Keys Secret ARN (add your Anthropic/OpenAI keys here)',
      exportName: `${props.prefix}-api-keys-secret-arn`,
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'ECS Cluster ARN',
      exportName: `${props.prefix}-cluster-arn`,
    });

    new cdk.CfnOutput(this, 'ServiceArn', {
      value: this.service.service.serviceArn,
      description: 'ECS Service ARN',
      exportName: `${props.prefix}-service-arn`,
    });
  }
}
