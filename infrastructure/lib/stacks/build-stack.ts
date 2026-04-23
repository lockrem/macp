import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface BuildStackProps extends cdk.StackProps {
  prefix: string;
}

export class BuildStack extends cdk.Stack {
  public readonly memoryBucket: s3.Bucket;
  public readonly archiveBucket: s3.Bucket;
  public readonly archiveKey: kms.Key;
  public readonly archiveTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: BuildStackProps) {
    super(scope, id, props);

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

    // Outputs
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
