export interface ServerConfig {
    port: number;
    host: string;
    databaseUrl: string;
    cognito?: {
        userPoolId: string;
        clientId: string;
        region?: string;
    };
    apns?: {
        teamId: string;
        keyId: string;
        privateKey: string;
        bundleId: string;
        production: boolean;
    };
}
export declare function createServer(config: ServerConfig): Promise<import("fastify").FastifyInstance<import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>>;
//# sourceMappingURL=server.d.ts.map