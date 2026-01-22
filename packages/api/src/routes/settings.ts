import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';

// -----------------------------------------------------------------------------
// S3 Client
// -----------------------------------------------------------------------------

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const bucketName = process.env.MEMORY_BUCKET || 'macp-dev-memories';

// -----------------------------------------------------------------------------
// Encryption (AES-256-GCM)
// -----------------------------------------------------------------------------

const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-key-change-in-production';

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, 'macp-settings-salt', 32);
}

function encrypt(data: string): string {
  const key = deriveKey(ENCRYPTION_KEY);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Combine iv + authTag + encrypted data
  return iv.toString('base64') + '.' + authTag.toString('base64') + '.' + encrypted;
}

function decrypt(encryptedData: string): string {
  const parts = encryptedData.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const key = deriveKey(ENCRYPTION_KEY);
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

const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: z.enum(['anthropic', 'openai', 'gemini', 'groq']),
  isDefault: z.boolean(),
  memoryStores: z.array(z.any()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const settingsSchema = z.object({
  apiKeys: z.object({
    anthropic: z.string().optional(),
    openai: z.string().optional(),
    gemini: z.string().optional(),
    groq: z.string().optional(),
  }).optional(),
  agents: z.array(agentSchema).optional(),
  updatedAt: z.string().optional(),
});

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export function registerSettingsRoutes(app: FastifyInstance): void {
  // Get user settings
  app.get('/settings', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const userId = req.user.userId;
    const key = `settings/${userId}/settings.json`;

    try {
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      }));

      const encryptedData = await response.Body?.transformToString();
      if (!encryptedData) {
        return { settings: null };
      }

      const decrypted = decrypt(encryptedData);
      const settings = JSON.parse(decrypted);

      app.log.info({ userId }, 'User settings retrieved');
      return { settings };
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return { settings: null };
      }
      app.log.error({ userId, error: error.message }, 'Failed to retrieve settings');
      reply.code(500);
      return { error: 'Failed to retrieve settings' };
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
    } catch (error) {
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
      const encrypted = encrypt(JSON.stringify(settings));

      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: encrypted,
        ContentType: 'application/octet-stream',
        ServerSideEncryption: 'AES256',
      }));

      app.log.info({ userId }, 'User settings saved');
      return { success: true, updatedAt: settings.updatedAt };
    } catch (error: any) {
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
    } catch (error) {
      reply.code(400);
      return { error: 'Invalid settings format' };
    }

    const userId = req.user.userId;
    const key = `settings/${userId}/settings.json`;

    try {
      // Get existing settings
      let existingSettings: any = {};
      try {
        const response = await s3Client.send(new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
        }));
        const encryptedData = await response.Body?.transformToString();
        if (encryptedData) {
          existingSettings = JSON.parse(decrypt(encryptedData));
        }
      } catch (error: any) {
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

      const encrypted = encrypt(JSON.stringify(mergedSettings));

      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: encrypted,
        ContentType: 'application/octet-stream',
        ServerSideEncryption: 'AES256',
      }));

      app.log.info({ userId }, 'User settings patched');
      return { success: true, updatedAt: mergedSettings.updatedAt };
    } catch (error: any) {
      app.log.error({ userId, error: error.message }, 'Failed to patch settings');
      reply.code(500);
      return { error: 'Failed to update settings' };
    }
  });
}
