"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTaskRoutes = registerTaskRoutes;
const zod_1 = require("zod");
const task_service_js_1 = require("../services/task-service.js");
// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------
const createTaskSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(500),
    description: zod_1.z.string().max(2000).optional(),
    priority: zod_1.z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    contactId: zod_1.z.string().optional(),
    targetPersonName: zod_1.z.string().max(100).optional(),
    source: zod_1.z.enum(['chat_detected', 'manual', 'recurring']).optional(),
    sourceConversationId: zod_1.z.string().optional(),
    sourceMessageContent: zod_1.z.string().max(2000).optional(),
    dueDate: zod_1.z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
    reminderAt: zod_1.z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
});
const updateTaskSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(500).optional(),
    description: zod_1.z.string().max(2000).nullable().optional(),
    status: zod_1.z.enum(['pending', 'in_progress', 'waiting', 'completed', 'cancelled', 'failed']).optional(),
    priority: zod_1.z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    contactId: zod_1.z.string().nullable().optional(),
    assignedAgentId: zod_1.z.string().nullable().optional(),
    assignedAgentName: zod_1.z.string().nullable().optional(),
    resolution: zod_1.z.string().max(2000).nullable().optional(),
    dueDate: zod_1.z.union([zod_1.z.string().datetime().transform(val => new Date(val)), zod_1.z.null()]).optional(),
    reminderAt: zod_1.z.union([zod_1.z.string().datetime().transform(val => new Date(val)), zod_1.z.null()]).optional(),
});
const listTasksQuerySchema = zod_1.z.object({
    status: zod_1.z.string().optional().transform(val => val ? val.split(',') : undefined),
    priority: zod_1.z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    contactId: zod_1.z.string().optional(),
    hasContact: zod_1.z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined),
    limit: zod_1.z.string().optional().transform(val => val ? parseInt(val, 10) : 50),
    offset: zod_1.z.string().optional().transform(val => val ? parseInt(val, 10) : 0),
});
const assignAgentSchema = zod_1.z.object({
    agentId: zod_1.z.string().min(1),
    agentName: zod_1.z.string().min(1),
});
const completeTaskSchema = zod_1.z.object({
    resolution: zod_1.z.string().min(1).max(2000),
});
const matchContactSchema = zod_1.z.object({
    personName: zod_1.z.string().min(1).max(100),
});
// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
function registerTaskRoutes(app) {
    // -------------------------------------------------------------------------
    // Task CRUD
    // -------------------------------------------------------------------------
    // Create a new task
    app.post('/api/tasks', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        try {
            const body = createTaskSchema.parse(req.body);
            const task = await (0, task_service_js_1.createTask)(userId, body);
            reply.code(201);
            return task;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                reply.code(400);
                return { error: 'Validation error', details: error.errors };
            }
            console.error('[Tasks] Error creating task:', error);
            reply.code(500);
            return { error: 'Failed to create task', details: error instanceof Error ? error.message : String(error) };
        }
    });
    // List tasks with optional filtering
    app.get('/api/tasks', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        try {
            const query = listTasksQuerySchema.parse(req.query);
            const result = await (0, task_service_js_1.listTasks)(userId, {
                status: query.status,
                priority: query.priority,
                contactId: query.contactId,
                hasContact: query.hasContact,
                limit: query.limit,
                offset: query.offset,
            });
            return {
                tasks: result.tasks,
                total: result.total,
                limit: query.limit,
                offset: query.offset,
                hasMore: query.offset + result.tasks.length < result.total,
            };
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                reply.code(400);
                return { error: 'Validation error', details: error.errors };
            }
            console.error('[Tasks] Error listing tasks:', error);
            reply.code(500);
            return { error: 'Failed to list tasks', details: error instanceof Error ? error.message : String(error) };
        }
    });
    // Get tasks that can be routed to contact agents
    app.get('/api/tasks/routable', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        try {
            const limit = parseInt(req.query.limit || '10', 10);
            const tasks = await (0, task_service_js_1.getRoutableTasks)(userId, limit);
            return { tasks };
        }
        catch (error) {
            console.error('[Tasks] Error getting routable tasks:', error);
            reply.code(500);
            return { error: 'Failed to get routable tasks', details: error instanceof Error ? error.message : String(error) };
        }
    });
    // Get a specific task
    app.get('/api/tasks/:taskId', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { taskId } = req.params;
        try {
            const task = await (0, task_service_js_1.getTask)(userId, taskId);
            if (!task) {
                reply.code(404);
                return { error: 'Task not found' };
            }
            return task;
        }
        catch (error) {
            console.error('[Tasks] Error getting task:', error);
            reply.code(500);
            return { error: 'Failed to get task', details: error instanceof Error ? error.message : String(error) };
        }
    });
    // Update a task
    app.patch('/api/tasks/:taskId', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { taskId } = req.params;
        try {
            const body = updateTaskSchema.parse(req.body);
            const task = await (0, task_service_js_1.updateTask)(userId, taskId, body);
            if (!task) {
                reply.code(404);
                return { error: 'Task not found' };
            }
            return task;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                reply.code(400);
                return { error: 'Validation error', details: error.errors };
            }
            console.error('[Tasks] Error updating task:', error);
            reply.code(500);
            return { error: 'Failed to update task', details: error instanceof Error ? error.message : String(error) };
        }
    });
    // Delete a task
    app.delete('/api/tasks/:taskId', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { taskId } = req.params;
        try {
            const deleted = await (0, task_service_js_1.deleteTask)(userId, taskId);
            if (!deleted) {
                reply.code(404);
                return { error: 'Task not found' };
            }
            reply.code(204);
            return;
        }
        catch (error) {
            console.error('[Tasks] Error deleting task:', error);
            reply.code(500);
            return { error: 'Failed to delete task', details: error instanceof Error ? error.message : String(error) };
        }
    });
    // -------------------------------------------------------------------------
    // Task Actions
    // -------------------------------------------------------------------------
    // Assign an agent to a task
    app.post('/api/tasks/:taskId/assign', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { taskId } = req.params;
        try {
            const body = assignAgentSchema.parse(req.body);
            const task = await (0, task_service_js_1.assignAgentToTask)(userId, taskId, body.agentId, body.agentName);
            if (!task) {
                reply.code(404);
                return { error: 'Task not found' };
            }
            return task;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                reply.code(400);
                return { error: 'Validation error', details: error.errors };
            }
            console.error('[Tasks] Error assigning agent:', error);
            reply.code(500);
            return { error: 'Failed to assign agent', details: error instanceof Error ? error.message : String(error) };
        }
    });
    // Complete a task
    app.post('/api/tasks/:taskId/complete', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { taskId } = req.params;
        try {
            const body = completeTaskSchema.parse(req.body);
            const task = await (0, task_service_js_1.completeTask)(userId, taskId, body.resolution);
            if (!task) {
                reply.code(404);
                return { error: 'Task not found' };
            }
            return task;
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                reply.code(400);
                return { error: 'Validation error', details: error.errors };
            }
            console.error('[Tasks] Error completing task:', error);
            reply.code(500);
            return { error: 'Failed to complete task', details: error instanceof Error ? error.message : String(error) };
        }
    });
    // -------------------------------------------------------------------------
    // Contact Matching
    // -------------------------------------------------------------------------
    // Match a person name to a contact (useful for testing/debugging)
    app.post('/api/tasks/match-contact', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        try {
            const body = matchContactSchema.parse(req.body);
            const match = await (0, task_service_js_1.matchTaskToContact)(userId, body.personName);
            if (!match) {
                return { matched: false, personName: body.personName };
            }
            return {
                matched: true,
                personName: body.personName,
                contact: {
                    id: match.contactId,
                    name: match.contactName,
                    confidence: match.confidence,
                    agents: match.agents,
                },
            };
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                reply.code(400);
                return { error: 'Validation error', details: error.errors };
            }
            console.error('[Tasks] Error matching contact:', error);
            reply.code(500);
            return { error: 'Failed to match contact', details: error instanceof Error ? error.message : String(error) };
        }
    });
    // -------------------------------------------------------------------------
    // Test Endpoint - Verifies full task flow
    // -------------------------------------------------------------------------
    // Test the full task creation -> contact matching -> completion flow
    app.post('/api/tasks/test-flow', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { targetPersonName, taskDescription } = req.body;
        if (!targetPersonName) {
            reply.code(400);
            return { error: 'targetPersonName is required' };
        }
        const results = [];
        try {
            // Step 1: Create task with person name
            const task = await (0, task_service_js_1.createTask)(userId, {
                title: taskDescription || `Find out when ${targetPersonName}'s birthday is`,
                targetPersonName,
                source: 'manual',
            });
            results.push({
                step: '1. Create task with targetPersonName',
                success: true,
                data: {
                    taskId: task.id,
                    contactId: task.contactId,
                    contactName: task.contact?.name,
                    matched: !!task.contactId,
                },
            });
            // Step 2: Verify contact was matched
            if (task.contactId) {
                results.push({
                    step: '2. Contact matching',
                    success: true,
                    data: {
                        contactId: task.contactId,
                        contactName: task.contact?.name,
                        relationship: task.contact?.relationship,
                        agentCount: task.contact?.agents?.length || 0,
                    },
                });
            }
            else {
                results.push({
                    step: '2. Contact matching',
                    success: false,
                    error: `No contact found matching "${targetPersonName}"`,
                });
            }
            // Step 3: Complete the task
            const completedTask = await (0, task_service_js_1.completeTask)(userId, task.id, `${targetPersonName}'s birthday is March 15th`);
            results.push({
                step: '3. Complete task',
                success: completedTask?.status === 'completed',
                data: {
                    status: completedTask?.status,
                    resolution: completedTask?.resolution,
                    resolvedAt: completedTask?.resolvedAt,
                },
            });
            // Step 4: Verify task is completed
            const verifiedTask = await (0, task_service_js_1.getTask)(userId, task.id);
            results.push({
                step: '4. Verify task completed',
                success: verifiedTask?.status === 'completed',
                data: {
                    status: verifiedTask?.status,
                    resolution: verifiedTask?.resolution,
                },
            });
            // Overall result
            const allSuccessful = results.every(r => r.success);
            return {
                success: allSuccessful,
                message: allSuccessful
                    ? 'Full task flow verified successfully'
                    : 'Some steps failed - check results',
                results,
            };
        }
        catch (error) {
            console.error('[Tasks] Test flow error:', error);
            reply.code(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                results,
            };
        }
    });
}
//# sourceMappingURL=tasks.js.map