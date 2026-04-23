import { ulid } from 'ulid';
import { eq, and, desc, isNull, or, sql } from 'drizzle-orm';
import { getDatabase, tasks, contacts, contactAgents, TaskMetadata } from '@macp/core';
import { searchContactsByName } from './contacts-service.js';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type TaskStatus = 'pending' | 'in_progress' | 'waiting' | 'completed' | 'cancelled' | 'failed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskSource = 'chat_detected' | 'manual' | 'recurring';

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  contactId?: string;
  targetPersonName?: string;
  source?: TaskSource;
  sourceConversationId?: string;
  sourceMessageContent?: string;
  dueDate?: Date;
  reminderAt?: Date;
  metadata?: TaskMetadata;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  contactId?: string | null;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  resolution?: string | null;
  resolvedAt?: Date | null;
  dueDate?: Date | null;
  reminderAt?: Date | null;
  metadata?: TaskMetadata;
}

export interface TaskWithContact {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  contactId: string | null;
  targetPersonName: string | null;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  source: string;
  sourceConversationId: string | null;
  sourceMessageContent: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
  dueDate: Date | null;
  reminderAt: Date | null;
  metadata: TaskMetadata | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined contact data
  contact?: {
    id: string;
    name: string;
    relationship: string | null;
    agents: Array<{
      agentId: string;
      agentName: string;
      agentEmoji: string | null;
      role: string | null;
    }>;
  } | null;
}

export interface ListTasksOptions {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority;
  contactId?: string;
  hasContact?: boolean;
  limit?: number;
  offset?: number;
}

// -----------------------------------------------------------------------------
// Task CRUD Operations
// -----------------------------------------------------------------------------

/**
 * Creates a new task, optionally linking it to a contact
 */
export async function createTask(
  userId: string,
  input: CreateTaskInput
): Promise<TaskWithContact> {
  const db = getDatabase();
  const now = new Date();
  const id = ulid();

  // If targetPersonName is provided but no contactId, try to match a contact
  let contactId = input.contactId;
  let matchedContact = null;

  if (input.targetPersonName && !contactId) {
    const matchResult = await matchTaskToContact(userId, input.targetPersonName);
    if (matchResult) {
      contactId = matchResult.contactId;
      matchedContact = matchResult;
      console.log(`[Tasks] Auto-matched "${input.targetPersonName}" to contact: ${matchResult.contactName}`);
    }
  }

  await db.insert(tasks).values({
    id,
    userId,
    title: input.title,
    description: input.description,
    status: 'pending',
    priority: input.priority || 'medium',
    contactId,
    targetPersonName: input.targetPersonName,
    source: input.source || 'manual',
    sourceConversationId: input.sourceConversationId,
    sourceMessageContent: input.sourceMessageContent,
    dueDate: input.dueDate,
    reminderAt: input.reminderAt,
    metadata: input.metadata ? {
      ...input.metadata,
      matchConfidence: matchedContact?.confidence,
    } : matchedContact ? { matchConfidence: matchedContact.confidence } : undefined,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`[Tasks] Created task "${input.title}" (${id}) for user ${userId}${contactId ? `, linked to contact ${contactId}` : ''}`);

  return getTask(userId, id) as Promise<TaskWithContact>;
}

/**
 * Gets a task by ID with contact info
 */
export async function getTask(
  userId: string,
  taskId: string
): Promise<TaskWithContact | null> {
  const db = getDatabase();

  const result = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const task = result[0];
  const contact = task.contactId ? await getContactForTask(task.contactId) : null;

  return {
    id: task.id,
    userId: task.userId,
    title: task.title,
    description: task.description,
    status: task.status as TaskStatus,
    priority: task.priority as TaskPriority,
    contactId: task.contactId,
    targetPersonName: task.targetPersonName,
    assignedAgentId: task.assignedAgentId,
    assignedAgentName: task.assignedAgentName,
    source: task.source,
    sourceConversationId: task.sourceConversationId,
    sourceMessageContent: task.sourceMessageContent,
    resolution: task.resolution,
    resolvedAt: task.resolvedAt,
    dueDate: task.dueDate,
    reminderAt: task.reminderAt,
    metadata: task.metadata as TaskMetadata | null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    contact,
  };
}

/**
 * Lists tasks for a user with optional filtering
 */
export async function listTasks(
  userId: string,
  options: ListTasksOptions = {}
): Promise<{ tasks: TaskWithContact[]; total: number }> {
  const db = getDatabase();
  const { status, priority, contactId, hasContact, limit = 50, offset = 0 } = options;

  // Build conditions
  const conditions = [eq(tasks.userId, userId)];

  if (status) {
    if (Array.isArray(status)) {
      conditions.push(sql`${tasks.status} IN (${sql.join(status.map(s => sql`${s}`), sql`, `)})`);
    } else {
      conditions.push(eq(tasks.status, status));
    }
  }

  if (priority) {
    conditions.push(eq(tasks.priority, priority));
  }

  if (contactId) {
    conditions.push(eq(tasks.contactId, contactId));
  }

  if (hasContact === true) {
    conditions.push(sql`${tasks.contactId} IS NOT NULL`);
  } else if (hasContact === false) {
    conditions.push(isNull(tasks.contactId));
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(and(...conditions));
  const total = Number(countResult[0]?.count || 0);

  // Get paginated results
  const result = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt))
    .limit(limit)
    .offset(offset);

  // Load contact info for each task
  const tasksWithContacts: TaskWithContact[] = await Promise.all(
    result.map(async (task) => {
      const contact = task.contactId ? await getContactForTask(task.contactId) : null;
      return {
        id: task.id,
        userId: task.userId,
        title: task.title,
        description: task.description,
        status: task.status as TaskStatus,
        priority: task.priority as TaskPriority,
        contactId: task.contactId,
        targetPersonName: task.targetPersonName,
        assignedAgentId: task.assignedAgentId,
        assignedAgentName: task.assignedAgentName,
        source: task.source,
        sourceConversationId: task.sourceConversationId,
        sourceMessageContent: task.sourceMessageContent,
        resolution: task.resolution,
        resolvedAt: task.resolvedAt,
        dueDate: task.dueDate,
        reminderAt: task.reminderAt,
        metadata: task.metadata as TaskMetadata | null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        contact,
      };
    })
  );

  return { tasks: tasksWithContacts, total };
}

/**
 * Updates a task
 */
export async function updateTask(
  userId: string,
  taskId: string,
  input: UpdateTaskInput
): Promise<TaskWithContact | null> {
  const db = getDatabase();
  const now = new Date();

  // Verify ownership
  const existing = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return null;
  }

  // Build update object
  const updateData: Record<string, unknown> = { updatedAt: now };

  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.contactId !== undefined) updateData.contactId = input.contactId;
  if (input.assignedAgentId !== undefined) updateData.assignedAgentId = input.assignedAgentId;
  if (input.assignedAgentName !== undefined) updateData.assignedAgentName = input.assignedAgentName;
  if (input.resolution !== undefined) updateData.resolution = input.resolution;
  if (input.resolvedAt !== undefined) updateData.resolvedAt = input.resolvedAt;
  if (input.dueDate !== undefined) updateData.dueDate = input.dueDate;
  if (input.reminderAt !== undefined) updateData.reminderAt = input.reminderAt;
  if (input.metadata !== undefined) updateData.metadata = input.metadata;

  // Auto-set resolvedAt when completing
  if (input.status === 'completed' && !input.resolvedAt) {
    updateData.resolvedAt = now;
  }

  await db
    .update(tasks)
    .set(updateData)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

  console.log(`[Tasks] Updated task ${taskId}`);

  return getTask(userId, taskId);
}

/**
 * Deletes a task
 */
export async function deleteTask(
  userId: string,
  taskId: string
): Promise<boolean> {
  const db = getDatabase();

  // Verify ownership
  const existing = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return false;
  }

  await db.delete(tasks).where(eq(tasks.id, taskId));

  console.log(`[Tasks] Deleted task ${taskId}`);

  return true;
}

// -----------------------------------------------------------------------------
// Contact Matching
// -----------------------------------------------------------------------------

interface ContactMatch {
  contactId: string;
  contactName: string;
  confidence: number;
  agents: Array<{
    agentId: string;
    agentName: string;
    agentEmoji: string | null;
    role: string | null;
  }>;
}

/**
 * Attempts to match a person name to an existing contact
 */
export async function matchTaskToContact(
  userId: string,
  personName: string
): Promise<ContactMatch | null> {
  try {
    // Use the existing fuzzy search from contacts-service
    const matchingContacts = await searchContactsByName(userId, personName, 3);

    if (matchingContacts.length === 0) {
      return null;
    }

    // Take the best match
    const bestMatch = matchingContacts[0];

    // Calculate confidence based on match quality
    const nameLower = bestMatch.name.toLowerCase();
    const queryLower = personName.toLowerCase();
    let confidence = 0.5;

    if (nameLower === queryLower) {
      confidence = 1.0; // Exact match
    } else if (nameLower.startsWith(queryLower) || queryLower.startsWith(nameLower)) {
      confidence = 0.9; // Prefix match
    } else if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
      confidence = 0.7; // Contains match
    }

    // Check aliases for better confidence
    for (const alias of bestMatch.aliases) {
      const aliasLower = alias.toLowerCase();
      if (aliasLower === queryLower) {
        confidence = Math.max(confidence, 1.0);
      } else if (aliasLower.startsWith(queryLower)) {
        confidence = Math.max(confidence, 0.9);
      }
    }

    return {
      contactId: bestMatch.id,
      contactName: bestMatch.name,
      confidence,
      agents: bestMatch.agents.map(a => ({
        agentId: a.publicAgentId,
        agentName: a.agentName,
        agentEmoji: a.agentEmoji,
        role: a.role,
      })),
    };
  } catch (error) {
    console.error('[Tasks] Error matching contact:', error);
    return null;
  }
}

/**
 * Gets contact info with agents for a task
 */
async function getContactForTask(contactId: string): Promise<TaskWithContact['contact']> {
  const db = getDatabase();

  const contactResult = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (contactResult.length === 0) {
    return null;
  }

  const contact = contactResult[0];

  // Get associated agents
  const agentsResult = await db
    .select()
    .from(contactAgents)
    .where(eq(contactAgents.contactId, contactId));

  return {
    id: contact.id,
    name: contact.name,
    relationship: contact.relationship,
    agents: agentsResult.map(a => ({
      agentId: a.publicAgentId,
      agentName: a.agentName,
      agentEmoji: a.agentEmoji,
      role: a.role,
    })),
  };
}

// -----------------------------------------------------------------------------
// Task Routing (for autonomous execution)
// -----------------------------------------------------------------------------

/**
 * Gets tasks that are ready for autonomous routing (have contacts with agents)
 */
export async function getRoutableTasks(
  userId: string,
  limit: number = 10
): Promise<TaskWithContact[]> {
  const result = await listTasks(userId, {
    status: ['pending', 'waiting'],
    hasContact: true,
    limit,
  });

  // Filter to only tasks where contact has agents
  return result.tasks.filter(
    task => task.contact && task.contact.agents.length > 0
  );
}

/**
 * Assigns an agent to work on a task
 */
export async function assignAgentToTask(
  userId: string,
  taskId: string,
  agentId: string,
  agentName: string
): Promise<TaskWithContact | null> {
  return updateTask(userId, taskId, {
    assignedAgentId: agentId,
    assignedAgentName: agentName,
    status: 'in_progress',
  });
}

/**
 * Records an agent's response to a task
 */
export async function recordAgentResponse(
  userId: string,
  taskId: string,
  agentId: string,
  agentName: string,
  response: string
): Promise<TaskWithContact | null> {
  const task = await getTask(userId, taskId);
  if (!task) return null;

  const existingMetadata = task.metadata || {};
  const agentResponses = existingMetadata.agentResponses || [];

  agentResponses.push({
    agentId,
    agentName,
    response,
    timestamp: new Date().toISOString(),
  });

  return updateTask(userId, taskId, {
    metadata: {
      ...existingMetadata,
      agentResponses,
    },
  });
}

/**
 * Completes a task with a resolution
 */
export async function completeTask(
  userId: string,
  taskId: string,
  resolution: string
): Promise<TaskWithContact | null> {
  return updateTask(userId, taskId, {
    status: 'completed',
    resolution,
    resolvedAt: new Date(),
  });
}
