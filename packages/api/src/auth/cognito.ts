import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import * as jwt from 'jsonwebtoken';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface CognitoConfig {
  userPoolId: string;
  clientId: string;
  region?: string;
}

export interface AuthenticatedUser {
  userId: string;      // Cognito 'sub' claim
  email?: string;
  name?: string;
  groups?: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

// -----------------------------------------------------------------------------
// Cognito Verifier
// -----------------------------------------------------------------------------

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

export function configureCognito(config: CognitoConfig): void {
  verifier = CognitoJwtVerifier.create({
    userPoolId: config.userPoolId,
    clientId: config.clientId,
    tokenUse: 'access',
  });
  console.log(`[Auth] Cognito configured for pool: ${config.userPoolId}`);
}

export async function verifyToken(token: string): Promise<AuthenticatedUser | null> {
  if (!verifier) {
    console.warn('[Auth] Cognito not configured, skipping verification');
    return null;
  }

  try {
    const payload = await verifier.verify(token);
    return {
      userId: payload.sub,
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
      groups: payload['cognito:groups'] as string[] | undefined,
    };
  } catch (error) {
    console.error('[Auth] Cognito token verification failed:', error);
    return null;
  }
}

export function verifyServerToken(token: string): AuthenticatedUser | null {
  const serverSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production';

  try {
    const payload = jwt.verify(token, serverSecret) as {
      sub: string;
      email?: string;
      name?: string;
      token_use?: string;
    };

    // Only accept access tokens
    if (payload.token_use !== 'access') {
      return null;
    }

    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  } catch (error) {
    // Token is not a valid server-issued JWT
    return null;
  }
}

// -----------------------------------------------------------------------------
// Fastify Plugin
// -----------------------------------------------------------------------------

async function cognitoAuthPlugin(app: FastifyInstance): Promise<void> {
  // Add authentication decorator
  app.decorateRequest('user', null);

  // Add auth hook that runs before route handlers
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health checks, public routes, and specific public auth endpoints
    // WebSocket skipped here because WS upgrades don't have Authorization headers
    // - WS auth is validated inside the WebSocket handler via query param token
    // Note: /auth/ws-ticket requires authentication (to issue a WebSocket ticket)
    const publicAuthEndpoints = ['/auth/apple', '/auth/refresh'];
    const isPublicAuth = publicAuthEndpoints.some(ep => request.url.startsWith(ep));

    if (
      request.url.startsWith('/health') ||
      isPublicAuth ||
      request.url.startsWith('/ws') ||
      request.url === '/'
    ) {
      return;
    }

    // Development mode: allow x-user-id header for testing
    if (process.env.NODE_ENV !== 'production') {
      const devUserId = request.headers['x-user-id'] as string;
      if (devUserId) {
        request.user = { userId: devUserId };
        return;
      }
    }

    // Get token from Authorization header
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      // No auth required in development mode
      if (process.env.NODE_ENV !== 'production') {
        return;
      }
      reply.code(401).send({ error: 'Missing authorization header' });
      return;
    }

    const token = authHeader.slice(7);

    // First try Cognito verification
    let user = await verifyToken(token);

    // If Cognito verification fails, try server-issued JWT
    if (!user) {
      user = verifyServerToken(token);
    }

    if (!user) {
      reply.code(401).send({ error: 'Invalid or expired token' });
      return;
    }

    request.user = user;
  });
}

export const cognitoAuth = fp(cognitoAuthPlugin, {
  name: 'cognito-auth',
});

// -----------------------------------------------------------------------------
// Helper: Require Auth
// -----------------------------------------------------------------------------

/**
 * Decorator for routes that require authentication
 */
export function requireAuth(request: FastifyRequest, reply: FastifyReply): void {
  if (!request.user) {
    reply.code(401).send({ error: 'Authentication required' });
  }
}

/**
 * Get the current user ID from the request, throwing if not authenticated
 */
export function getCurrentUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw new Error('Not authenticated');
  }
  return request.user.userId;
}
