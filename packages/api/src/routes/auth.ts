import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as jose from 'jose';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { createSystemAgentsForUser, getSystemAgentTemplates } from '../services/agent-templates.js';

// -----------------------------------------------------------------------------
// WebSocket Ticket Store (in production, use Redis)
// -----------------------------------------------------------------------------

interface WSTicket {
  ticketId: string;
  userId: string;
  email?: string;
  name?: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

const wsTickets = new Map<string, WSTicket>();

// Clean up expired tickets periodically
setInterval(() => {
  const now = Date.now();
  for (const [ticketId, ticket] of wsTickets.entries()) {
    if (ticket.expiresAt < now || ticket.used) {
      wsTickets.delete(ticketId);
    }
  }
}, 60000); // Clean every minute

// -----------------------------------------------------------------------------
// User Agents Store (in production, use database)
// -----------------------------------------------------------------------------

type UserAgent = ReturnType<typeof createSystemAgentsForUser>[0];
const userAgentsStore = new Map<string, UserAgent[]>();

/**
 * Gets agents for a user
 */
export function getUserAgents(userId: string): UserAgent[] | undefined {
  return userAgentsStore.get(userId);
}

/**
 * Sets agents for a user
 */
export function setUserAgents(userId: string, agents: UserAgent[]): void {
  userAgentsStore.set(userId, agents);
}

export function validateWSTicket(ticketId: string): { userId: string; email?: string; name?: string } | null {
  const ticket = wsTickets.get(ticketId);

  if (!ticket) {
    return null;
  }

  // Check if expired
  if (Date.now() > ticket.expiresAt) {
    wsTickets.delete(ticketId);
    return null;
  }

  // Check if already used (single-use)
  if (ticket.used) {
    return null;
  }

  // Mark as used
  ticket.used = true;

  return {
    userId: ticket.userId,
    email: ticket.email,
    name: ticket.name,
  };
}

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const appleAuthSchema = z.object({
  identityToken: z.string(),
  authorizationCode: z.string().optional(),
  user: z.object({
    email: z.string().email().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  }).optional(),
});

// -----------------------------------------------------------------------------
// Apple Token Verification using jose library
// -----------------------------------------------------------------------------

interface AppleTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string;
  email?: string;
  email_verified?: string;
}

// Cache for Apple's JWKS
let appleJWKS: jose.JWTVerifyGetKey | null = null;

async function getAppleJWKS(): Promise<jose.JWTVerifyGetKey> {
  if (!appleJWKS) {
    appleJWKS = jose.createRemoteJWKSet(
      new URL('https://appleid.apple.com/auth/keys')
    );
  }
  return appleJWKS;
}

async function verifyAppleToken(identityToken: string): Promise<AppleTokenPayload | null> {
  try {
    const jwks = await getAppleJWKS();

    const { payload } = await jose.jwtVerify(identityToken, jwks, {
      issuer: 'https://appleid.apple.com',
      algorithms: ['RS256'],
    });

    return {
      iss: payload.iss as string,
      aud: payload.aud as string,
      exp: payload.exp as number,
      iat: payload.iat as number,
      sub: payload.sub as string,
      email: payload.email as string | undefined,
      email_verified: payload.email_verified as string | undefined,
    };
  } catch (error) {
    console.error('[Auth] Apple token verification failed:', error);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export function registerAuthRoutes(app: FastifyInstance): void {
  // Exchange Apple token for server tokens
  app.post('/auth/apple', async (req, reply) => {
    let body;
    try {
      body = appleAuthSchema.parse(req.body);
    } catch (error) {
      reply.code(400);
      return { error: 'Invalid request body' };
    }

    // Verify the Apple identity token
    const applePayload = await verifyAppleToken(body.identityToken);
    if (!applePayload) {
      reply.code(401);
      return { error: 'Invalid Apple identity token' };
    }

    // Extract user info
    const email = body.user?.email || applePayload.email;
    const name = body.user?.firstName
      ? `${body.user.firstName} ${body.user.lastName || ''}`.trim()
      : undefined;

    // Create a stable user ID from Apple's sub
    const userId = `apple_${applePayload.sub}`;

    // Generate server-issued tokens
    const serverSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production';

    const accessToken = jwt.sign(
      {
        sub: userId,
        email: email,
        name: name,
        token_use: 'access',
      },
      serverSecret,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      {
        sub: userId,
        token_use: 'refresh',
      },
      serverSecret,
      { expiresIn: '30d' }
    );

    app.log.info({ userId, email }, 'User authenticated via Apple Sign In');

    // Check if user needs system agents provisioned
    const existingAgents = userAgentsStore.get(userId);
    let systemAgents = existingAgents;
    let isFirstLogin = false;

    if (!existingAgents || existingAgents.length === 0) {
      // First login - create system agents for this user
      isFirstLogin = true;
      systemAgents = createSystemAgentsForUser(userId, 'anthropic');
      userAgentsStore.set(userId, systemAgents);
      app.log.info({ userId, agentCount: systemAgents.length }, 'Created system agents for new user');
    }

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        email: email || null,
        displayName: name || 'User',
        avatarUrl: null,
      },
      isFirstLogin,
      systemAgents: systemAgents?.map(a => ({
        id: a.id,
        templateId: a.templateId,
        name: a.displayName,
        emoji: a.emoji,
        description: a.description,
        greeting: a.greeting,
        intents: a.intents,
        accentColor: a.accentColor,
      })),
    };
  });

  // Get a WebSocket ticket (requires authentication)
  app.post('/auth/ws-ticket', async (req, reply) => {
    // This endpoint requires authentication - user must be set by auth middleware
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    // Generate a cryptographically secure ticket
    const ticketId = crypto.randomBytes(32).toString('hex');

    const ticket: WSTicket = {
      ticketId,
      userId: req.user.userId,
      email: req.user.email,
      name: req.user.name,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30000, // 30 seconds
      used: false,
    };

    wsTickets.set(ticketId, ticket);

    app.log.info({ userId: req.user.userId }, 'WebSocket ticket issued');

    return {
      ticket: ticketId,
      expiresIn: 30, // seconds
    };
  });

  // Refresh tokens
  app.post('/auth/refresh', async (req, reply) => {
    let body;
    try {
      body = z.object({ refreshToken: z.string() }).parse(req.body);
    } catch {
      app.log.warn('[Auth] Refresh request missing token');
      reply.code(400);
      return { error: 'Invalid request body' };
    }

    try {
      const serverSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
      const payload = jwt.verify(body.refreshToken, serverSecret) as {
        sub: string;
        token_use: string;
      };

      if (payload.token_use !== 'refresh') {
        app.log.warn({ tokenUse: payload.token_use }, '[Auth] Token is not a refresh token');
        reply.code(401);
        return { error: 'Invalid refresh token' };
      }

      // Issue new access token
      const accessToken = jwt.sign(
        {
          sub: payload.sub,
          token_use: 'access',
        },
        serverSecret,
        { expiresIn: '24h' }
      );

      app.log.info({ userId: payload.sub }, '[Auth] Access token refreshed successfully');
      return { accessToken };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        app.log.warn({ expiredAt: error.expiredAt }, '[Auth] Refresh token expired');
      } else if (error.name === 'JsonWebTokenError') {
        app.log.warn({ message: error.message }, '[Auth] Invalid refresh token');
      } else {
        app.log.error({ error: error.message }, '[Auth] Refresh token verification error');
      }
      reply.code(401);
      return { error: 'Invalid or expired refresh token' };
    }
  });

  // Get user's system agents
  app.get('/auth/agents', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    let agents = userAgentsStore.get(userId);

    // If no agents exist, create them
    if (!agents || agents.length === 0) {
      agents = createSystemAgentsForUser(userId, 'anthropic');
      userAgentsStore.set(userId, agents);
      app.log.info({ userId, agentCount: agents.length }, 'Created system agents on demand');
    }

    return {
      agents: agents.map(a => ({
        id: a.id,
        templateId: a.templateId,
        name: a.displayName,
        emoji: a.emoji,
        description: a.description,
        personality: a.personality,
        greeting: a.greeting,
        provider: a.provider,
        intents: a.intents,
        memoryCategories: a.memoryCategories,
        accentColor: a.accentColor,
        isSystemAgent: a.isSystemAgent,
      })),
    };
  });

  // Get available agent templates
  app.get('/auth/agent-templates', async (req, reply) => {
    const templates = getSystemAgentTemplates();

    return {
      templates: templates.map(t => ({
        templateId: t.templateId,
        name: t.name,
        emoji: t.emoji,
        description: t.description,
        personality: t.personality,
        greeting: t.greeting,
        intents: t.intents,
        memoryCategories: t.memoryCategories,
        accentColor: t.accentColor,
      })),
    };
  });
}

