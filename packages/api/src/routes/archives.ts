import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ulid } from 'ulid';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { conversationStore } from '../services/redis-store.js';

// -----------------------------------------------------------------------------
// AWS Clients
// -----------------------------------------------------------------------------

const region = process.env.AWS_REGION || 'us-east-1';
const s3Client = new S3Client({ region });
const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const archiveBucket = process.env.ARCHIVE_BUCKET || 'macp-dev-archives';
const archiveTable = process.env.ARCHIVE_TABLE || 'macp-dev-archives';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ArchiveMetadata {
  pk: string;              // USER#userId
  sk: string;              // ARCHIVE#archiveId
  archiveId: string;
  userId: string;
  conversationId: string;
  topic: string;
  goal?: string;
  status: string;
  totalTurns: number;
  messageCount: number;
  participants: Array<{ agentName: string; provider: string }>;
  archivedAt: string;
  s3Key: string;
}

interface ArchiveTranscript {
  version: string;
  metadata: {
    archiveId: string;
    conversationId: string;
    topic: string;
    goal?: string;
    participants: Array<{ agentName: string; provider: string }>;
    status: string;
    totalTurns: number;
    startedAt?: string;
    completedAt: string;
    archivedAt: string;
  };
  messages: Array<{
    turnNumber: number;
    agentName: string;
    provider: string;
    content: string;
    timestamp: string;
  }>;
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export function registerArchiveRoutes(app: FastifyInstance): void {
  // Archive a conversation
  app.post('/conversations/:conversationId/archive', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { conversationId } = req.params as { conversationId: string };
    const userId = req.user.userId;

    // Get the conversation from Redis
    const conversation = await conversationStore.get(conversationId);
    if (!conversation) {
      reply.code(404);
      return { error: 'Conversation not found' };
    }

    // Check if user is a participant
    const isParticipant = conversation.participants.some(p => p.userId === userId);
    const isInitiator = conversation.initiatorId === userId;
    if (!isParticipant && !isInitiator) {
      reply.code(403);
      return { error: 'Not authorized to archive this conversation' };
    }

    // Check if already archived
    if (conversation.isArchived) {
      reply.code(400);
      return { error: 'Conversation is already archived' };
    }

    // Check if an archive already exists for this conversation
    const existingArchive = await docClient.send(new QueryCommand({
      TableName: archiveTable,
      IndexName: 'conversationId-index',
      KeyConditionExpression: 'conversationId = :cid',
      ExpressionAttributeValues: {
        ':cid': conversationId,
      },
      Limit: 1,
    }));

    if (existingArchive.Items && existingArchive.Items.length > 0) {
      reply.code(400);
      return { error: 'This conversation has already been archived' };
    }

    // Generate archive ID and S3 key
    const archiveId = ulid();
    const s3Key = `archives/${userId}/${archiveId}.json`;
    const archivedAt = new Date().toISOString();

    // Build the transcript JSON
    const transcript: ArchiveTranscript = {
      version: '1.0',
      metadata: {
        archiveId,
        conversationId,
        topic: conversation.topic,
        goal: conversation.goal,
        participants: conversation.participants.map(p => ({
          agentName: p.agentConfig.displayName,
          provider: p.agentConfig.provider,
        })),
        status: conversation.status,
        totalTurns: conversation.currentTurn,
        startedAt: conversation.messages[0]?.createdAt,
        completedAt: conversation.messages[conversation.messages.length - 1]?.createdAt || archivedAt,
        archivedAt,
      },
      messages: conversation.messages.map(m => ({
        turnNumber: m.turnNumber,
        agentName: m.agentName,
        provider: conversation.participants.find(p => p.agentId === m.agentId)?.agentConfig.provider || 'unknown',
        content: m.content,
        timestamp: m.createdAt,
      })),
    };

    try {
      // Upload transcript to S3 with SSE-KMS encryption
      await s3Client.send(new PutObjectCommand({
        Bucket: archiveBucket,
        Key: s3Key,
        Body: JSON.stringify(transcript, null, 2),
        ContentType: 'application/json',
        ServerSideEncryption: 'aws:kms',
        // KMS key is configured at bucket level, no need to specify here
      }));

      // Store metadata in DynamoDB
      const metadata: ArchiveMetadata = {
        pk: `USER#${userId}`,
        sk: `ARCHIVE#${archiveId}`,
        archiveId,
        userId,
        conversationId,
        topic: conversation.topic,
        goal: conversation.goal,
        status: conversation.status,
        totalTurns: conversation.currentTurn,
        messageCount: conversation.messages.length,
        participants: conversation.participants.map(p => ({
          agentName: p.agentConfig.displayName,
          provider: p.agentConfig.provider,
        })),
        archivedAt,
        s3Key,
      };

      await docClient.send(new PutCommand({
        TableName: archiveTable,
        Item: metadata,
      }));

      // Mark the conversation as archived so it's hidden from the list
      conversation.isArchived = true;
      await conversationStore.set(conversation);

      app.log.info({ userId, archiveId, conversationId }, 'Conversation archived');

      return {
        archiveId,
        conversationId,
        topic: conversation.topic,
        messageCount: conversation.messages.length,
        archivedAt,
      };
    } catch (error: any) {
      app.log.error({ userId, conversationId, error: error.message }, 'Failed to archive conversation');
      reply.code(500);
      return { error: 'Failed to archive conversation' };
    }
  });

  // List user's archives
  app.get('/archives', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;

    try {
      const result = await docClient.send(new QueryCommand({
        TableName: archiveTable,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'ARCHIVE#',
        },
        ScanIndexForward: false, // Most recent first
      }));

      const archives = (result.Items || []).map((item: Record<string, unknown>) => ({
        archiveId: item.archiveId,
        conversationId: item.conversationId,
        topic: item.topic,
        goal: item.goal,
        status: item.status,
        totalTurns: item.totalTurns,
        messageCount: item.messageCount,
        participants: item.participants,
        archivedAt: item.archivedAt,
      }));

      return { archives };
    } catch (error: any) {
      app.log.error({ userId, error: error.message }, 'Failed to list archives');
      reply.code(500);
      return { error: 'Failed to list archives' };
    }
  });

  // Get archive metadata
  app.get('/archives/:archiveId', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { archiveId } = req.params as { archiveId: string };
    const userId = req.user.userId;

    try {
      // Query by archiveId using GSI
      const result = await docClient.send(new QueryCommand({
        TableName: archiveTable,
        IndexName: 'archiveId-index',
        KeyConditionExpression: 'archiveId = :archiveId',
        ExpressionAttributeValues: {
          ':archiveId': archiveId,
        },
      }));

      const archive = result.Items?.[0];
      if (!archive) {
        reply.code(404);
        return { error: 'Archive not found' };
      }

      // Check ownership
      if (archive.userId !== userId) {
        reply.code(403);
        return { error: 'Not authorized to access this archive' };
      }

      return {
        archiveId: archive.archiveId,
        conversationId: archive.conversationId,
        topic: archive.topic,
        goal: archive.goal,
        status: archive.status,
        totalTurns: archive.totalTurns,
        messageCount: archive.messageCount,
        participants: archive.participants,
        archivedAt: archive.archivedAt,
      };
    } catch (error: any) {
      app.log.error({ userId, archiveId, error: error.message }, 'Failed to get archive');
      reply.code(500);
      return { error: 'Failed to get archive' };
    }
  });

  // Download archive transcript
  app.get('/archives/:archiveId/transcript', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { archiveId } = req.params as { archiveId: string };
    const userId = req.user.userId;

    try {
      // Get archive metadata to verify ownership and get S3 key
      const metadataResult = await docClient.send(new QueryCommand({
        TableName: archiveTable,
        IndexName: 'archiveId-index',
        KeyConditionExpression: 'archiveId = :archiveId',
        ExpressionAttributeValues: {
          ':archiveId': archiveId,
        },
      }));

      const archive = metadataResult.Items?.[0];
      if (!archive) {
        reply.code(404);
        return { error: 'Archive not found' };
      }

      // Check ownership
      if (archive.userId !== userId) {
        reply.code(403);
        return { error: 'Not authorized to access this archive' };
      }

      // Fetch transcript from S3
      const s3Response = await s3Client.send(new GetObjectCommand({
        Bucket: archiveBucket,
        Key: archive.s3Key,
      }));

      const transcriptJson = await s3Response.Body?.transformToString();
      if (!transcriptJson) {
        reply.code(500);
        return { error: 'Failed to read archive transcript' };
      }

      const transcript = JSON.parse(transcriptJson);

      return transcript;
    } catch (error: any) {
      app.log.error({ userId, archiveId, error: error.message }, 'Failed to get transcript');
      reply.code(500);
      return { error: 'Failed to get archive transcript' };
    }
  });

  // Mark a conversation as archived (utility to fix pre-existing data)
  app.post('/conversations/:conversationId/mark-archived', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { conversationId } = req.params as { conversationId: string };
    const userId = req.user.userId;

    const conversation = await conversationStore.get(conversationId);
    if (!conversation) {
      reply.code(404);
      return { error: 'Conversation not found' };
    }

    // Check authorization
    const isParticipant = conversation.participants.some(p => p.userId === userId);
    const isInitiator = conversation.initiatorId === userId;
    if (!isParticipant && !isInitiator) {
      reply.code(403);
      return { error: 'Not authorized' };
    }

    conversation.isArchived = true;
    await conversationStore.set(conversation);

    return { success: true, conversationId };
  });

  // Delete an archive
  app.delete('/archives/:archiveId', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { archiveId } = req.params as { archiveId: string };
    const userId = req.user.userId;

    try {
      // Get archive metadata
      const result = await docClient.send(new QueryCommand({
        TableName: archiveTable,
        IndexName: 'archiveId-index',
        KeyConditionExpression: 'archiveId = :archiveId',
        ExpressionAttributeValues: {
          ':archiveId': archiveId,
        },
      }));

      const archive = result.Items?.[0];
      if (!archive) {
        reply.code(404);
        return { error: 'Archive not found' };
      }

      if (archive.userId !== userId) {
        reply.code(403);
        return { error: 'Not authorized to delete this archive' };
      }

      // Delete from DynamoDB (keep S3 for data retention - it will lifecycle to Glacier)
      await docClient.send(new DeleteCommand({
        TableName: archiveTable,
        Key: {
          pk: archive.pk,
          sk: archive.sk,
        },
      }));

      app.log.info({ userId, archiveId }, 'Archive deleted');

      return { success: true, archiveId };
    } catch (error: any) {
      app.log.error({ userId, archiveId, error: error.message }, 'Failed to delete archive');
      reply.code(500);
      return { error: 'Failed to delete archive' };
    }
  });
}
