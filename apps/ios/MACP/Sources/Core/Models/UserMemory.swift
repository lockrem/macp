import Foundation

// =============================================================================
// User Memory Models - Dynamic Category-Based Memory System
// These types match the server-side memory system
// =============================================================================

// MARK: - Memory Index

/// Index file that tracks all memory categories for a user
struct UserMemoryIndex: Codable {
    let userId: String
    var categories: [MemoryCategoryMeta]
    var totalFacts: Int
    var lastUpdated: String
}

/// Metadata about a memory category (stored in index)
struct MemoryCategoryMeta: Codable, Identifiable {
    let name: String
    let displayName: String
    var factCount: Int
    var lastUpdated: String

    var id: String { name }
}

// MARK: - Memory Category

/// A complete memory category file
struct UserMemoryCategory: Codable, Identifiable {
    let category: String
    let displayName: String
    let userId: String
    var lastUpdated: String

    /// Natural language summary of this category, optimized for prompt injection
    var summary: String

    /// Structured facts in this category
    var facts: [UserMemoryFact]

    var id: String { category }
}

/// A single fact learned about the user
struct UserMemoryFact: Codable, Identifiable {
    let id: String

    /// Key identifying what this fact is about (e.g., "medications", "employer")
    let key: String

    /// The actual value - can be various types
    let value: FactValue

    /// How confident we are in this fact
    let confidence: FactConfidence

    /// Where this fact was learned from (conversation ID)
    let learnedFrom: String

    /// When this fact was learned
    let learnedAt: String

    /// If this fact updates a previous fact, reference the old fact ID
    let supersedes: String?

    /// Formatted value for display
    var displayValue: String {
        switch value {
        case .string(let s):
            return s
        case .number(let n):
            return String(format: "%.2f", n)
        case .array(let arr):
            return arr.joined(separator: ", ")
        case .object(let dict):
            return dict.map { "\($0.key): \($0.value)" }.joined(separator: "; ")
        }
    }
}

enum FactConfidence: String, Codable {
    case high
    case medium
    case low

    var displayName: String {
        switch self {
        case .high: return "High"
        case .medium: return "Medium"
        case .low: return "Low"
        }
    }
}

/// Flexible value type for facts
enum FactValue: Codable {
    case string(String)
    case number(Double)
    case array([String])
    case object([String: String])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let stringValue = try? container.decode(String.self) {
            self = .string(stringValue)
        } else if let numberValue = try? container.decode(Double.self) {
            self = .number(numberValue)
        } else if let arrayValue = try? container.decode([String].self) {
            self = .array(arrayValue)
        } else if let objectValue = try? container.decode([String: String].self) {
            self = .object(objectValue)
        } else {
            throw DecodingError.typeMismatch(
                FactValue.self,
                DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Unsupported fact value type")
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch self {
        case .string(let s):
            try container.encode(s)
        case .number(let n):
            try container.encode(n)
        case .array(let arr):
            try container.encode(arr)
        case .object(let dict):
            try container.encode(dict)
        }
    }
}

// MARK: - Memory Cache

/// Fast lookup cache for memory facts
struct UserMemoryCache: Codable {
    let userId: String
    let version: Int
    let generatedAt: String

    /// Fast lookup: fact key -> location and metadata
    let factIndex: [String: FactIndexEntry]

    /// Semantic groupings for natural language queries
    let semanticTags: [String: [String]]

    /// List of available category names
    let availableCategories: [String]

    /// One-line summary of what's known about the user
    let quickSummary: String

    /// Total number of facts across all categories
    let totalFacts: Int
}

/// Entry in the fact index cache
struct FactIndexEntry: Codable {
    let category: String
    let confidence: FactConfidence
    let updatedAt: String
    let valueType: String
    let preview: String?
}

// MARK: - API Responses

/// Response from bulk memory fetch
struct BulkMemoryResponse: Codable {
    let categories: [String: UserMemoryCategory?]
    let combinedSummary: String
}

/// Response from fact availability check
struct FactAvailabilityResponse: Codable {
    let availability: [String: FactAvailability]
    let categoriesToLoad: [String]
    let unavailable: [String]
}

struct FactAvailability: Codable {
    let available: Bool
    let category: String?
    let confidence: FactConfidence?
    let preview: String?
}

/// Request for smart fact lookup
struct FactLookupRequest: Codable {
    let queries: [String]
    let includeContext: Bool
}

/// Response from smart fact lookup
struct FactLookupResponse: Codable {
    let facts: [String: FactValue]
    let availability: [String: FactAvailability]
    let unavailable: [String]
    let context: String?
}

// MARK: - Conversation Types

/// Solo conversation response
struct SoloConversationResponse: Codable {
    let id: String
    let topic: String
    let mode: String
    let status: String
    let agentName: String
    let memoryLoaded: Bool
    let createdAt: String
}

/// Message in a solo conversation
struct SoloMessageResponse: Codable {
    let humanMessage: HumanMessageInfo
    let agentMessage: AgentMessageInfo
}

struct HumanMessageInfo: Codable {
    let id: String
    let content: String
}

/// Token usage breakdown from LLM response
struct TokenUsage: Codable {
    let input: Int
    let output: Int

    var total: Int { input + output }
}

struct AgentMessageInfo: Codable {
    let id: String
    let content: String
    let agentName: String
    let tokens: TokenUsage?
}

/// End conversation response
struct EndConversationResponse: Codable {
    let conversationId: String
    let status: String
    let totalTurns: Int
    let totalMessages: Int
    let factsExtracted: ExtractedFactsInfo?
}

struct ExtractedFactsInfo: Codable {
    let categoriesUpdated: [String]
    let totalFacts: Int
}

// MARK: - Universal Chat Types (Orchestrated Routing)

/// Response from creating a universal conversation
struct UniversalConversationResponse: Codable {
    let id: String
    let topic: String
    let mode: String
    let status: String
    let availableAgents: [AvailableAgent]?
    let createdAt: String
}

/// Available agent in universal chat
struct AvailableAgent: Codable {
    let id: String
    let name: String
    let emoji: String
    let intents: [String]
}

/// Response from sending a message in universal chat
struct UniversalMessageResponse: Codable {
    let humanMessage: HumanMessageInfo
    let agentMessage: UniversalAgentMessageInfo  // Primary response (backwards compatible)
    let agentMessages: [UniversalAgentMessageInfo]?  // All agent responses (multi-agent)
    let dispatch: DispatchInfo?  // Routing info for debugging/display
}

/// Agent message info with attribution
struct UniversalAgentMessageInfo: Codable {
    let id: String
    let content: String
    let agentId: String
    let agentName: String
    let agentEmoji: String?
    let intent: String?
    let confidence: Double?
    let tokens: TokenUsage?
}

/// Multi-agent dispatch info
struct DispatchInfo: Codable {
    let allIntents: [String]?
    let primaryAgent: String?
    let supportingAgents: [String]?
    let reasoning: String?
}

// MARK: - Rules Types (Per-Agent User Preferences)

/// Index file tracking all agents with rules for a user
struct RulesIndex: Codable {
    let userId: String
    var agents: [AgentRulesMeta]
    var totalRules: Int
    var lastUpdated: String
}

/// Metadata about an agent's rules (stored in index)
struct AgentRulesMeta: Codable, Identifiable {
    let agentId: String
    let agentName: String
    var ruleCount: Int
    var lastUpdated: String

    var id: String { agentId }
}

/// All rules for a specific agent
struct AgentRules: Codable, Identifiable {
    let userId: String
    let agentId: String
    let agentName: String
    var rules: [AgentRule]
    var lastUpdated: String

    var id: String { agentId }
}

/// A single rule/preference for an agent
struct AgentRule: Codable, Identifiable {
    let id: String
    var content: String
    let createdAt: String
    var updatedAt: String
}

/// Response from adding a rule
struct AddRuleResponse: Codable {
    let rule: AgentRule
    let agentRules: AgentRules
    let index: RulesIndex
}

/// Response from bulk rules fetch
struct BulkRulesResponse: Codable {
    let rules: [String: AgentRules?]
    let combinedRules: String
}
