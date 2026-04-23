/**
 * Audit Service
 *
 * Provides structured logging for conversation events to enable
 * debugging and review of agent decision-making processes.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { ulid } from 'ulid';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type AuditEventType =
  | 'conversation_start'
  | 'user_message'
  | 'person_detected'
  | 'memory_lookup'
  | 'relationship_query'
  | 'memory_saved'
  | 'bidding_round'
  | 'orchestration_decision'
  | 'agent_response'
  | 'task_match'
  | 'task_created'
  | 'task_completed'
  | 'host_response'
  | 'conversation_end';

export interface BiddingResultAudit {
  agentId: string;
  agentName: string;
  agentEmoji: string;
  relevanceScore: number;
  confidenceScore: number;
  noveltyScore: number;
  expertiseScore: number;
  finalScore: number;
  pass: boolean;
  shouldParticipate: boolean;
  hasMatchingTask: boolean;
  reasoning?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  type: AuditEventType;

  // Context
  conversationId: string;
  hostAgentId?: string;
  hostAgentName?: string;

  // Event-specific data
  data: {
    // For user_message
    message?: string;

    // For person_detected
    personName?: string;
    relationshipFound?: string;
    relationshipUnknown?: boolean;
    memoriesChecked?: string[];

    // For memory_lookup
    memoriesFound?: string[];

    // For bidding_round
    biddingResults?: BiddingResultAudit[];
    participatingAgents?: string[];

    // For orchestration_decision
    decision?: string;
    reason?: string;

    // For agent_response
    agentId?: string;
    agentName?: string;
    agentEmoji?: string;
    response?: string;

    // For task_match
    taskId?: string;
    taskDescription?: string;
    matchedHostAgent?: string;

    // For task_created / task_completed
    task?: {
      id: string;
      description: string;
      category: string;
      status: string;
    };
    completionSummary?: string;

    // For host_response
    hostResponse?: string;

    // Generic metadata
    metadata?: Record<string, any>;
  };
}

export interface ConversationAudit {
  conversationId: string;
  startedAt: string;
  endedAt?: string;
  hostAgentId?: string;
  hostAgentName?: string;
  userAgentNames: string[];
  totalTurns: number;
  events: AuditEvent[];
}

// -----------------------------------------------------------------------------
// In-Memory Buffer (for batching writes)
// -----------------------------------------------------------------------------

const eventBuffer: Map<string, AuditEvent[]> = new Map();
const conversationMeta: Map<string, Partial<ConversationAudit>> = new Map();

// -----------------------------------------------------------------------------
// S3 Client
// -----------------------------------------------------------------------------

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET_NAME = process.env.S3_BUCKET || 'macp-dev-storage';
const AUDIT_PREFIX = 'audit/conversations/';

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Start auditing a new conversation
 */
export function startConversationAudit(
  conversationId: string,
  hostAgentId?: string,
  hostAgentName?: string,
  userAgentNames: string[] = []
): void {
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
export function logAuditEvent(
  conversationId: string,
  type: AuditEventType,
  data: AuditEvent['data'],
  hostAgentId?: string,
  hostAgentName?: string
): void {
  const event: AuditEvent = {
    id: ulid(),
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
export function logBiddingResults(
  conversationId: string,
  results: BiddingResultAudit[],
  participatingAgents: string[]
): void {
  logAuditEvent(conversationId, 'bidding_round', {
    biddingResults: results,
    participatingAgents,
  });
}

/**
 * Log a user message with person detection
 */
export function logUserMessage(
  conversationId: string,
  message: string,
  personDetection?: {
    personName?: string;
    relationshipFound?: string;
    relationshipUnknown?: boolean;
    memoriesChecked?: string[];
  }
): void {
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
export function logAgentResponse(
  conversationId: string,
  agentId: string,
  agentName: string,
  agentEmoji: string,
  response: string
): void {
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
export function logHostResponse(
  conversationId: string,
  response: string
): void {
  logAuditEvent(conversationId, 'host_response', {
    hostResponse: response,
  });
}

/**
 * Log orchestration decision
 */
export function logOrchestrationDecision(
  conversationId: string,
  decision: string,
  reason: string
): void {
  logAuditEvent(conversationId, 'orchestration_decision', {
    decision,
    reason,
  });
}

/**
 * Log task match
 */
export function logTaskMatch(
  conversationId: string,
  taskId: string,
  taskDescription: string,
  matchedHostAgent: string
): void {
  logAuditEvent(conversationId, 'task_match', {
    taskId,
    taskDescription,
    matchedHostAgent,
  });
}

/**
 * Log memory saved
 */
export function logMemorySaved(
  conversationId: string,
  memoryContent: string,
  category: string
): void {
  logAuditEvent(conversationId, 'memory_saved', {
    metadata: { memoryContent, category }
  });
}

/**
 * End conversation audit and persist to S3
 */
export async function endConversationAudit(conversationId: string): Promise<void> {
  const meta = conversationMeta.get(conversationId);
  const events = eventBuffer.get(conversationId) || [];

  if (!meta) {
    console.warn(`[Audit] No metadata found for conversation: ${conversationId}`);
    return;
  }

  logAuditEvent(conversationId, 'conversation_end', {});

  const audit: ConversationAudit = {
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
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(audit, null, 2),
      ContentType: 'application/json',
    }));
    console.log(`[Audit] Saved conversation audit to S3: ${key}`);
  } catch (error) {
    console.error(`[Audit] Failed to save to S3:`, error);
  }

  // Clean up buffers
  eventBuffer.delete(conversationId);
  conversationMeta.delete(conversationId);
}

/**
 * Flush current buffer to S3 without ending (for long conversations)
 */
export async function flushAuditBuffer(conversationId: string): Promise<void> {
  const events = eventBuffer.get(conversationId);
  if (!events || events.length === 0) return;

  const meta = conversationMeta.get(conversationId);

  const partialAudit: ConversationAudit = {
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
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(partialAudit, null, 2),
      ContentType: 'application/json',
    }));
    console.log(`[Audit] Flushed audit buffer to S3: ${key}`);
  } catch (error) {
    console.error(`[Audit] Failed to flush to S3:`, error);
  }
}

// -----------------------------------------------------------------------------
// Retrieval API
// -----------------------------------------------------------------------------

/**
 * List all conversation audits
 */
export async function listConversationAudits(limit: number = 50): Promise<Array<{
  conversationId: string;
  startedAt: string;
  hostAgentName?: string;
  totalTurns: number;
}>> {
  try {
    const response = await s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: AUDIT_PREFIX,
      MaxKeys: limit,
    }));

    const audits: Array<{
      conversationId: string;
      startedAt: string;
      hostAgentName?: string;
      totalTurns: number;
    }> = [];

    for (const obj of response.Contents || []) {
      if (!obj.Key) continue;

      try {
        const getResponse = await s3Client.send(new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: obj.Key,
        }));

        const body = await getResponse.Body?.transformToString();
        if (body) {
          const audit = JSON.parse(body) as ConversationAudit;
          audits.push({
            conversationId: audit.conversationId,
            startedAt: audit.startedAt,
            hostAgentName: audit.hostAgentName,
            totalTurns: audit.totalTurns,
          });
        }
      } catch (e) {
        // Skip invalid files
      }
    }

    // Sort by most recent first
    audits.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    return audits;
  } catch (error) {
    console.error('[Audit] Failed to list audits:', error);
    return [];
  }
}

/**
 * Get a specific conversation audit
 */
export async function getConversationAudit(conversationId: string): Promise<ConversationAudit | null> {
  try {
    const key = `${AUDIT_PREFIX}${conversationId}.json`;
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));

    const body = await response.Body?.transformToString();
    if (body) {
      return JSON.parse(body) as ConversationAudit;
    }
    return null;
  } catch (error) {
    console.error(`[Audit] Failed to get audit for ${conversationId}:`, error);
    return null;
  }
}
