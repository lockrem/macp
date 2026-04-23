import awsLambdaFastify, { type PromiseHandler, type LambdaResponse } from '@fastify/aws-lambda';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Get API keys from Secrets Manager and set as environment variables
async function loadApiKeys(): Promise<void> {
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[Lambda] API keys already loaded');
    return;
  }

  const prefix = process.env.PREFIX || 'macp-dev';

  try {
    console.log(`[Lambda] Fetching API keys secret: ${prefix}/api-keys`);
    const response = await secretsClient.send(new GetSecretValueCommand({
      SecretId: `${prefix}/api-keys`,
    }));

    if (response.SecretString) {
      const secret = JSON.parse(response.SecretString);
      if (secret.ANTHROPIC_API_KEY) {
        process.env.ANTHROPIC_API_KEY = secret.ANTHROPIC_API_KEY;
        console.log('[Lambda] Loaded ANTHROPIC_API_KEY from Secrets Manager');
      }
      if (secret.OPENAI_API_KEY) {
        process.env.OPENAI_API_KEY = secret.OPENAI_API_KEY;
        console.log('[Lambda] Loaded OPENAI_API_KEY from Secrets Manager');
      }
    }
  } catch (error) {
    console.warn('[Lambda] Failed to fetch API keys secret:', error);
  }
}

// Get database URL from Secrets Manager
async function getDatabaseUrl(): Promise<string> {
  // Check environment variable first
  if (process.env.DATABASE_URL) {
    console.log('[Lambda] Using DATABASE_URL from environment');
    return process.env.DATABASE_URL;
  }

  const prefix = process.env.PREFIX || 'macp-dev';

  try {
    console.log(`[Lambda] Fetching database secret: ${prefix}/database`);
    const response = await secretsClient.send(new GetSecretValueCommand({
      SecretId: `${prefix}/database`,
    }));

    if (response.SecretString) {
      const secret = JSON.parse(response.SecretString);
      // Always build connection string from components (connectionString field may be outdated)
      if (secret.host && secret.username && secret.password) {
        const url = `postgresql://${secret.username}:${encodeURIComponent(secret.password)}@${secret.host}:${secret.port || 5432}/${secret.dbname || 'macp'}`;
        console.log(`[Lambda] Built connection string: ${secret.username}@${secret.host}:${secret.port || 5432}/${secret.dbname || 'macp'}`);
        return url;
      }
      console.error('[Lambda] Secret missing required fields (host, username, password)');
    }
  } catch (error) {
    console.error('[Lambda] Failed to fetch database secret:', error);
  }

  console.error('[Lambda] No database URL found!');
  return '';
}

// Lazy initialization - don't import server until we have the database URL
let serverPromise: ReturnType<typeof import('./server.js').createServer> | null = null;

async function getServer() {
  if (!serverPromise) {
    // Fetch secrets in parallel
    console.log('[Lambda] Starting secrets fetch...');
    const [databaseUrl] = await Promise.all([
      getDatabaseUrl(),
      loadApiKeys(),
    ]);
    console.log('[Lambda] Secrets loaded. Database URL:', databaseUrl ? 'OK' : 'EMPTY');

    // Now dynamically import and create server
    const { createServer } = await import('./server.js');

    serverPromise = createServer({
      port: 3000,
      host: '0.0.0.0',
      databaseUrl,
      cognito: process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID ? {
        userPoolId: process.env.COGNITO_USER_POOL_ID,
        clientId: process.env.COGNITO_CLIENT_ID,
        region: process.env.AWS_REGION || 'us-east-1',
      } : undefined,
    });
  }
  return serverPromise;
}

// Create the Lambda handler
let proxy: PromiseHandler<APIGatewayProxyEventV2, LambdaResponse>;

export const handler = async (event: APIGatewayProxyEventV2, context: Context): Promise<LambdaResponse> => {
  if (!proxy) {
    const server = await getServer();
    proxy = awsLambdaFastify(server, {
      decorateRequest: true,
    });
    await server.ready();
  }

  return proxy(event, context);
};
