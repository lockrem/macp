import Foundation

/// A locally configured AI agent with memory support
struct LocalAgent: Codable, Identifiable {
    let id: UUID
    var name: String
    var description: String
    var provider: AgentProvider
    var memoryStores: [MemoryStore]
    var isDefault: Bool
    var createdAt: Date
    var updatedAt: Date

    // Personality & appearance
    var emoji: String  // Emoji avatar (e.g., "🏥", "💪", "💼")
    var personality: String  // How the agent should behave
    var greeting: String  // Custom greeting message
    var accentColorName: String  // Color theme for the agent

    // Legacy support - computed property for migration
    var memoryURL: URL? { nil }

    init(
        id: UUID = UUID(),
        name: String,
        description: String = "",
        provider: AgentProvider = .anthropic,
        memoryStores: [MemoryStore] = [],
        isDefault: Bool = false,
        emoji: String = "🤖",
        personality: String = "friendly and helpful",
        greeting: String = "Hey! What's on your mind?",
        accentColorName: String = "blue"
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.provider = provider
        self.memoryStores = memoryStores
        self.isDefault = isDefault
        self.emoji = emoji
        self.personality = personality
        self.greeting = greeting
        self.accentColorName = accentColorName
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    // Custom coding to handle legacy single-memory format
    enum CodingKeys: String, CodingKey {
        case id, name, description, provider, memoryStores, isDefault, createdAt, updatedAt
        case emoji, personality, greeting, accentColorName
        case memoryURL // Legacy key
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decode(String.self, forKey: .description)
        provider = try container.decode(AgentProvider.self, forKey: .provider)
        isDefault = try container.decode(Bool.self, forKey: .isDefault)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)

        // Try to decode new format, fall back to empty array
        memoryStores = (try? container.decode([MemoryStore].self, forKey: .memoryStores)) ?? []

        // Personality fields with defaults for migration
        emoji = (try? container.decode(String.self, forKey: .emoji)) ?? "🤖"
        personality = (try? container.decode(String.self, forKey: .personality)) ?? "friendly and helpful"
        greeting = (try? container.decode(String.self, forKey: .greeting)) ?? "Hey! What's on your mind?"
        accentColorName = (try? container.decode(String.self, forKey: .accentColorName)) ?? "blue"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(description, forKey: .description)
        try container.encode(provider, forKey: .provider)
        try container.encode(memoryStores, forKey: .memoryStores)
        try container.encode(isDefault, forKey: .isDefault)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
        try container.encode(emoji, forKey: .emoji)
        try container.encode(personality, forKey: .personality)
        try container.encode(greeting, forKey: .greeting)
        try container.encode(accentColorName, forKey: .accentColorName)
    }

    /// Returns the model ID to use for this agent's provider
    var modelId: String {
        switch provider {
        case .anthropic:
            return "claude-sonnet-4-20250514"
        case .openai:
            return "gpt-4o"
        case .gemini:
            return "gemini-1.5-flash"
        case .groq:
            return "llama-3.3-70b-versatile"
        }
    }

    /// System prompt incorporating personality
    var systemPrompt: String {
        """
        You are \(name), a personal AI assistant. Your personality is \(personality).

        Guidelines:
        - Be conversational and natural
        - Remember details the user shares with you
        - Ask follow-up questions to learn more
        - Be supportive and encouraging
        - Keep responses concise but warm
        """
    }
}

// MARK: - Agent Templates

extension LocalAgent {
    /// Pre-configured agent templates for common use cases
    static let templates: [AgentTemplate] = [
        AgentTemplate(
            name: "Health Buddy",
            emoji: "🏥",
            description: "Track symptoms, medications, and wellness goals",
            personality: "caring, supportive, and health-conscious. You help track symptoms, medications, and encourage healthy habits.",
            greeting: "Hi there! How are you feeling today?",
            accentColorName: "red",
            suggestedCategories: ["health", "medications", "symptoms"]
        ),
        AgentTemplate(
            name: "Fitness Coach",
            emoji: "💪",
            description: "Your personal workout and nutrition companion",
            personality: "motivating, energetic, and knowledgeable about fitness. You celebrate wins and push through challenges.",
            greeting: "Ready to crush it today? What's the plan?",
            accentColorName: "orange",
            suggestedCategories: ["exercise", "nutrition", "goals"]
        ),
        AgentTemplate(
            name: "Work Assistant",
            emoji: "💼",
            description: "Stay organized with tasks, meetings, and projects",
            personality: "professional, organized, and efficient. You help prioritize tasks and stay on top of work commitments.",
            greeting: "Good to see you! What are we tackling today?",
            accentColorName: "blue",
            suggestedCategories: ["employment", "tasks", "meetings"]
        ),
        AgentTemplate(
            name: "Money Mentor",
            emoji: "💰",
            description: "Budget tracking and financial planning helper",
            personality: "practical, non-judgmental, and financially savvy. You help track spending and work toward financial goals.",
            greeting: "Hey! Ready to check in on your finances?",
            accentColorName: "green",
            suggestedCategories: ["financial", "budget", "goals"]
        ),
        AgentTemplate(
            name: "Journal Pal",
            emoji: "📔",
            description: "Daily reflections and gratitude journaling",
            personality: "thoughtful, empathetic, and reflective. You encourage self-reflection and celebrate personal growth.",
            greeting: "Welcome back! What's on your mind today?",
            accentColorName: "purple",
            suggestedCategories: ["personal", "mood", "reflections"]
        ),
        AgentTemplate(
            name: "Study Buddy",
            emoji: "📚",
            description: "Learning companion for any subject",
            personality: "patient, encouraging, and curious. You make learning fun and help break down complex topics.",
            greeting: "Hey learner! What shall we explore today?",
            accentColorName: "cyan",
            suggestedCategories: ["education", "learning", "goals"]
        )
    ]

    /// Creates an agent from a template
    static func fromTemplate(_ template: AgentTemplate, provider: AgentProvider) -> LocalAgent {
        LocalAgent(
            name: template.name,
            description: template.description,
            provider: provider,
            emoji: template.emoji,
            personality: template.personality,
            greeting: template.greeting,
            accentColorName: template.accentColorName
        )
    }
}

/// Template for creating pre-configured agents
struct AgentTemplate: Identifiable {
    let id = UUID()
    let name: String
    let emoji: String
    let description: String
    let personality: String
    let greeting: String
    let accentColorName: String
    let suggestedCategories: [String]
}

enum AgentProvider: String, Codable, CaseIterable {
    case anthropic
    case openai
    case gemini
    case groq

    var displayName: String {
        switch self {
        case .anthropic:
            return "Claude (Anthropic)"
        case .openai:
            return "GPT (OpenAI)"
        case .gemini:
            return "Gemini (Google)"
        case .groq:
            return "Groq (Fast LLaMA)"
        }
    }

    /// Asset catalog image name for this provider
    var iconName: String {
        switch self {
        case .anthropic:
            return "claude"
        case .openai:
            return "chatgpt"
        case .gemini:
            return "gemini"
        case .groq:
            return "groq"
        }
    }

    var accentColor: String {
        switch self {
        case .anthropic:
            return "orange"
        case .openai:
            return "green"
        case .gemini:
            return "blue"
        case .groq:
            return "purple"
        }
    }
}

/// A named memory store for an agent - allows categorized memories
struct MemoryStore: Codable, Identifiable {
    let id: UUID
    var name: String
    var description: String
    var entries: [MemoryEntry]
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        name: String,
        description: String = "",
        entries: [MemoryEntry] = []
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.entries = entries
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    /// Formats this memory store as context for the AI
    func asSystemContext() -> String {
        guard !entries.isEmpty else { return "" }

        var context = "## \(name)\n"
        if !description.isEmpty {
            context += "\(description)\n"
        }
        context += "\n"
        for entry in entries.suffix(15) { // Limit per store
            context += "- \(entry.content)\n"
        }
        return context
    }

    mutating func addEntry(_ content: String, category: String = "general") {
        entries.append(MemoryEntry(content: content, category: category))
        updatedAt = Date()
    }

    mutating func removeEntry(_ entry: MemoryEntry) {
        entries.removeAll { $0.id == entry.id }
        updatedAt = Date()
    }
}

/// Memory content for an agent - stores context about past conversations
/// This now aggregates all MemoryStore entries for backward compatibility
struct AgentMemory: Codable {
    var stores: [MemoryStore]
    var lastUpdated: Date

    // Legacy property - aggregates all entries from all stores
    var entries: [MemoryEntry] {
        stores.flatMap { $0.entries }
    }

    init(stores: [MemoryStore] = []) {
        self.stores = stores
        self.lastUpdated = Date()
    }

    // Legacy initializer for backward compatibility
    init(entries: [MemoryEntry]) {
        // Convert legacy entries to a default store
        if !entries.isEmpty {
            self.stores = [MemoryStore(name: "General", description: "Default memory store", entries: entries)]
        } else {
            self.stores = []
        }
        self.lastUpdated = Date()
    }

    /// Formats all memory stores as context for the AI
    func asSystemContext() -> String {
        guard !stores.isEmpty else { return "" }

        var context = "## Relevant Memory from Past Conversations\n\n"
        for store in stores where !store.entries.isEmpty {
            context += store.asSystemContext()
            context += "\n"
        }
        return context
    }

    mutating func addEntry(_ content: String, category: String = "general") {
        // Add to the first store or create a default one
        if stores.isEmpty {
            stores.append(MemoryStore(name: "General", description: "Default memory store"))
        }
        stores[0].addEntry(content, category: category)
        lastUpdated = Date()
    }

    mutating func addStore(_ store: MemoryStore) {
        stores.append(store)
        lastUpdated = Date()
    }

    mutating func removeStore(_ store: MemoryStore) {
        stores.removeAll { $0.id == store.id }
        lastUpdated = Date()
    }

    // Custom coding to handle legacy single-entries format
    enum CodingKeys: String, CodingKey {
        case stores, lastUpdated
        case entries // Legacy key
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        lastUpdated = try container.decode(Date.self, forKey: .lastUpdated)

        // Try new format first
        if let decodedStores = try? container.decode([MemoryStore].self, forKey: .stores) {
            stores = decodedStores
        } else if let legacyEntries = try? container.decode([MemoryEntry].self, forKey: .entries) {
            // Migrate legacy format
            if !legacyEntries.isEmpty {
                stores = [MemoryStore(name: "General", description: "Migrated from legacy format", entries: legacyEntries)]
            } else {
                stores = []
            }
        } else {
            stores = []
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(stores, forKey: .stores)
        try container.encode(lastUpdated, forKey: .lastUpdated)
    }
}

struct MemoryEntry: Codable, Identifiable {
    let id: UUID
    let content: String
    let category: String
    let timestamp: Date

    init(id: UUID = UUID(), content: String, category: String = "general") {
        self.id = id
        self.content = content
        self.category = category
        self.timestamp = Date()
    }
}
