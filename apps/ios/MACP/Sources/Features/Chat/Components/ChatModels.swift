import Foundation

// MARK: - Unified Chat Message

/// A unified message model for all chat views
/// Conforms to ChatServiceMessage for use with ChatService
struct ChatMessage: Identifiable, ChatServiceMessage {
    let id: String
    let content: String
    let isFromUser: Bool
    let timestamp: Date

    // Optional agent information (for non-user messages)
    var agentName: String?
    var agentEmoji: String?
    var intent: String?  // For orchestrated chats

    init(
        id: String = UUID().uuidString,
        content: String,
        isFromUser: Bool,
        timestamp: Date = Date(),
        agentName: String? = nil,
        agentEmoji: String? = nil,
        intent: String? = nil
    ) {
        self.id = id
        self.content = content
        self.isFromUser = isFromUser
        self.timestamp = timestamp
        self.agentName = agentName
        self.agentEmoji = agentEmoji
        self.intent = intent
    }
}

/// Protocol for messages that can be used with ChatService
protocol ChatServiceMessage {
    var content: String { get }
    var isFromUser: Bool { get }
}

// MARK: - Agent Display Info

/// Information needed to display an agent in chat
struct ChatAgentInfo {
    let name: String
    let emoji: String
    let accentColor: String

    init(name: String, emoji: String, accentColor: String = "blue") {
        self.name = name
        self.emoji = emoji
        self.accentColor = accentColor
    }

    init(from agent: LocalAgent) {
        self.name = agent.name
        self.emoji = agent.emoji
        self.accentColor = agent.accentColorName
    }
}
