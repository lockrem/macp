import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import * as jwt from 'jsonwebtoken';
import { ensureUserExists } from '../services/user-service.js';

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
      exp?: number;
    };

    // Only accept access tokens
    if (payload.token_use !== 'access') {
      console.log('[Auth] Token rejected: not an access token (token_use:', payload.token_use, ')');
      return null;
    }

    console.log('[Auth] Server token verified successfully for user:', payload.sub);
    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  } catch (error: any) {
    // Log specific JWT errors for debugging
    if (error.name === 'TokenExpiredError') {
      console.log('[Auth] Server token EXPIRED at:', error.expiredAt, 'current time:', new Date().toISOString());
    } else if (error.name === 'JsonWebTokenError') {
      console.log('[Auth] Invalid server token:', error.message);
    } else {
      console.log('[Auth] Server token verification error:', error.message);
    }
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
    const reqAuthHeader = request.headers.authorization;
    console.log(`[Auth] preHandler for ${request.url}, authHeader: ${reqAuthHeader ? 'present' : 'MISSING'}, NODE_ENV: ${process.env.NODE_ENV}`);

    // Skip auth for health checks, public routes, and specific public auth endpoints
    // WebSocket skipped here because WS upgrades don't have Authorization headers
    // - WS auth is validated inside the WebSocket handler via query param token
    // Note: /auth/ws-ticket requires authentication (to issue a WebSocket ticket)
    const publicAuthEndpoints = ['/auth/apple', '/auth/refresh'];
    const isPublicAuth = publicAuthEndpoints.some(ep => request.url.startsWith(ep));

    // AI utility endpoints are public - they self-authenticate via API key in request body
    const isAIEndpoint = request.url.startsWith('/api/ai/');

    // Grounding presets are public (just returns configuration, no user data)
    const isPublicGrounding = request.url === '/api/grounding/presets';

    if (
      request.url.startsWith('/health') ||
      request.url.startsWith('/public/') ||
      isPublicAuth ||
      isAIEndpoint ||
      isPublicGrounding ||
      request.url.startsWith('/ws') ||
      request.url === '/'
    ) {
      return;
    }

    // Audit routes: allow with x-audit-key header (for internal dashboard)
    if (request.url.startsWith('/audit/')) {
      const auditKey = request.headers['x-audit-key'] as string;
      const expectedKey = process.env.AUDIT_API_KEY || 'macp-audit-2026';
      if (auditKey === expectedKey) {
        return;
      }
    }

    // Admin routes: allow with x-admin-secret header (for migrations, etc.)
    if (request.url.startsWith('/api/admin/')) {
      const adminSecret = request.headers['x-admin-secret'] as string;
      const expectedSecret = process.env.ADMIN_MIGRATION_SECRET || 'migrate-contacts-2026';
      if (adminSecret === expectedSecret) {
        return;
      }
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

    // Debug logging for /api/contacts
    if (request.url.includes('/contacts')) {
      console.log('[Auth] Processing /contacts request');
      console.log('[Auth] Authorization header present:', !!authHeader);
      console.log('[Auth] NODE_ENV:', process.env.NODE_ENV);
    }

    if (!authHeader?.startsWith('Bearer ')) {
      // No auth required in development mode
      if (process.env.NODE_ENV !== 'production') {
        return;
      }
      console.log(`[Auth] Missing Bearer token for ${request.url}, authHeader: ${authHeader ? 'present but invalid' : 'missing'}`);
      reply.code(401).send({ error: 'Missing authorization header' });
      return;
    }

    const token = authHeader.slice(7);

    // Debug logging for /api/contacts
    if (request.url.includes('/contacts')) {
      console.log('[Auth] Token present, length:', token.length);
    }

    // First try Cognito verification
    let user = await verifyToken(token);

    // Debug logging for /api/contacts
    if (request.url.includes('/contacts')) {
      console.log('[Auth] Cognito verification result:', user ? 'success' : 'failed');
    }

    // If Cognito verification fails, try server-issued JWT
    if (!user) {
      user = verifyServerToken(token);
      if (request.url.includes('/contacts')) {
        console.log('[Auth] Server JWT verification result:', user ? 'success' : 'failed');
      }
    }

    if (!user) {
      // Log token details for debugging (first/last few chars only for security)
      const tokenPreview = token.length > 20 ? `${token.substring(0, 10)}...${token.substring(token.length - 10)}` : 'too short';
      console.log(`[Auth] Both verifications failed for ${request.url}, token length: ${token.length}, preview: ${tokenPreview}`);
      reply.code(401).send({ error: 'Invalid or expired token' });
      return;
    }

    request.user = user;
    if (request.url.includes('/contacts')) {
      console.log('[Auth] User set for contacts request:', user.userId);
    }

    // Ensure user exists in database for FK integrity (async, non-blocking)
    ensureUserExists({
      userId: user.userId,
      email: user.email,
      displayName: user.name,
    }).catch(err => console.error('[Auth] User upsert failed:', err));
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

/**
 * Get the current user ID, or null if not authenticated.
 * Use this when you need to handle unauthenticated requests gracefully.
 */
export function getUserIdOrNull(request: FastifyRequest): string | null {
  return request.user?.userId || null;
}

/**
 * Require authentication and return userId, or send 401 response.
 * Returns userId if authenticated, null if 401 was sent.
 */
export function requireUserId(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.user?.userId;
  if (!userId) {
    reply.code(401).send({ error: 'Authentication required' });
    return null;
  }
  return userId;
}
