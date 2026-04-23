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
exports.handler = void 0;
const aws_lambda_1 = __importDefault(require("@fastify/aws-lambda"));
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const secretsClient = new client_secrets_manager_1.SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
// Get API keys from Secrets Manager and set as environment variables
async function loadApiKeys() {
    if (process.env.ANTHROPIC_API_KEY) {
        console.log('[Lambda] API keys already loaded');
        return;
    }
    const prefix = process.env.PREFIX || 'macp-dev';
    try {
        console.log(`[Lambda] Fetching API keys secret: ${prefix}/api-keys`);
        const response = await secretsClient.send(new client_secrets_manager_1.GetSecretValueCommand({
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
    }
    catch (error) {
        console.warn('[Lambda] Failed to fetch API keys secret:', error);
    }
}
// Get database URL from Secrets Manager
async function getDatabaseUrl() {
    // Check environment variable first
    if (process.env.DATABASE_URL) {
        console.log('[Lambda] Using DATABASE_URL from environment');
        return process.env.DATABASE_URL;
    }
    const prefix = process.env.PREFIX || 'macp-dev';
    try {
        console.log(`[Lambda] Fetching database secret: ${prefix}/database`);
        const response = await secretsClient.send(new client_secrets_manager_1.GetSecretValueCommand({
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
    }
    catch (error) {
        console.error('[Lambda] Failed to fetch database secret:', error);
    }
    console.error('[Lambda] No database URL found!');
    return '';
}
// Lazy initialization - don't import server until we have the database URL
let serverPromise = null;
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
        const { createServer } = await Promise.resolve().then(() => __importStar(require('./server.js')));
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
let proxy;
const handler = async (event, context) => {
    if (!proxy) {
        const server = await getServer();
        proxy = (0, aws_lambda_1.default)(server, {
            decorateRequest: true,
        });
        await server.ready();
    }
    return proxy(event, context);
};
exports.handler = handler;
//# sourceMappingURL=lambda.js.map