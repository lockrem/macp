// P2P Conversation
export {
  P2PConversationRunner,
  createP2PConversation,
  type P2PConversationConfig,
  type P2PConversationResult,
  type P2PAgent,
} from './p2p-conversation.js';

// Server
export { createServer, type ServerConfig } from './server.js';

// Services
export { connectionManager, ConnectionManager } from './services/connection-manager.js';
export { pushService, PushService, deliveryCoordinator } from './services/push-service.js';
export {
  analyzeAndRoute,
  getDefaultAgentConfigs,
  type OrchestrationResult,
  type AgentConfig,
} from './services/orchestration-service.js';
export {
  SYSTEM_AGENT_TEMPLATES,
  getSystemAgentTemplates,
  createSystemAgentsForUser,
  type SystemAgentTemplate,
  type IntroductionQuestion,
} from './services/agent-templates.js';
