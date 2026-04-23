import Foundation

// MARK: - User

struct User: Codable, Identifiable {
    let id: String
    let email: String?
    let displayName: String
    let avatarUrl: String?
}

// MARK: - Agent

struct Agent: Codable, Identifiable {
    let id: String
    let ownerId: String
    let displayName: String
    let personality: String?
    let systemPrompt: String?
    let provider: String
    let modelId: String
    let temperature: Int
    let maxTokens: Int
    let isDefault: Bool
    let isActive: Bool
}

struct CreateAgentRequest: Codable {
    let displayName: String
    let personality: String?
    let provider: String
    let modelId: String
    let temperature: Int
    let maxTokens: Int
}

// MARK: - Conversation

struct Conversation: Codable, Identifiable {
    let id: String
    let topic: String
    let goal: String?
    let mode: String
    let maxTurns: Int
    let status: ConversationStatus
    let currentTurn: Int
    let createdAt: Date
    let participants: [Participant]?
}

struct Participant: Codable, Identifiable {
    let id: String
    let agentName: String
    let provider: String
}

enum ConversationStatus: String, Codable {
    case pending
    case active
    case paused
    case completed
    case cancelled
}

struct CreateConversationRequest: Codable {
    let topic: String
    let goal: String?
    let mode: String
    let maxTurns: Int
    let agents: [AgentConfigForCreate]
}

struct AgentConfigForCreate: Codable {
    let id: String
    let name: String
    let provider: String
    let description: String
}

struct InviteResponse: Codable {
    let success: Bool
    let inviteLink: String
    let conversationId: String
    let topic: String
}

struct ConversationResponse: Codable {
    let id: String
    let topic: String
    let goal: String?
    let mode: String
    let maxTurns: Int
    let status: ConversationStatus
    let currentTurn: Int
    let createdAt: String
}

struct JoinConversationRequest: Codable {
    let agentId: String
    let apiKey: String // Client's API key for their provider
    let agentConfig: AgentConfig
}

struct AgentConfig: Codable {
    let displayName: String
    let provider: String
    let modelId: String
    let systemPrompt: String?
    let personality: String?
}

struct JoinResponse: Codable {
    let participantId: String
    let conversationId: String
    let participantCount: Int
}

struct StartConversationResponse: Codable {
    let conversationId: String
    let status: String
    let message: String
}

struct StopConversationResponse: Codable {
    let conversationId: String
    let status: String
    let stoppedAtTurn: Int
    let message: String
}

// MARK: - Message

struct Message: Codable, Identifiable {
    let id: String
    let turnNumber: Int
    let agentId: String
    let agentName: String
    var agentEmoji: String?      // Agent emoji for attribution (universal mode)
    var intent: String?           // Detected intent category (universal mode)
    let content: String
    var isHuman: Bool?            // True if this is a human message
    let createdAt: Date

    init(
        id: String,
        turnNumber: Int,
        agentId: String,
        agentName: String,
        agentEmoji: String? = nil,
        intent: String? = nil,
        content: String,
        isHuman: Bool? = nil,
        createdAt: Date
    ) {
        self.id = id
        self.turnNumber = turnNumber
        self.agentId = agentId
        self.agentName = agentName
        self.agentEmoji = agentEmoji
        self.intent = intent
        self.content = content
        self.isHuman = isHuman
        self.createdAt = createdAt
    }
}

// MARK: - WebSocket Messages

struct WSMessage: Codable {
    let type: String
    let conversationId: String?
    let payload: WSPayload?
    let timestamp: Date?
}

struct WSPayload: Codable {
    let type: String?
    let turnNumber: Int?
    let agentId: String?          // Agent ID for attribution
    let agentName: String?
    let agentEmoji: String?       // Agent emoji for attribution
    let intent: String?           // Detected intent category
    let provider: String?
    let content: String?
    let isHuman: Bool?            // True if human message
    let topic: String?
    let totalTurns: Int?
    let message: String?
}

// MARK: - API Response Wrappers

struct ConversationsResponse: Codable {
    let conversations: [Conversation]
}

struct AgentsResponse: Codable {
    let agents: [Agent]
}

struct MessagesResponse: Codable {
    let conversationId: String
    let messages: [Message]
    let currentTurn: Int
    let status: ConversationStatus
}

struct WSTicketResponse: Codable {
    let ticket: String
    let expiresIn: Int
}

// MARK: - Agent Templates

/// Response from /auth/agent-templates endpoint
struct AgentTemplatesResponse: Codable {
    let templates: [AgentTemplateInfo]
}

struct AgentTemplateInfo: Codable, Identifiable {
    let templateId: String
    let name: String
    let emoji: String
    let description: String
    let personality: String
    let greeting: String
    let intents: [String]
    let memoryCategories: [String]
    let accentColor: String

    var id: String { templateId }
}
