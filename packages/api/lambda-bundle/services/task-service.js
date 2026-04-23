"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTask = createTask;
exports.getTask = getTask;
exports.listTasks = listTasks;
exports.updateTask = updateTask;
exports.deleteTask = deleteTask;
exports.matchTaskToContact = matchTaskToContact;
exports.getRoutableTasks = getRoutableTasks;
exports.assignAgentToTask = assignAgentToTask;
exports.recordAgentResponse = recordAgentResponse;
exports.completeTask = completeTask;
const ulid_1 = require("ulid");
const drizzle_orm_1 = require("drizzle-orm");
const core_1 = require("@macp/core");
const contacts_service_js_1 = require("./contacts-service.js");
// -----------------------------------------------------------------------------
// Task CRUD Operations
// -----------------------------------------------------------------------------
/**
 * Creates a new task, optionally linking it to a contact
 */
async function createTask(userId, input) {
    const db = (0, core_1.getDatabase)();
    const now = new Date();
    const id = (0, ulid_1.ulid)();
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
    await db.insert(core_1.tasks).values({
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
    return getTask(userId, id);
}
/**
 * Gets a task by ID with contact info
 */
async function getTask(userId, taskId) {
    const db = (0, core_1.getDatabase)();
    const result = await db
        .select()
        .from(core_1.tasks)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(core_1.tasks.userId, userId)))
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
        status: task.status,
        priority: task.priority,
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
        metadata: task.metadata,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        contact,
    };
}
/**
 * Lists tasks for a user with optional filtering
 */
async function listTasks(userId, options = {}) {
    const db = (0, core_1.getDatabase)();
    const { status, priority, contactId, hasContact, limit = 50, offset = 0 } = options;
    // Build conditions
    const conditions = [(0, drizzle_orm_1.eq)(core_1.tasks.userId, userId)];
    if (status) {
        if (Array.isArray(status)) {
            conditions.push((0, drizzle_orm_1.sql) `${core_1.tasks.status} IN (${drizzle_orm_1.sql.join(status.map(s => (0, drizzle_orm_1.sql) `${s}`), (0, drizzle_orm_1.sql) `, `)})`);
        }
        else {
            conditions.push((0, drizzle_orm_1.eq)(core_1.tasks.status, status));
        }
    }
    if (priority) {
        conditions.push((0, drizzle_orm_1.eq)(core_1.tasks.priority, priority));
    }
    if (contactId) {
        conditions.push((0, drizzle_orm_1.eq)(core_1.tasks.contactId, contactId));
    }
    if (hasContact === true) {
        conditions.push((0, drizzle_orm_1.sql) `${core_1.tasks.contactId} IS NOT NULL`);
    }
    else if (hasContact === false) {
        conditions.push((0, drizzle_orm_1.isNull)(core_1.tasks.contactId));
    }
    // Get total count
    const countResult = await db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(core_1.tasks)
        .where((0, drizzle_orm_1.and)(...conditions));
    const total = Number(countResult[0]?.count || 0);
    // Get paginated results
    const result = await db
        .select()
        .from(core_1.tasks)
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(core_1.tasks.createdAt))
        .limit(limit)
        .offset(offset);
    // Load contact info for each task
    const tasksWithContacts = await Promise.all(result.map(async (task) => {
        const contact = task.contactId ? await getContactForTask(task.contactId) : null;
        return {
            id: task.id,
            userId: task.userId,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
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
            metadata: task.metadata,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            contact,
        };
    }));
    return { tasks: tasksWithContacts, total };
}
/**
 * Updates a task
 */
async function updateTask(userId, taskId, input) {
    const db = (0, core_1.getDatabase)();
    const now = new Date();
    // Verify ownership
    const existing = await db
        .select()
        .from(core_1.tasks)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(core_1.tasks.userId, userId)))
        .limit(1);
    if (existing.length === 0) {
        return null;
    }
    // Build update object
    const updateData = { updatedAt: now };
    if (input.title !== undefined)
        updateData.title = input.title;
    if (input.description !== undefined)
        updateData.description = input.description;
    if (input.status !== undefined)
        updateData.status = input.status;
    if (input.priority !== undefined)
        updateData.priority = input.priority;
    if (input.contactId !== undefined)
        updateData.contactId = input.contactId;
    if (input.assignedAgentId !== undefined)
        updateData.assignedAgentId = input.assignedAgentId;
    if (input.assignedAgentName !== undefined)
        updateData.assignedAgentName = input.assignedAgentName;
    if (input.resolution !== undefined)
        updateData.resolution = input.resolution;
    if (input.resolvedAt !== undefined)
        updateData.resolvedAt = input.resolvedAt;
    if (input.dueDate !== undefined)
        updateData.dueDate = input.dueDate;
    if (input.reminderAt !== undefined)
        updateData.reminderAt = input.reminderAt;
    if (input.metadata !== undefined)
        updateData.metadata = input.metadata;
    // Auto-set resolvedAt when completing
    if (input.status === 'completed' && !input.resolvedAt) {
        updateData.resolvedAt = now;
    }
    await db
        .update(core_1.tasks)
        .set(updateData)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(core_1.tasks.userId, userId)));
    console.log(`[Tasks] Updated task ${taskId}`);
    return getTask(userId, taskId);
}
/**
 * Deletes a task
 */
async function deleteTask(userId, taskId) {
    const db = (0, core_1.getDatabase)();
    // Verify ownership
    const existing = await db
        .select()
        .from(core_1.tasks)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(core_1.tasks.userId, userId)))
        .limit(1);
    if (existing.length === 0) {
        return false;
    }
    await db.delete(core_1.tasks).where((0, drizzle_orm_1.eq)(core_1.tasks.id, taskId));
    console.log(`[Tasks] Deleted task ${taskId}`);
    return true;
}
/**
 * Attempts to match a person name to an existing contact
 */
async function matchTaskToContact(userId, personName) {
    try {
        // Use the existing fuzzy search from contacts-service
        const matchingContacts = await (0, contacts_service_js_1.searchContactsByName)(userId, personName, 3);
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
        }
        else if (nameLower.startsWith(queryLower) || queryLower.startsWith(nameLower)) {
            confidence = 0.9; // Prefix match
        }
        else if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
            confidence = 0.7; // Contains match
        }
        // Check aliases for better confidence
        for (const alias of bestMatch.aliases) {
            const aliasLower = alias.toLowerCase();
            if (aliasLower === queryLower) {
                confidence = Math.max(confidence, 1.0);
            }
            else if (aliasLower.startsWith(queryLower)) {
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
    }
    catch (error) {
        console.error('[Tasks] Error matching contact:', error);
        return null;
    }
}
/**
 * Gets contact info with agents for a task
 */
async function getContactForTask(contactId) {
    const db = (0, core_1.getDatabase)();
    const contactResult = await db
        .select()
        .from(core_1.contacts)
        .where((0, drizzle_orm_1.eq)(core_1.contacts.id, contactId))
        .limit(1);
    if (contactResult.length === 0) {
        return null;
    }
    const contact = contactResult[0];
    // Get associated agents
    const agentsResult = await db
        .select()
        .from(core_1.contactAgents)
        .where((0, drizzle_orm_1.eq)(core_1.contactAgents.contactId, contactId));
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
async function getRoutableTasks(userId, limit = 10) {
    const result = await listTasks(userId, {
        status: ['pending', 'waiting'],
        hasContact: true,
        limit,
    });
    // Filter to only tasks where contact has agents
    return result.tasks.filter(task => task.contact && task.contact.agents.length > 0);
}
/**
 * Assigns an agent to work on a task
 */
async function assignAgentToTask(userId, taskId, agentId, agentName) {
    return updateTask(userId, taskId, {
        assignedAgentId: agentId,
        assignedAgentName: agentName,
        status: 'in_progress',
    });
}
/**
 * Records an agent's response to a task
 */
async function recordAgentResponse(userId, taskId, agentId, agentName, response) {
    const task = await getTask(userId, taskId);
    if (!task)
        return null;
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
async function completeTask(userId, taskId, resolution) {
    return updateTask(userId, taskId, {
        status: 'completed',
        resolution,
        resolvedAt: new Date(),
    });
}
//# sourceMappingURL=task-service.js.map