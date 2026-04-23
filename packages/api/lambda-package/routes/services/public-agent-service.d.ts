import { type AgentAdapter } from '@macp/core';
import type { PublishedAgent, PublishedAgentsIndex, PublicAgentSession, PublicSessionMessage, ExtractedSessionData, PublishAgentRequest, CreatePublicSessionRequest } from '@macp/shared';
import { type VisitorMemory } from './visitor-memory-service.js';
/**
 * Gets a published agent by agentId
 */
export declare function getPublishedAgent(agentId: string): Promise<PublishedAgent | null>;
/**
 * Gets the index of a user's published agents
 */
export declare function getPublishedAgentsIndex(userId: string): Promise<PublishedAgentsIndex | null>;
/**
 * Gets a public agent session
 */
export declare function getPublicSession(sessionId: string): Promise<PublicAgentSession | null>;
/**
 * Agent configuration for publishing (from client)
 */
export interface AgentConfigForPublishing {
    agentId: string;
    name: string;
    emoji: string;
    description: string;
    personality: string;
    greeting: string;
    accentColor: string;
}
/**
 * Publishes an agent with a public URL using its existing agentId
 */
export declare function publishAgent(userId: string, ownerName: string | undefined, agentConfig: AgentConfigForPublishing, publishConfig: PublishAgentRequest): Promise<PublishedAgent>;
/**
 * Updates a published agent's settings
 */
export declare function updatePublishedAgent(userId: string, agentId: string, updates: Partial<PublishAgentRequest> & {
    isActive?: boolean;
}): Promise<PublishedAgent>;
/**
 * Unpublishes an agent
 */
export declare function unpublishAgent(userId: string, agentId: string): Promise<void>;
/**
 * Increments the view count for a published agent
 */
export declare function incrementViewCount(agentId: string): Promise<void>;
/**
 * Creates a new public session
 */
export declare function createPublicSession(agentId: string, request: CreatePublicSessionRequest): Promise<PublicAgentSession>;
/**
 * Creates an agent adapter based on provider
 */
export declare function createAgentAdapter(apiKey: string, provider: 'anthropic' | 'openai' | 'gemini' | 'groq', modelId: string): AgentAdapter;
/**
 * Gets the default model ID for a provider
 * Uses -latest aliases where available to avoid version-specific deprecation
 */
export declare function getModelIdForProvider(provider: 'anthropic' | 'openai' | 'gemini' | 'groq'): string;
/**
 * Sends a message in a public session and gets a response
 */
export declare function sendPublicMessage(sessionId: string, content: string, role: 'user' | 'visitor_agent', apiKey: string, provider?: 'anthropic' | 'openai' | 'gemini' | 'groq'): Promise<{
    userMessage: PublicSessionMessage;
    agentMessage: PublicSessionMessage;
}>;
/**
 * Completes a public session and extracts data
 * Also saves visitor memories for personalized future visits
 */
export declare function completePublicSession(sessionId: string, apiKey: string, provider?: 'anthropic' | 'openai' | 'gemini' | 'groq'): Promise<{
    session: PublicAgentSession;
    extractedData: ExtractedSessionData;
    visitorMemory?: VisitorMemory;
}>;
/**
 * Gets sessions for a published agent (for owner dashboard)
 */
export declare function getSessionsForAgent(userId: string, agentId: string, limit?: number): Promise<PublicAgentSession[]>;
/**
 * Gets the public URL for an agent using its agentId
 */
export declare function getPublicAgentUrl(agentId: string): string;
/**
 * Validates that all required fields are present for publishing
 */
export declare function validatePublishRequest(agentConfig: AgentConfigForPublishing, publishConfig: PublishAgentRequest): {
    valid: boolean;
    errors: string[];
};
/**
 * Builds the system prompt for the host agent in an autonomous conversation
 */
export declare function buildAutonomousHostPrompt(hostAgent: PublishedAgent, visitorAgentName: string, visitorContext?: string): string;
/**
 * Builds the system prompt for the visitor agent in an autonomous conversation
 */
export declare function buildAutonomousVisitorPrompt(visitorAgentName: string, visitorPersonality: string, visitorQuestions: string[], hostAgentName: string, visitorContext?: string): string;
