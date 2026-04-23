import Foundation

// MARK: - Introduction Question (for custom agents)

/// A question to ask during an introduction flow
struct IntroductionQuestion: Codable, Identifiable {
    var id: String
    var question: String
    var followUp: String?
    var extractsMemory: [String]  // Memory categories this extracts to
    var extractsRules: Bool       // Whether this extracts preferences/rules
    var priority: Int             // Order to ask (1 = first)

    init(
        id: String = UUID().uuidString,
        question: String,
        followUp: String? = nil,
        extractsMemory: [String] = [],
        extractsRules: Bool = false,
        priority: Int = 1
    ) {
        self.id = id
        self.question = question
        self.followUp = followUp
        self.extractsMemory = extractsMemory
        self.extractsRules = extractsRules
        self.priority = priority
    }
}

// MARK: - Introduction Status

/// The state of an introduction for a specific agent
enum IntroductionState: String, Codable {
    case notStarted = "not_started"
    case inProgress = "in_progress"
    case completed = "completed"
    case skipped = "skipped"
}

/// Introduction status for a specific agent
struct AgentIntroductionStatus: Codable, Identifiable {
    let agentId: String
    let agentName: String?
    let agentEmoji: String?
    let introductionStatus: IntroductionState
    let progress: IntroductionProgress
    let factsLearned: Int
    let rulesLearned: Int
    let completedAt: String?
    let needsIntroduction: Bool

    var id: String { agentId }
}

/// Progress through introduction questions
struct IntroductionProgress: Codable {
    let questionsAsked: Int
    let totalQuestions: Int

    var progressText: String {
        "\(questionsAsked) of \(totalQuestions)"
    }

    var progressFraction: Double {
        guard totalQuestions > 0 else { return 0 }
        return Double(questionsAsked) / Double(totalQuestions)
    }
}

/// Overall introduction status for all agents
struct IntroductionStatusResponse: Codable {
    let userId: String
    let agents: [AgentIntroductionStatus]
    let lastUpdated: String
}

// MARK: - Introduction Conversation

/// Response when creating an introduction conversation
struct CreateIntroductionResponse: Codable {
    let id: String
    let topic: String
    let mode: String
    let status: String
    let agentId: String
    let agentName: String
    let agentEmoji: String
    let introductionGreeting: String
    let totalQuestions: Int
    let createdAt: String
}

/// Who is responding to the introduction questions
enum IntroductionResponderType: String, Codable {
    case human = "human"
    case agent = "agent"
}

/// Request to create an introduction conversation
struct CreateIntroductionRequest: Codable {
    let agentId: String
    let apiKey: String
    let provider: String
    // For custom agents, include the questions and greeting
    let agentName: String?
    let agentEmoji: String?
    let introductionGreeting: String?
    let introductionQuestions: [IntroductionQuestion]?
    // For agent-to-agent introductions
    let responderType: IntroductionResponderType?
    let respondingAgentId: String?
    let respondingAgentName: String?
}

/// Request to send a message in an introduction
struct IntroductionMessageRequest: Codable {
    let content: String
}

/// Response from sending a message in an introduction
struct IntroductionMessageResponse: Codable {
    let humanMessage: MessageInfo
    let agentMessage: AgentMessageInfo
    let progress: IntroductionProgress
    let isComplete: Bool

    struct MessageInfo: Codable {
        let id: String
        let content: String
    }

    struct AgentMessageInfo: Codable {
        let id: String
        let content: String
        let agentName: String
        let agentEmoji: String?
        let tokens: TokenUsage?
    }

    struct TokenUsage: Codable {
        let input: Int?
        let output: Int?
    }
}

/// Response when completing an introduction
struct IntroductionCompleteResponse: Codable {
    let conversationId: String
    let agentId: String
    let agentName: String
    let status: String
    let factsLearned: Int
    let rulesLearned: Int
    let summary: String
}

// MARK: - Introduction Start Info

/// Information needed to start an introduction
struct IntroductionStartInfo: Codable {
    let agentId: String
    let agentName: String
    let agentEmoji: String
    let introductionGreeting: String
    let totalQuestions: Int
    let firstQuestion: FirstQuestion?

    struct FirstQuestion: Codable {
        let id: String
        let question: String
    }
}
