import Foundation
import SwiftUI

// MARK: - Published Agent

/// A published agent that can be accessed via a public URL
struct PublishedAgent: Codable, Identifiable {
    var id: String { agentId }

    let agentId: String
    let ownerName: String?
    let name: String
    let emoji: String
    let description: String
    let greeting: String
    let accentColor: String
    let introductionGreeting: String
    let allowDirectChat: Bool
    let allowAgentToAgent: Bool
    let allowAccompaniedChat: Bool
    let viewCount: Int

    // Voice configuration for TTS
    let voiceId: String?       // ElevenLabs voice ID
    let voiceSpeed: Double?    // Speech speed 0.75-1.25

    var accentColorValue: Color {
        switch accentColor.lowercased() {
        case "red": return .red
        case "orange": return .orange
        case "green": return .green
        case "purple": return .purple
        case "cyan": return .cyan
        case "pink": return .pink
        case "yellow": return .yellow
        default: return .blue
        }
    }
}

// MARK: - Interaction Mode

/// Mode for interacting with a public agent
enum PublicAgentInteractionMode: String, Codable, CaseIterable {
    case direct = "direct"
    case agentToAgent = "agent_to_agent"
    case accompanied = "accompanied"

    var displayName: String {
        switch self {
        case .direct: return "Chat Directly"
        case .agentToAgent: return "Send My Agent"
        case .accompanied: return "Go Together"
        }
    }

    var description: String {
        switch self {
        case .direct:
            return "Chat anonymously with the agent"
        case .agentToAgent:
            return "Watch your agents converse autonomously"
        case .accompanied:
            return "You and your agent interact together"
        }
    }

    var iconName: String {
        switch self {
        case .direct: return "person.fill"
        case .agentToAgent: return "arrow.left.arrow.right"
        case .accompanied: return "person.2.fill"
        }
    }
}

// MARK: - Public Agent Session

/// A session between a visitor and a public agent
struct PublicAgentSession: Codable, Identifiable {
    var id: String { sessionId }

    let sessionId: String
    let agentId: String
    let mode: PublicAgentInteractionMode
    let status: SessionStatus
    let createdAt: String
    let agent: SessionAgentInfo?

    struct SessionAgentInfo: Codable {
        let name: String
        let emoji: String
        let greeting: String
    }

    enum SessionStatus: String, Codable {
        case active
        case completed
        case abandoned
    }
}

// MARK: - Session Messages

/// A message in a public agent session
struct PublicSessionMessage: Codable, Identifiable {
    let id: String
    let role: MessageRole
    let content: String
    let timestamp: String

    enum MessageRole: String, Codable {
        case user
        case assistant
        case visitorAgent = "visitor_agent"
        case system
    }

    var isFromUser: Bool {
        role == .user || role == .visitorAgent
    }
}

// MARK: - Message Response

/// Response from sending a message
struct PublicMessageResponse: Codable {
    let userMessage: MessageInfo
    let agentMessage: AgentMessageInfo

    struct MessageInfo: Codable {
        let id: String
        let content: String
        let role: String?
        let timestamp: String?
    }

    struct AgentMessageInfo: Codable {
        let id: String
        let content: String
        let role: String?
        let timestamp: String?
        let tokensUsed: Int?
    }
}

// MARK: - Session Completion

/// Response from completing a session
struct SessionCompletionResponse: Codable {
    let sessionId: String
    let status: String
    let completedAt: String?
    let extractedData: ExtractedSessionData
    let messageCount: Int
}

/// Extracted data from a completed session
struct ExtractedSessionData: Codable {
    let preferences: [String: String]
    let memories: [String]
    let summary: String
    let completedTopics: [String]
}

// MARK: - Publishing

/// Configuration for publishing an agent
struct PublishAgentConfig: Codable {
    let agentId: String
    let name: String
    let emoji: String
    let description: String
    let personality: String
    let greeting: String
    let accentColor: String
    let allowDirectChat: Bool
    let allowAgentToAgent: Bool
    let allowAccompaniedChat: Bool
    let introductionGreeting: String?
    let introductionQuestions: [PublicIntroductionQuestion]?
}

/// Introduction question for public agents
struct PublicIntroductionQuestion: Codable, Identifiable {
    let id: String
    let question: String
    let followUp: String?
    let extractsMemory: [String]
    let extractsRules: Bool
}

/// Response from publishing an agent
struct PublishAgentResponse: Codable {
    let success: Bool
    let agentId: String
    let url: String
    let agent: PublishedAgentInfo

    struct PublishedAgentInfo: Codable {
        let agentId: String
        let name: String
        let emoji: String
        let isActive: Bool
        let allowDirectChat: Bool
        let allowAgentToAgent: Bool
        let allowAccompaniedChat: Bool
        let createdAt: String
    }
}

/// Published agent status
struct PublishStatusResponse: Codable {
    let isPublished: Bool
    let agentId: String?
    let url: String?
    let isActive: Bool?
    let allowDirectChat: Bool?
    let allowAgentToAgent: Bool?
    let allowAccompaniedChat: Bool?
    let viewCount: Int?
    let createdAt: String?
    let updatedAt: String?
}

// MARK: - My Published Agents

/// Response containing user's published agents
struct MyPublishedAgentsResponse: Codable {
    let agents: [MyPublishedAgentInfo]
    let totalPublished: Int
}

/// Info about a user's published agent
struct MyPublishedAgentInfo: Codable, Identifiable {
    var id: String { agentId }

    let agentId: String
    let name: String
    let emoji: String
    let isActive: Bool
    let viewCount: Int
    let sessionCount: Int
    let url: String
    let allowDirectChat: Bool
    let allowAgentToAgent: Bool
    let allowAccompaniedChat: Bool
    let createdAt: String
    let updatedAt: String
}

// MARK: - Session Creation Request

/// Request to create a public session
struct CreatePublicSessionRequest: Codable {
    let mode: PublicAgentInteractionMode
    let visitorId: String
    let visitorUserId: String?
    let visitorAgentId: String?
    let visitorAgentName: String?
}

// MARK: - Send Message Request

/// Request to send a message in a public session
struct SendPublicMessageRequest: Codable {
    let sessionId: String
    let content: String
    let role: String
    let apiKey: String
    let provider: String
}

// MARK: - Complete Session Request

/// Request to complete a public session
struct CompletePublicSessionRequest: Codable {
    let sessionId: String
    let apiKey: String
    let provider: String
}

// MARK: - Autonomous Conversation Types

/// Request to start an autonomous agent-to-agent session
struct AutonomousSessionRequest: Codable {
    let visitorAgentId: String
    let visitorAgentName: String
    let visitorAgentEmoji: String
    let visitorAgentPersonality: String
    let visitorAgentQuestions: [String]
    let visitorApiKey: String
    let visitorProvider: String
    let visitorContext: String?
    let maxTurns: Int
}

/// Event types for autonomous session
enum AutonomousSessionEvent {
    case started(AutonomousSessionStarted)
    case turn(AutonomousTurn)
    case thinking(String)  // agent name
    case summarizing
    case complete(AutonomousSessionComplete)
    case stopped
    case error(String)
}

/// Info sent when autonomous session starts
struct AutonomousSessionStarted: Codable {
    let hostAgent: AgentInfo
    let visitorAgent: AgentInfo
    var maxTurns: Int?

    struct AgentInfo: Codable {
        let name: String
        let emoji: String
    }
}

/// A single turn in an autonomous conversation
struct AutonomousTurn: Codable, Identifiable {
    var id: String { "\(turnNumber)-\(role)" }

    let turnNumber: Int
    let role: String  // "host" or "visitor"
    let agentName: String
    let emoji: String
    let content: String
    let timestamp: String
}

/// Thinking indicator during autonomous conversation
struct AutonomousThinking: Codable {
    let agent: String
}

/// Completion data for autonomous session
struct AutonomousSessionComplete: Codable {
    let summary: String
    let factsLearned: [String]
    let questionsAnswered: [String]
    let totalTurns: Int
}

/// Error from autonomous session
struct AutonomousError: Codable {
    let message: String
}

/// Response for autonomous availability check
struct AutonomousAvailability: Codable {
    let available: Bool
    let reason: String?
    let agent: AutonomousAgentInfo?

    struct AutonomousAgentInfo: Codable {
        let name: String
        let emoji: String
        let introductionQuestions: [String]
    }
}

// MARK: - WebSocket Message Types

/// Outgoing WebSocket message wrapper
struct WebSocketOutgoingMessage<T: Encodable>: Encodable {
    let action: String
    let payload: T?
}

/// Payload for starting autonomous session via WebSocket
struct StartAutonomousPayload: Encodable {
    let hostAgentId: String
    let visitorAgentId: String
    let visitorAgentName: String
    let visitorAgentEmoji: String
    let visitorAgentPersonality: String
    let visitorAgentQuestions: [String]
    let visitorApiKey: String
    let visitorProvider: String
    let visitorContext: String?
    let maxTurns: Int
}

/// Payload for interjecting in a conversation
struct InterjectPayload: Encodable {
    let message: String
}

/// Empty payload for actions like stop
struct EmptyPayload: Encodable {}

/// Envelope for incoming WebSocket messages (to read type first)
struct WebSocketMessageEnvelope: Decodable {
    let type: String
}

/// WebSocket message for "started" event
struct WebSocketStartedMessage: Decodable {
    let type: String
    let conversationId: String?
    let hostAgent: AutonomousSessionStarted.AgentInfo
    let visitorAgent: AutonomousSessionStarted.AgentInfo
    let maxTurns: Int?
}

/// WebSocket message for "turn" event
struct WebSocketTurnMessage: Decodable {
    let type: String
    let turn: AutonomousTurn
}

/// WebSocket message for "thinking" event
struct WebSocketThinkingMessage: Decodable {
    let type: String
    let agent: String
}

/// WebSocket message for "complete" event
struct WebSocketCompleteMessage: Decodable {
    let type: String
    let summary: String
    let factsLearned: [String]
    let questionsAnswered: [String]
    let totalTurns: Int
}

/// WebSocket message for "error" event
struct WebSocketErrorMessage: Decodable {
    let type: String
    let message: String
}

// MARK: - Orchestrated Conversation Types

/// Event types for orchestrated session (host greets, user chats, user's agents bid to join)
enum OrchestratedSessionEvent {
    case started(OrchestratedStartedInfo)
    case turn(OrchestratedTurn)
    case thinking(String, String?)  // agent ID, agent name
    case agentJoined(OrchestratedAgentInfo, String?)  // agent, reason
    case taskCompleted(TaskCompletedInfo)  // task was completed by host
    case complete(String?)  // summary
    case stopped
    case error(String)
}

/// Info about a completed task
struct TaskCompletedInfo {
    let taskId: String
    let agentId: String
    let agentName: String
    let summary: String
    let hostAgentName: String
}

/// Info sent when orchestrated session starts
struct OrchestratedStartedInfo {
    let hostAgent: OrchestratedAgentInfo
    let userAgents: [OrchestratedAgentInfo]
}

/// Basic agent info for orchestrated conversations
struct OrchestratedAgentInfo: Codable {
    let id: String
    let name: String
    let emoji: String
    var description: String?
}

/// A single turn in an orchestrated conversation
struct OrchestratedTurn: Codable, Identifiable {
    var id: String { "\(turnNumber)-\(role)-\(agentId ?? "user")" }

    let turnNumber: Int
    let role: String  // "host", "user", or "agent"
    let agentId: String?
    let agentName: String
    let emoji: String
    let content: String
    let timestamp: String
}

/// Outgoing message for orchestrated conversation
struct OrchestratedOutgoingMessage<T: Encodable>: Encodable {
    let action: String
    let payload: T
}

/// Payload for starting orchestrated session
struct StartOrchestratedPayload: Encodable {
    let hostAgentId: String
    let visitorId: String?  // Device ID for visitor memory tracking (enables VIP treatment on return visits)
    let visitorUserId: String?  // Authenticated user ID for persistent memory storage across devices
    let userAgents: [OrchestratedAgentPayload]
    let apiKey: String
    let provider: String
}

/// Agent payload for orchestrated session
struct OrchestratedAgentPayload: Encodable {
    let id: String
    let name: String
    let emoji: String
    let personality: String
    let description: String?
    let intents: [String]
    let memories: [String]?  // Recent relevant memories about the user
    let tasks: [OrchestratedTaskPayload]?  // Pending tasks looking for opportunities
}

/// Task payload for orchestrated session
struct OrchestratedTaskPayload: Encodable {
    let id: String
    let description: String
    let keywords: [String]
    let category: String

    init(from task: AgentTask) {
        // Use server ID if available (critical for task completion tracking), otherwise fall back to local UUID
        self.id = task.serverId ?? task.id.uuidString
        self.description = task.description
        self.keywords = task.keywords
        self.category = task.category.rawValue
    }
}

/// Payload for sending a message in orchestrated conversation
struct SendMessagePayload: Encodable {
    let message: String
}

/// Wrapper for sendMessage action
struct OrchestratedSendMessage: Encodable {
    let action: String
    let payload: SendMessagePayload
}

// MARK: - Orchestrated WebSocket Messages (Incoming)

/// WebSocket message for "orchestratedStarted" event
struct OrchestratedStartedMessage: Decodable {
    let type: String
    let conversationId: String?
    let hostAgent: OrchestratedAgentInfo
    let userAgents: [OrchestratedAgentInfo]
}

/// WebSocket message for orchestrated "turn" event
struct OrchestratedTurnMessage: Decodable {
    let type: String
    let turn: OrchestratedTurn
}

/// WebSocket message for orchestrated "thinking" event
struct OrchestratedThinkingMessage: Decodable {
    let type: String
    let agent: String
    let agentName: String?
}

/// WebSocket message for "agentJoined" event
struct OrchestratedAgentJoinedMessage: Decodable {
    let type: String
    let agent: OrchestratedAgentInfo
    let reason: String?
}

/// WebSocket message for "taskCompleted" event
struct OrchestratedTaskCompletedMessage: Decodable {
    let type: String
    let taskId: String
    let agentId: String
    let agentName: String
    let summary: String
    let hostAgentName: String
}

/// WebSocket message for orchestrated "complete" event
struct OrchestratedCompleteMessage: Decodable {
    let type: String
    let summary: String?
}
