import { TaskMetadata } from '@macp/core';
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
/**
 * Creates a new task, optionally linking it to a contact
 */
export declare function createTask(userId: string, input: CreateTaskInput): Promise<TaskWithContact>;
/**
 * Gets a task by ID with contact info
 */
export declare function getTask(userId: string, taskId: string): Promise<TaskWithContact | null>;
/**
 * Lists tasks for a user with optional filtering
 */
export declare function listTasks(userId: string, options?: ListTasksOptions): Promise<{
    tasks: TaskWithContact[];
    total: number;
}>;
/**
 * Updates a task
 */
export declare function updateTask(userId: string, taskId: string, input: UpdateTaskInput): Promise<TaskWithContact | null>;
/**
 * Deletes a task
 */
export declare function deleteTask(userId: string, taskId: string): Promise<boolean>;
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
export declare function matchTaskToContact(userId: string, personName: string): Promise<ContactMatch | null>;
/**
 * Gets tasks that are ready for autonomous routing (have contacts with agents)
 */
export declare function getRoutableTasks(userId: string, limit?: number): Promise<TaskWithContact[]>;
/**
 * Assigns an agent to work on a task
 */
export declare function assignAgentToTask(userId: string, taskId: string, agentId: string, agentName: string): Promise<TaskWithContact | null>;
/**
 * Records an agent's response to a task
 */
export declare function recordAgentResponse(userId: string, taskId: string, agentId: string, agentName: string, response: string): Promise<TaskWithContact | null>;
/**
 * Completes a task with a resolution
 */
export declare function completeTask(userId: string, taskId: string, resolution: string): Promise<TaskWithContact | null>;
export {};
//# sourceMappingURL=task-service.d.ts.map