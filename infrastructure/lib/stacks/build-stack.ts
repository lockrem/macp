import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface BuildStackProps extends cdk.StackProps {
  prefix: string;
}

export class BuildStack extends cdk.Stack {
  public readonly repository: ecr.Repository;
  public readonly buildProject: codebuild.Project;
  public readonly sourceBucket: s3.Bucket;
  public readonly memoryBucket: s3.Bucket;
  public readonly archiveBucket: s3.Bucket;
  public readonly archiveKey: kms.Key;
  public readonly archiveTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: BuildStackProps) {
    super(scope, id, props);

    // ECR Repository for the API server image
    this.repository = new ecr.Repository(this, 'Repository', {
      repositoryName: `${props.prefix}-api`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      imageScanOnPush: true,
      lifecycleRules: [
        {
          maxImageCount: 10,
          description: 'Keep only 10 images',
        },
      ],
    });

    // S3 bucket for source code uploads
    this.sourceBucket = new s3.Bucket(this, 'SourceBucket', {
      bucketName: `${props.prefix}-build-source-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(7),
        },
      ],
    });

    // S3 bucket for agent memory files (encrypted)
    this.memoryBucket = new s3.Bucket(this, 'MemoryBucket', {
      bucketName: `${props.prefix}-memories-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Keep memories even if stack is deleted
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED, // Server-side encryption
      versioned: true, // Keep history of memory changes
      lifecycleRules: [
        {
          // Move old versions to cheaper storage after 30 days
          noncurrentVersionTransitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
          // Delete old versions after 90 days
          noncurrentVersionExpiration: cdk.Duration.days(90),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
          allowedOrigins: ['*'], // Configure properly for production
          allowedHeaders: ['*'],
        },
      ],
    });

    // KMS Key for archive encryption
    this.archiveKey = new kms.Key(this, 'ArchiveKey', {
      alias: `${props.prefix}-archive-key`,
      description: 'KMS key for encrypting conversation archives',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // S3 bucket for conversation archives (SSE-KMS encrypted)
    this.archiveBucket = new s3.Bucket(this, 'ArchiveBucket', {
      bucketName: `${props.prefix}-archives-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.archiveKey,
      versioned: true,
      lifecycleRules: [
        {
          // Move to Infrequent Access after 90 days (archives are rarely accessed)
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
        },
      ],
    });

    // DynamoDB table for archive metadata
    this.archiveTable = new dynamodb.Table(this, 'ArchiveTable', {
      tableName: `${props.prefix}-archives`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING }, // USER#userId
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },      // ARCHIVE#archiveId
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    // GSI for querying by archive ID directly
    this.archiveTable.addGlobalSecondaryIndex({
      indexName: 'archiveId-index',
      partitionKey: { name: 'archiveId', type: dynamodb.AttributeType.STRING },
    });

    // GSI for querying by conversation ID
    this.archiveTable.addGlobalSecondaryIndex({
      indexName: 'conversationId-index',
      partitionKey: { name: 'conversationId', type: dynamodb.AttributeType.STRING },
    });

    // CodeBuild project
    this.buildProject = new codebuild.Project(this, 'BuildProject', {
      projectName: `${props.prefix}-api-build`,
      description: 'Builds the MACP API server Docker image',
      source: codebuild.Source.s3({
        bucket: this.sourceBucket,
        path: 'source.zip',
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true, // Required for Docker builds
        computeType: codebuild.ComputeType.SMALL,
      },
      environmentVariables: {
        AWS_ACCOUNT_ID: {
          value: this.account,
        },
        AWS_REGION: {
          value: this.region,
        },
        ECR_REPO_URI: {
          value: this.repository.repositoryUri,
        },
        IMAGE_TAG: {
          value: 'latest',
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              'aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com',
              'echo Setting image tag...',
              'export IMAGE_TAG=$(date +%Y%m%d%H%M%S)-$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-7)',
            ],
          },
          build: {
            commands: [
              'echo Build started on `date`',
              'echo Building the Docker image...',
              'docker build -t $ECR_REPO_URI:$IMAGE_TAG -t $ECR_REPO_URI:latest -f packages/api/Dockerfile .',
            ],
          },
          post_build: {
            commands: [
              'echo Build completed on `date`',
              'echo Pushing the Docker image...',
              'docker push $ECR_REPO_URI:$IMAGE_TAG',
              'docker push $ECR_REPO_URI:latest',
              'echo Writing image definitions file...',
              'printf \'{"ImageURI":"%s"}\' $ECR_REPO_URI:$IMAGE_TAG > imageDetail.json',
            ],
          },
        },
        artifacts: {
          files: ['imageDetail.json'],
        },
      }),
      timeout: cdk.Duration.minutes(30),
    });

    // Grant CodeBuild permission to push to ECR
    this.repository.grantPullPush(this.buildProject);

    // Grant CodeBuild permission to read from S3
    this.sourceBucket.grantRead(this.buildProject);

    // Outputs
    new cdk.CfnOutput(this, 'RepositoryUri', {
      value: this.repository.repositoryUri,
      description: 'ECR Repository URI',
      exportName: `${props.prefix}-ecr-uri`,
    });

    new cdk.CfnOutput(this, 'SourceBucketName', {
      value: this.sourceBucket.bucketName,
      description: 'S3 Bucket for source code uploads',
      exportName: `${props.prefix}-source-bucket`,
    });

    new cdk.CfnOutput(this, 'BuildProjectName', {
      value: this.buildProject.projectName,
      description: 'CodeBuild project name',
      exportName: `${props.prefix}-build-project`,
    });

    new cdk.CfnOutput(this, 'MemoryBucketName', {
      value: this.memoryBucket.bucketName,
      description: 'S3 Bucket for agent memory files',
      exportName: `${props.prefix}-memory-bucket`,
    });

    new cdk.CfnOutput(this, 'ArchiveBucketName', {
      value: this.archiveBucket.bucketName,
      description: 'S3 Bucket for conversation archives (KMS encrypted)',
      exportName: `${props.prefix}-archive-bucket`,
    });

    new cdk.CfnOutput(this, 'ArchiveKeyArn', {
      value: this.archiveKey.keyArn,
      description: 'KMS Key ARN for archive encryption',
      exportName: `${props.prefix}-archive-key-arn`,
    });

    new cdk.CfnOutput(this, 'ArchiveTableName', {
      value: this.archiveTable.tableName,
      description: 'DynamoDB table for archive metadata',
      exportName: `${props.prefix}-archive-table`,
    });
  }
}
