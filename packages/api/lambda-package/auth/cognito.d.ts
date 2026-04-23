import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
export interface CognitoConfig {
    userPoolId: string;
    clientId: string;
    region?: string;
}
export interface AuthenticatedUser {
    userId: string;
    email?: string;
    name?: string;
    groups?: string[];
}
declare module 'fastify' {
    interface FastifyRequest {
        user?: AuthenticatedUser;
    }
}
export declare function configureCognito(config: CognitoConfig): void;
export declare function verifyToken(token: string): Promise<AuthenticatedUser | null>;
export declare function verifyServerToken(token: string): AuthenticatedUser | null;
declare function cognitoAuthPlugin(app: FastifyInstance): Promise<void>;
export declare const cognitoAuth: typeof cognitoAuthPlugin;
/**
 * Decorator for routes that require authentication
 */
export declare function requireAuth(request: FastifyRequest, reply: FastifyReply): void;
/**
 * Get the current user ID from the request, throwing if not authenticated
 */
export declare function getCurrentUserId(request: FastifyRequest): string;
export {};
//# sourceMappingURL=cognito.d.ts.map