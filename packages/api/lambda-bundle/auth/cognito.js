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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cognitoAuth = void 0;
exports.configureCognito = configureCognito;
exports.verifyToken = verifyToken;
exports.verifyServerToken = verifyServerToken;
exports.requireAuth = requireAuth;
exports.getCurrentUserId = getCurrentUserId;
exports.getUserIdOrNull = getUserIdOrNull;
exports.requireUserId = requireUserId;
const aws_jwt_verify_1 = require("aws-jwt-verify");
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const jwt = __importStar(require("jsonwebtoken"));
// -----------------------------------------------------------------------------
// Cognito Verifier
// -----------------------------------------------------------------------------
let verifier = null;
function configureCognito(config) {
    verifier = aws_jwt_verify_1.CognitoJwtVerifier.create({
        userPoolId: config.userPoolId,
        clientId: config.clientId,
        tokenUse: 'access',
    });
    console.log(`[Auth] Cognito configured for pool: ${config.userPoolId}`);
}
async function verifyToken(token) {
    if (!verifier) {
        console.warn('[Auth] Cognito not configured, skipping verification');
        return null;
    }
    try {
        const payload = await verifier.verify(token);
        return {
            userId: payload.sub,
            email: payload.email,
            name: payload.name,
            groups: payload['cognito:groups'],
        };
    }
    catch (error) {
        console.error('[Auth] Cognito token verification failed:', error);
        return null;
    }
}
function verifyServerToken(token) {
    const serverSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
    try {
        const payload = jwt.verify(token, serverSecret);
        // Only accept access tokens
        if (payload.token_use !== 'access') {
            console.log('[Auth] Token rejected: not an access token (token_use:', payload.token_use, ')');
            return null;
        }
        return {
            userId: payload.sub,
            email: payload.email,
            name: payload.name,
        };
    }
    catch (error) {
        // Log specific JWT errors for debugging
        if (error.name === 'TokenExpiredError') {
            console.log('[Auth] Server token expired at:', error.expiredAt);
        }
        else if (error.name === 'JsonWebTokenError') {
            console.log('[Auth] Invalid server token:', error.message);
        }
        else {
            console.log('[Auth] Server token verification error:', error.message);
        }
        return null;
    }
}
// -----------------------------------------------------------------------------
// Fastify Plugin
// -----------------------------------------------------------------------------
async function cognitoAuthPlugin(app) {
    // Add authentication decorator
    app.decorateRequest('user', null);
    // Add auth hook that runs before route handlers
    app.addHook('preHandler', async (request, reply) => {
        // Skip auth for health checks, public routes, and specific public auth endpoints
        // WebSocket skipped here because WS upgrades don't have Authorization headers
        // - WS auth is validated inside the WebSocket handler via query param token
        // Note: /auth/ws-ticket requires authentication (to issue a WebSocket ticket)
        const publicAuthEndpoints = ['/auth/apple', '/auth/refresh'];
        const isPublicAuth = publicAuthEndpoints.some(ep => request.url.startsWith(ep));
        // AI utility endpoints are public - they self-authenticate via API key in request body
        const isAIEndpoint = request.url.startsWith('/api/ai/');
        if (request.url.startsWith('/health') ||
            request.url.startsWith('/public/') ||
            isPublicAuth ||
            isAIEndpoint ||
            request.url.startsWith('/ws') ||
            request.url === '/') {
            return;
        }
        // Audit routes: allow with x-audit-key header (for internal dashboard)
        if (request.url.startsWith('/audit/')) {
            const auditKey = request.headers['x-audit-key'];
            const expectedKey = process.env.AUDIT_API_KEY || 'macp-audit-2026';
            if (auditKey === expectedKey) {
                return;
            }
        }
        // Admin routes: allow with x-admin-secret header (for migrations, etc.)
        if (request.url.startsWith('/api/admin/')) {
            const adminSecret = request.headers['x-admin-secret'];
            const expectedSecret = process.env.ADMIN_MIGRATION_SECRET || 'migrate-contacts-2026';
            if (adminSecret === expectedSecret) {
                return;
            }
        }
        // Development mode: allow x-user-id header for testing
        if (process.env.NODE_ENV !== 'production') {
            const devUserId = request.headers['x-user-id'];
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
            console.log('[Auth] Both verifications failed for', request.url);
            reply.code(401).send({ error: 'Invalid or expired token' });
            return;
        }
        request.user = user;
        if (request.url.includes('/contacts')) {
            console.log('[Auth] User set for contacts request:', user.userId);
        }
    });
}
exports.cognitoAuth = (0, fastify_plugin_1.default)(cognitoAuthPlugin, {
    name: 'cognito-auth',
});
// -----------------------------------------------------------------------------
// Helper: Require Auth
// -----------------------------------------------------------------------------
/**
 * Decorator for routes that require authentication
 */
function requireAuth(request, reply) {
    if (!request.user) {
        reply.code(401).send({ error: 'Authentication required' });
    }
}
/**
 * Get the current user ID from the request, throwing if not authenticated
 */
function getCurrentUserId(request) {
    if (!request.user) {
        throw new Error('Not authenticated');
    }
    return request.user.userId;
}
/**
 * Get the current user ID, or null if not authenticated.
 * Use this when you need to handle unauthenticated requests gracefully.
 */
function getUserIdOrNull(request) {
    return request.user?.userId || null;
}
/**
 * Require authentication and return userId, or send 401 response.
 * Returns userId if authenticated, null if 401 was sent.
 */
function requireUserId(request, reply) {
    const userId = request.user?.userId;
    if (!userId) {
        reply.code(401).send({ error: 'Authentication required' });
        return null;
    }
    return userId;
}
//# sourceMappingURL=cognito.js.map