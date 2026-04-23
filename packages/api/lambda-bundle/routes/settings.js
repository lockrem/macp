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
exports.registerSettingsRoutes = registerSettingsRoutes;
const zod_1 = require("zod");
const client_s3_1 = require("@aws-sdk/client-s3");
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const crypto = __importStar(require("crypto"));
// -----------------------------------------------------------------------------
// AWS Clients
// -----------------------------------------------------------------------------
const s3Client = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const secretsClient = new client_secrets_manager_1.SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
const bucketName = process.env.MEMORY_BUCKET || 'macp-dev-memories';
// -----------------------------------------------------------------------------
// Encryption (AES-256-GCM)
// -----------------------------------------------------------------------------
// Cache the encryption key to avoid fetching from Secrets Manager on every request
let cachedEncryptionKey = null;
async function getEncryptionKey() {
    // Return cached key if available
    if (cachedEncryptionKey) {
        return cachedEncryptionKey;
    }
    // Try environment variables first
    if (process.env.SETTINGS_ENCRYPTION_KEY) {
        cachedEncryptionKey = process.env.SETTINGS_ENCRYPTION_KEY;
        return cachedEncryptionKey;
    }
    if (process.env.JWT_SECRET) {
        cachedEncryptionKey = process.env.JWT_SECRET;
        return cachedEncryptionKey;
    }
    // Fetch from Secrets Manager
    try {
        const secretName = process.env.JWT_SECRET_NAME || 'macp-dev/jwt-secret';
        const response = await secretsClient.send(new client_secrets_manager_1.GetSecretValueCommand({
            SecretId: secretName,
        }));
        if (response.SecretString) {
            cachedEncryptionKey = response.SecretString;
            return response.SecretString;
        }
    }
    catch (error) {
        console.error('[Settings] Failed to fetch encryption key from Secrets Manager:', error);
    }
    // Fallback (should not be used in production)
    console.warn('[Settings] Using fallback encryption key - this should not happen in production!');
    return 'dev-key-change-in-production';
}
// Legacy sync key for backwards compatibility during migration
const LEGACY_ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-key-change-in-production';
function deriveKey(secret) {
    return crypto.scryptSync(secret, 'macp-settings-salt', 32);
}
async function encrypt(data) {
    const encryptionKey = await getEncryptionKey();
    const key = deriveKey(encryptionKey);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    // Combine iv + authTag + encrypted data
    return iv.toString('base64') + '.' + authTag.toString('base64') + '.' + encrypted;
}
async function decrypt(encryptedData) {
    const parts = encryptedData.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
    }
    const encryptionKey = await getEncryptionKey();
    const key = deriveKey(encryptionKey);
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------
const agentSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    description: zod_1.z.string(),
    provider: zod_1.z.enum(['anthropic', 'openai', 'gemini', 'groq']),
    isDefault: zod_1.z.boolean(),
    memoryStores: zod_1.z.array(zod_1.z.any()).optional(),
    createdAt: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
    // Allow additional fields (emoji, personality, greeting, voice settings, etc.)
    // without stripping them during validation
}).passthrough();
const settingsSchema = zod_1.z.object({
    apiKeys: zod_1.z.object({
        anthropic: zod_1.z.string().optional(),
        openai: zod_1.z.string().optional(),
        gemini: zod_1.z.string().optional(),
        groq: zod_1.z.string().optional(),
    }).optional(),
    agents: zod_1.z.array(agentSchema).optional(),
    updatedAt: zod_1.z.string().optional(),
});
// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
function registerSettingsRoutes(app) {
    // Get user settings
    app.get('/settings', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const key = `settings/${userId}/settings.json`;
        try {
            const response = await s3Client.send(new client_s3_1.GetObjectCommand({
                Bucket: bucketName,
                Key: key,
            }));
            const encryptedData = await response.Body?.transformToString();
            if (!encryptedData) {
                return { settings: null };
            }
            const decrypted = await decrypt(encryptedData);
            const settings = JSON.parse(decrypted);
            app.log.info({ userId }, 'User settings retrieved');
            return { settings };
        }
        catch (error) {
            if (error.name === 'NoSuchKey') {
                return { settings: null };
            }
            app.log.error({
                userId,
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack,
            }, 'Failed to retrieve settings');
            reply.code(500);
            return { error: 'Failed to retrieve settings', details: error.message };
        }
    });
    // Save user settings
    app.put('/settings', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        let body;
        try {
            body = settingsSchema.parse(req.body);
        }
        catch (error) {
            reply.code(400);
            return { error: 'Invalid settings format' };
        }
        const userId = req.user.userId;
        const key = `settings/${userId}/settings.json`;
        // Add timestamp
        const settings = {
            ...body,
            updatedAt: new Date().toISOString(),
        };
        try {
            const encrypted = await encrypt(JSON.stringify(settings));
            await s3Client.send(new client_s3_1.PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: encrypted,
                ContentType: 'application/octet-stream',
                ServerSideEncryption: 'AES256',
            }));
            app.log.info({ userId }, 'User settings saved');
            return { success: true, updatedAt: settings.updatedAt };
        }
        catch (error) {
            app.log.error({ userId, error: error.message }, 'Failed to save settings');
            reply.code(500);
            return { error: 'Failed to save settings' };
        }
    });
    // Partial update (merge with existing)
    app.patch('/settings', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        let body;
        try {
            body = settingsSchema.partial().parse(req.body);
        }
        catch (error) {
            reply.code(400);
            return { error: 'Invalid settings format' };
        }
        const userId = req.user.userId;
        const key = `settings/${userId}/settings.json`;
        try {
            // Get existing settings
            let existingSettings = {};
            try {
                const response = await s3Client.send(new client_s3_1.GetObjectCommand({
                    Bucket: bucketName,
                    Key: key,
                }));
                const encryptedData = await response.Body?.transformToString();
                if (encryptedData) {
                    existingSettings = JSON.parse(await decrypt(encryptedData));
                }
            }
            catch (error) {
                if (error.name !== 'NoSuchKey') {
                    throw error;
                }
            }
            // Merge settings
            const mergedSettings = {
                ...existingSettings,
                ...body,
                apiKeys: {
                    ...existingSettings.apiKeys,
                    ...body.apiKeys,
                },
                updatedAt: new Date().toISOString(),
            };
            // If agents are provided, replace entirely (don't merge)
            if (body.agents !== undefined) {
                mergedSettings.agents = body.agents;
            }
            const encrypted = await encrypt(JSON.stringify(mergedSettings));
            await s3Client.send(new client_s3_1.PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: encrypted,
                ContentType: 'application/octet-stream',
                ServerSideEncryption: 'AES256',
            }));
            app.log.info({ userId }, 'User settings patched');
            return { success: true, updatedAt: mergedSettings.updatedAt };
        }
        catch (error) {
            app.log.error({ userId, error: error.message }, 'Failed to patch settings');
            reply.code(500);
            return { error: 'Failed to update settings' };
        }
    });
}
//# sourceMappingURL=settings.js.map