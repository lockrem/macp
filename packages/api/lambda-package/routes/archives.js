"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerArchiveRoutes = registerArchiveRoutes;
const ulid_1 = require("ulid");
const client_s3_1 = require("@aws-sdk/client-s3");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const redis_store_js_1 = require("../services/redis-store.js");
// -----------------------------------------------------------------------------
// AWS Clients
// -----------------------------------------------------------------------------
const region = process.env.AWS_REGION || 'us-east-1';
const s3Client = new client_s3_1.S3Client({ region });
const dynamoClient = new client_dynamodb_1.DynamoDBClient({ region });
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const archiveBucket = process.env.ARCHIVE_BUCKET || 'macp-dev-archives';
const archiveTable = process.env.ARCHIVE_TABLE || 'macp-dev-archives';
// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
function registerArchiveRoutes(app) {
    // Archive a conversation
    app.post('/conversations/:conversationId/archive', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { conversationId } = req.params;
        const userId = req.user.userId;
        // Get the conversation from Redis
        const conversation = await redis_store_js_1.conversationStore.get(conversationId);
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
        const existingArchive = await docClient.send(new lib_dynamodb_1.QueryCommand({
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
        const archiveId = (0, ulid_1.ulid)();
        const s3Key = `archives/${userId}/${archiveId}.json`;
        const archivedAt = new Date().toISOString();
        // Build the transcript JSON
        const transcript = {
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
            await s3Client.send(new client_s3_1.PutObjectCommand({
                Bucket: archiveBucket,
                Key: s3Key,
                Body: JSON.stringify(transcript, null, 2),
                ContentType: 'application/json',
                ServerSideEncryption: 'aws:kms',
                // KMS key is configured at bucket level, no need to specify here
            }));
            // Store metadata in DynamoDB
            const metadata = {
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
            await docClient.send(new lib_dynamodb_1.PutCommand({
                TableName: archiveTable,
                Item: metadata,
            }));
            // Mark the conversation as archived so it's hidden from the list
            conversation.isArchived = true;
            await redis_store_js_1.conversationStore.set(conversation);
            app.log.info({ userId, archiveId, conversationId }, 'Conversation archived');
            return {
                archiveId,
                conversationId,
                topic: conversation.topic,
                messageCount: conversation.messages.length,
                archivedAt,
            };
        }
        catch (error) {
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
            const result = await docClient.send(new lib_dynamodb_1.QueryCommand({
                TableName: archiveTable,
                KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
                ExpressionAttributeValues: {
                    ':pk': `USER#${userId}`,
                    ':sk': 'ARCHIVE#',
                },
                ScanIndexForward: false, // Most recent first
            }));
            const archives = (result.Items || []).map((item) => ({
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
        }
        catch (error) {
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
        const { archiveId } = req.params;
        const userId = req.user.userId;
        try {
            // Query by archiveId using GSI
            const result = await docClient.send(new lib_dynamodb_1.QueryCommand({
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
        }
        catch (error) {
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
        const { archiveId } = req.params;
        const userId = req.user.userId;
        try {
            // Get archive metadata to verify ownership and get S3 key
            const metadataResult = await docClient.send(new lib_dynamodb_1.QueryCommand({
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
            const s3Response = await s3Client.send(new client_s3_1.GetObjectCommand({
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
        }
        catch (error) {
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
        const { conversationId } = req.params;
        const userId = req.user.userId;
        const conversation = await redis_store_js_1.conversationStore.get(conversationId);
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
        await redis_store_js_1.conversationStore.set(conversation);
        return { success: true, conversationId };
    });
    // Delete an archive
    app.delete('/archives/:archiveId', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { archiveId } = req.params;
        const userId = req.user.userId;
        try {
            // Get archive metadata
            const result = await docClient.send(new lib_dynamodb_1.QueryCommand({
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
            await docClient.send(new lib_dynamodb_1.DeleteCommand({
                TableName: archiveTable,
                Key: {
                    pk: archive.pk,
                    sk: archive.sk,
                },
            }));
            app.log.info({ userId, archiveId }, 'Archive deleted');
            return { success: true, archiveId };
        }
        catch (error) {
            app.log.error({ userId, archiveId, error: error.message }, 'Failed to delete archive');
            reply.code(500);
            return { error: 'Failed to delete archive' };
        }
    });
}
//# sourceMappingURL=archives.js.map