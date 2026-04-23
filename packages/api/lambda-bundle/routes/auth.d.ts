import type { FastifyInstance } from 'fastify';
import { createSystemAgentsForUser } from '../services/agent-templates.js';
type UserAgent = ReturnType<typeof createSystemAgentsForUser>[0];
/**
 * Gets agents for a user
 */
export declare function getUserAgents(userId: string): UserAgent[] | undefined;
/**
 * Sets agents for a user
 */
export declare function setUserAgents(userId: string, agents: UserAgent[]): void;
export declare function validateWSTicket(ticketId: string): {
    userId: string;
    email?: string;
    name?: string;
} | null;
export declare function registerAuthRoutes(app: FastifyInstance): void;
export {};
//# sourceMappingURL=auth.d.ts.map