"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const aws_lambda_1 = __importDefault(require("@fastify/aws-lambda"));
const server_js_1 = require("./server.js");
// Create the Fastify server
const serverPromise = (0, server_js_1.createServer)({
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: process.env.DATABASE_URL || '',
    cognito: process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID ? {
        userPoolId: process.env.COGNITO_USER_POOL_ID,
        clientId: process.env.COGNITO_CLIENT_ID,
        region: process.env.AWS_REGION || 'us-east-1',
    } : undefined,
});
// Create the Lambda handler
let proxy;
const handler = async (event, context) => {
    if (!proxy) {
        const server = await serverPromise;
        proxy = (0, aws_lambda_1.default)(server, {
            decorateRequest: true,
        });
        await server.ready();
    }
    return proxy(event, context);
};
exports.handler = handler;
//# sourceMappingURL=lambda.js.map