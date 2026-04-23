"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserAgents = getUserAgents;
exports.setUserAgents = setUserAgents;
exports.validateWSTicket = validateWSTicket;
exports.registerAuthRoutes = registerAuthRoutes;
const zod_1 = require("zod");
const jose = __importStar(require("jose"));
const jwt = __importStar(require("jsonwebtoken"));
const crypto = __importStar(require("crypto"));
const agent_templates_js_1 = require("../services/agent-templates.js");
const wsTickets = new Map();
// Clean up expired tickets periodically
setInterval(() => {
    const now = Date.now();
    for (const [ticketId, ticket] of wsTickets.entries()) {
        if (ticket.expiresAt < now || ticket.used) {
            wsTickets.delete(ticketId);
        }
    }
}, 60000); // Clean every minute
const userAgentsStore = new Map();
/**
 * Gets agents for a user
 */
function getUserAgents(userId) {
    return userAgentsStore.get(userId);
}
/**
 * Sets agents for a user
 */
function setUserAgents(userId, agents) {
    userAgentsStore.set(userId, agents);
}
function validateWSTicket(ticketId) {
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
const appleAuthSchema = zod_1.z.object({
    identityToken: zod_1.z.string(),
    authorizationCode: zod_1.z.string().optional(),
    user: zod_1.z.object({
        email: zod_1.z.string().email().optional(),
        firstName: zod_1.z.string().optional(),
        lastName: zod_1.z.string().optional(),
    }).optional(),
});
// Cache for Apple's JWKS
let appleJWKS = null;
async function getAppleJWKS() {
    if (!appleJWKS) {
        appleJWKS = jose.createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
    }
    return appleJWKS;
}
async function verifyAppleToken(identityToken) {
    try {
        const jwks = await getAppleJWKS();
        const { payload } = await jose.jwtVerify(identityToken, jwks, {
            issuer: 'https://appleid.apple.com',
            algorithms: ['RS256'],
        });
        return {
            iss: payload.iss,
            aud: payload.aud,
            exp: payload.exp,
            iat: payload.iat,
            sub: payload.sub,
            email: payload.email,
            email_verified: payload.email_verified,
        };
    }
    catch (error) {
        console.error('[Auth] Apple token verification failed:', error);
        return null;
    }
}
// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
function registerAuthRoutes(app) {
    // Exchange Apple token for server tokens
    app.post('/auth/apple', async (req, reply) => {
        let body;
        try {
            body = appleAuthSchema.parse(req.body);
        }
        catch (error) {
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
        const accessToken = jwt.sign({
            sub: userId,
            email: email,
            name: name,
            token_use: 'access',
        }, serverSecret, { expiresIn: '24h' });
        const refreshToken = jwt.sign({
            sub: userId,
            token_use: 'refresh',
        }, serverSecret, { expiresIn: '30d' });
        app.log.info({ userId, email }, 'User authenticated via Apple Sign In');
        // Check if user needs system agents provisioned
        const existingAgents = userAgentsStore.get(userId);
        let systemAgents = existingAgents;
        let isFirstLogin = false;
        if (!existingAgents || existingAgents.length === 0) {
            // First login - create system agents for this user
            isFirstLogin = true;
            systemAgents = (0, agent_templates_js_1.createSystemAgentsForUser)(userId, 'anthropic');
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
        const ticket = {
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
            body = zod_1.z.object({ refreshToken: zod_1.z.string() }).parse(req.body);
        }
        catch {
            app.log.warn('[Auth] Refresh request missing token');
            reply.code(400);
            return { error: 'Invalid request body' };
        }
        try {
            const serverSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
            const payload = jwt.verify(body.refreshToken, serverSecret);
            if (payload.token_use !== 'refresh') {
                app.log.warn({ tokenUse: payload.token_use }, '[Auth] Token is not a refresh token');
                reply.code(401);
                return { error: 'Invalid refresh token' };
            }
            // Issue new access token
            const accessToken = jwt.sign({
                sub: payload.sub,
                token_use: 'access',
            }, serverSecret, { expiresIn: '24h' });
            app.log.info({ userId: payload.sub }, '[Auth] Access token refreshed successfully');
            return { accessToken };
        }
        catch (error) {
            if (error.name === 'TokenExpiredError') {
                app.log.warn({ expiredAt: error.expiredAt }, '[Auth] Refresh token expired');
            }
            else if (error.name === 'JsonWebTokenError') {
                app.log.warn({ message: error.message }, '[Auth] Invalid refresh token');
            }
            else {
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
            agents = (0, agent_templates_js_1.createSystemAgentsForUser)(userId, 'anthropic');
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
        const templates = (0, agent_templates_js_1.getSystemAgentTemplates)();
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
//# sourceMappingURL=auth.js.map