"use strict";
/**
 * Audit Service
 *
 * Provides structured logging for conversation events to enable
 * debugging and review of agent decision-making processes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startConversationAudit = startConversationAudit;
exports.logAuditEvent = logAuditEvent;
exports.logBiddingResults = logBiddingResults;
exports.logUserMessage = logUserMessage;
exports.logAgentResponse = logAgentResponse;
exports.logHostResponse = logHostResponse;
exports.logOrchestrationDecision = logOrchestrationDecision;
exports.logTaskMatch = logTaskMatch;
exports.logMemorySaved = logMemorySaved;
exports.endConversationAudit = endConversationAudit;
exports.flushAuditBuffer = flushAuditBuffer;
exports.listConversationAudits = listConversationAudits;
exports.getConversationAudit = getConversationAudit;
const client_s3_1 = require("@aws-sdk/client-s3");
const ulid_1 = require("ulid");
// -----------------------------------------------------------------------------
// In-Memory Buffer (for batching writes)
// -----------------------------------------------------------------------------
const eventBuffer = new Map();
const conversationMeta = new Map();
// -----------------------------------------------------------------------------
// S3 Client
// -----------------------------------------------------------------------------
const s3Client = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET_NAME = process.env.S3_BUCKET || 'macp-dev-storage';
const AUDIT_PREFIX = 'audit/conversations/';
// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------
/**
 * Start auditing a new conversation
 */
function startConversationAudit(conversationId, hostAgentId, hostAgentName, userAgentNames = []) {
    const now = new Date().toISOString();
    conversationMeta.set(conversationId, {
        conversationId,
        startedAt: now,
        hostAgentId,
        hostAgentName,
        userAgentNames,
        totalTurns: 0,
        events: [],
    });
    eventBuffer.set(conversationId, []);
    logAuditEvent(conversationId, 'conversation_start', {
        metadata: { hostAgentId, hostAgentName, userAgentNames }
    });
    console.log(`[Audit] Started conversation audit: ${conversationId}`);
}
/**
 * Log an audit event for a conversation
 */
function logAuditEvent(conversationId, type, data, hostAgentId, hostAgentName) {
    const event = {
        id: (0, ulid_1.ulid)(),
        timestamp: new Date().toISOString(),
        type,
        conversationId,
        hostAgentId: hostAgentId || conversationMeta.get(conversationId)?.hostAgentId,
        hostAgentName: hostAgentName || conversationMeta.get(conversationId)?.hostAgentName,
        data,
    };
    // Add to buffer
    const buffer = eventBuffer.get(conversationId) || [];
    buffer.push(event);
    eventBuffer.set(conversationId, buffer);
    // Update turn count for message events
    if (type === 'user_message' || type === 'agent_response' || type === 'host_response') {
        const meta = conversationMeta.get(conversationId);
        if (meta) {
            meta.totalTurns = (meta.totalTurns || 0) + 1;
        }
    }
    // Log to console as well for CloudWatch
    console.log(`[Audit] ${type}: ${JSON.stringify(data).substring(0, 200)}...`);
}
/**
 * Log bidding results
 */
function logBiddingResults(conversationId, results, participatingAgents) {
    logAuditEvent(conversationId, 'bidding_round', {
        biddingResults: results,
        participatingAgents,
    });
}
/**
 * Log a user message with person detection
 */
function logUserMessage(conversationId, message, personDetection) {
    logAuditEvent(conversationId, 'user_message', { message });
    if (personDetection?.personName) {
        logAuditEvent(conversationId, 'person_detected', {
            personName: personDetection.personName,
            relationshipFound: personDetection.relationshipFound,
            relationshipUnknown: personDetection.relationshipUnknown,
            memoriesChecked: personDetection.memoriesChecked,
        });
    }
}
/**
 * Log an agent response
 */
function logAgentResponse(conversationId, agentId, agentName, agentEmoji, response) {
    logAuditEvent(conversationId, 'agent_response', {
        agentId,
        agentName,
        agentEmoji,
        response,
    });
}
/**
 * Log host response
 */
function logHostResponse(conversationId, response) {
    logAuditEvent(conversationId, 'host_response', {
        hostResponse: response,
    });
}
/**
 * Log orchestration decision
 */
function logOrchestrationDecision(conversationId, decision, reason) {
    logAuditEvent(conversationId, 'orchestration_decision', {
        decision,
        reason,
    });
}
/**
 * Log task match
 */
function logTaskMatch(conversationId, taskId, taskDescription, matchedHostAgent) {
    logAuditEvent(conversationId, 'task_match', {
        taskId,
        taskDescription,
        matchedHostAgent,
    });
}
/**
 * Log memory saved
 */
function logMemorySaved(conversationId, memoryContent, category) {
    logAuditEvent(conversationId, 'memory_saved', {
        metadata: { memoryContent, category }
    });
}
/**
 * End conversation audit and persist to S3
 */
async function endConversationAudit(conversationId) {
    const meta = conversationMeta.get(conversationId);
    const events = eventBuffer.get(conversationId) || [];
    if (!meta) {
        console.warn(`[Audit] No metadata found for conversation: ${conversationId}`);
        return;
    }
    logAuditEvent(conversationId, 'conversation_end', {});
    const audit = {
        conversationId,
        startedAt: meta.startedAt || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        hostAgentId: meta.hostAgentId,
        hostAgentName: meta.hostAgentName,
        userAgentNames: meta.userAgentNames || [],
        totalTurns: meta.totalTurns || 0,
        events: eventBuffer.get(conversationId) || [],
    };
    // Persist to S3
    try {
        const key = `${AUDIT_PREFIX}${conversationId}.json`;
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: JSON.stringify(audit, null, 2),
            ContentType: 'application/json',
        }));
        console.log(`[Audit] Saved conversation audit to S3: ${key}`);
    }
    catch (error) {
        console.error(`[Audit] Failed to save to S3:`, error);
    }
    // Clean up buffers
    eventBuffer.delete(conversationId);
    conversationMeta.delete(conversationId);
}
/**
 * Flush current buffer to S3 without ending (for long conversations)
 */
async function flushAuditBuffer(conversationId) {
    const events = eventBuffer.get(conversationId);
    if (!events || events.length === 0)
        return;
    const meta = conversationMeta.get(conversationId);
    const partialAudit = {
        conversationId,
        startedAt: meta?.startedAt || new Date().toISOString(),
        hostAgentId: meta?.hostAgentId,
        hostAgentName: meta?.hostAgentName,
        userAgentNames: meta?.userAgentNames || [],
        totalTurns: meta?.totalTurns || 0,
        events,
    };
    try {
        const key = `${AUDIT_PREFIX}${conversationId}.json`;
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: JSON.stringify(partialAudit, null, 2),
            ContentType: 'application/json',
        }));
        console.log(`[Audit] Flushed audit buffer to S3: ${key}`);
    }
    catch (error) {
        console.error(`[Audit] Failed to flush to S3:`, error);
    }
}
// -----------------------------------------------------------------------------
// Retrieval API
// -----------------------------------------------------------------------------
/**
 * List all conversation audits
 */
async function listConversationAudits(limit = 50) {
    try {
        const response = await s3Client.send(new client_s3_1.ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: AUDIT_PREFIX,
            MaxKeys: limit,
        }));
        const audits = [];
        for (const obj of response.Contents || []) {
            if (!obj.Key)
                continue;
            try {
                const getResponse = await s3Client.send(new client_s3_1.GetObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: obj.Key,
                }));
                const body = await getResponse.Body?.transformToString();
                if (body) {
                    const audit = JSON.parse(body);
                    audits.push({
                        conversationId: audit.conversationId,
                        startedAt: audit.startedAt,
                        hostAgentName: audit.hostAgentName,
                        totalTurns: audit.totalTurns,
                    });
                }
            }
            catch (e) {
                // Skip invalid files
            }
        }
        // Sort by most recent first
        audits.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
        return audits;
    }
    catch (error) {
        console.error('[Audit] Failed to list audits:', error);
        return [];
    }
}
/**
 * Get a specific conversation audit
 */
async function getConversationAudit(conversationId) {
    try {
        const key = `${AUDIT_PREFIX}${conversationId}.json`;
        const response = await s3Client.send(new client_s3_1.GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        }));
        const body = await response.Body?.transformToString();
        if (body) {
            return JSON.parse(body);
        }
        return null;
    }
    catch (error) {
        console.error(`[Audit] Failed to get audit for ${conversationId}:`, error);
        return null;
    }
}
//# sourceMappingURL=audit-service.js.map