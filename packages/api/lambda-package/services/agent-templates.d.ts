import type { MarketplaceCategory, AgentPricing } from '@macp/shared';
export interface IntroductionQuestion {
    id: string;
    question: string;
    followUp?: string;
    extractsMemory: string[];
    extractsRules: boolean;
    priority: number;
}
/**
 * Marketplace metadata for system agents
 * Allows MACP Originals to appear in the marketplace alongside third-party agents
 */
export interface MarketplaceMetadata {
    category: MarketplaceCategory;
    subcategory?: string;
    tags: string[];
    pricing: AgentPricing;
    featured: boolean;
    shortDescription: string;
    longDescription: string;
    capabilities: string[];
}
export interface SystemAgentTemplate {
    templateId: string;
    name: string;
    emoji: string;
    description: string;
    personality: string;
    greeting: string;
    intents: string[];
    memoryCategories: string[];
    accentColor: string;
    suggestedCategories: string[];
    introductionGreeting: string;
    introductionQuestions: IntroductionQuestion[];
    marketplace: MarketplaceMetadata;
}
/**
 * Pre-configured system agent templates
 * These are automatically provisioned for new users
 */
export declare const SYSTEM_AGENT_TEMPLATES: SystemAgentTemplate[];
/**
 * Gets all system agent templates
 */
export declare function getSystemAgentTemplates(): SystemAgentTemplate[];
/**
 * Gets a specific template by ID
 */
export declare function getTemplateById(templateId: string): SystemAgentTemplate | undefined;
/**
 * Creates agent configs from templates for a specific provider
 */
export declare function createAgentConfigsFromTemplates(provider?: 'anthropic' | 'openai' | 'gemini' | 'groq'): Array<{
    id: string;
    displayName: string;
    emoji: string;
    provider: typeof provider;
    modelId: string;
    personality: string;
    intents: string[];
    memoryCategories: string[];
}>;
/**
 * Converts a template to a database-ready agent object
 */
export declare function templateToAgent(template: SystemAgentTemplate, userId: string, provider?: 'anthropic' | 'openai' | 'gemini' | 'groq'): {
    id: string;
    userId: string;
    templateId: string;
    displayName: string;
    emoji: string;
    description: string;
    personality: string;
    greeting: string;
    provider: typeof provider;
    modelId: string;
    intents: string[];
    memoryCategories: string[];
    accentColor: string;
    isSystemAgent: boolean;
    isActive: boolean;
    createdAt: Date;
};
/**
 * Creates all system agents for a user
 */
export declare function createSystemAgentsForUser(userId: string, provider?: 'anthropic' | 'openai' | 'gemini' | 'groq'): ReturnType<typeof templateToAgent>[];
/**
 * MACP Originals - Marketplace representation of system agents
 * These are the flagship agents built by the MACP team
 */
export declare const MACP_CREATOR: {
    creatorId: string;
    displayName: string;
    bio: string;
    avatarUrl: undefined;
    verified: boolean;
    verificationBadges: "official"[];
    agentCount: number;
    totalSubscribers: number;
    averageRating: number;
};
/**
 * Converts a system agent template to marketplace format
 */
export declare function templateToMarketplaceAgent(template: SystemAgentTemplate): {
    agentId: string;
    creatorId: string;
    creatorName: string;
    creatorVerified: boolean;
    name: string;
    emoji: string;
    description: string;
    personality: string;
    greeting: string;
    accentColor: string;
    category: string;
    subcategory?: string;
    tags: string[];
    pricing: typeof template.marketplace.pricing;
    subscriberCount: number;
    sessionCount: number;
    rating: number;
    reviewCount: number;
    featured: boolean;
    isActive: boolean;
    isMACPOriginal: boolean;
    capabilities: string[];
    longDescription: string;
    createdAt: string;
    updatedAt: string;
    publishedAt: string;
};
/**
 * Gets all MACP Originals in marketplace format
 */
export declare function getMACPOriginals(): ReturnType<typeof templateToMarketplaceAgent>[];
/**
 * Gets MACP Originals by category
 */
export declare function getMACPOriginalsByCategory(category: string): ReturnType<typeof templateToMarketplaceAgent>[];
/**
 * Gets featured MACP Originals
 */
export declare function getFeaturedMACPOriginals(): ReturnType<typeof templateToMarketplaceAgent>[];
//# sourceMappingURL=agent-templates.d.ts.map