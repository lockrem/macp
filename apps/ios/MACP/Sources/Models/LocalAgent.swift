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

    // Legacy support - computed property for migration
    var memoryURL: URL? { nil }

    init(
        id: UUID = UUID(),
        name: String,
        description: String = "",
        provider: AgentProvider = .anthropic,
        memoryStores: [MemoryStore] = [],
        isDefault: Bool = false
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.provider = provider
        self.memoryStores = memoryStores
        self.isDefault = isDefault
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    // Custom coding to handle legacy single-memory format
    enum CodingKeys: String, CodingKey {
        case id, name, description, provider, memoryStores, isDefault, createdAt, updatedAt
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
