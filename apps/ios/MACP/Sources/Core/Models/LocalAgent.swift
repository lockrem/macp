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
    var customSystemPrompt: String?  // Optional custom system prompt (overrides default)

    // System agent properties
    var isSystemAgent: Bool  // True if this is a server-provided system agent
    var intents: [String]  // What intents this agent handles (for orchestration)
    var memoryCategories: [String]  // Memory categories this agent uses

    // Introduction flow - questions to ask when meeting a new user
    var introductionGreeting: String?  // Custom greeting for introduction flow
    var introductionQuestions: [IntroductionQuestion]  // Questions to gather information

    // Voice settings for text-to-speech
    var voiceId: String  // ElevenLabs voice ID
    var voiceSpeed: Double  // Speech speed (0.75 to 1.25)

    // Sharing settings (uses existing UUID - no separate publish step)
    var isShareable: Bool  // Can others interact via QR/link?
    var allowDirectChat: Bool  // Visitors can chat directly
    var allowAgentToAgent: Bool  // Visitor's agent can talk to this agent
    var allowAccompanied: Bool  // Visitor + their agent together

    // Task queue - tasks looking for opportunities to be completed
    var tasks: [AgentTask]  // Conversation-agnostic tasks

    // Legacy support - computed property for migration
    var memoryURL: URL? { nil }

    // Share URL using the agent's existing UUID
    var shareURL: URL? {
        guard isShareable else { return nil }
        return URL(string: "macp://agent/\(id.uuidString)")
    }

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
        accentColorName: String = "blue",
        isSystemAgent: Bool = false,
        intents: [String] = [],
        memoryCategories: [String] = [],
        introductionGreeting: String? = nil,
        introductionQuestions: [IntroductionQuestion] = [],
        voiceId: String = "21m00Tcm4TlvDq8ikWAM",
        voiceSpeed: Double = 1.0,
        isShareable: Bool = false,
        allowDirectChat: Bool = true,
        allowAgentToAgent: Bool = true,
        allowAccompanied: Bool = true,
        tasks: [AgentTask] = []
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
        self.isSystemAgent = isSystemAgent
        self.intents = intents
        self.memoryCategories = memoryCategories
        self.introductionGreeting = introductionGreeting
        self.introductionQuestions = introductionQuestions
        self.voiceId = voiceId
        self.voiceSpeed = voiceSpeed
        self.isShareable = isShareable
        self.allowDirectChat = allowDirectChat
        self.allowAgentToAgent = allowAgentToAgent
        self.allowAccompanied = allowAccompanied
        self.tasks = tasks
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    // Custom coding to handle legacy single-memory format
    enum CodingKeys: String, CodingKey {
        case id, name, description, provider, memoryStores, isDefault, createdAt, updatedAt
        case emoji, personality, greeting, accentColorName
        case isSystemAgent, intents, memoryCategories
        case introductionGreeting, introductionQuestions
        case voiceId, voiceSpeed
        case isShareable, allowDirectChat, allowAgentToAgent, allowAccompanied
        case tasks
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

        // System agent fields with defaults
        isSystemAgent = (try? container.decode(Bool.self, forKey: .isSystemAgent)) ?? false
        intents = (try? container.decode([String].self, forKey: .intents)) ?? []
        memoryCategories = (try? container.decode([String].self, forKey: .memoryCategories)) ?? []

        // Introduction fields with defaults
        introductionGreeting = try? container.decode(String.self, forKey: .introductionGreeting)
        introductionQuestions = (try? container.decode([IntroductionQuestion].self, forKey: .introductionQuestions)) ?? []

        // Voice settings with defaults
        voiceId = (try? container.decode(String.self, forKey: .voiceId)) ?? "21m00Tcm4TlvDq8ikWAM"
        voiceSpeed = (try? container.decode(Double.self, forKey: .voiceSpeed)) ?? 1.0

        // Sharing settings with defaults
        isShareable = (try? container.decode(Bool.self, forKey: .isShareable)) ?? false
        allowDirectChat = (try? container.decode(Bool.self, forKey: .allowDirectChat)) ?? true
        allowAgentToAgent = (try? container.decode(Bool.self, forKey: .allowAgentToAgent)) ?? true
        allowAccompanied = (try? container.decode(Bool.self, forKey: .allowAccompanied)) ?? true

        // Task queue with defaults
        tasks = (try? container.decode([AgentTask].self, forKey: .tasks)) ?? []
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
        try container.encode(isSystemAgent, forKey: .isSystemAgent)
        try container.encode(intents, forKey: .intents)
        try container.encode(memoryCategories, forKey: .memoryCategories)
        try container.encodeIfPresent(introductionGreeting, forKey: .introductionGreeting)
        try container.encode(introductionQuestions, forKey: .introductionQuestions)
        try container.encode(voiceId, forKey: .voiceId)
        try container.encode(voiceSpeed, forKey: .voiceSpeed)
        try container.encode(isShareable, forKey: .isShareable)
        try container.encode(allowDirectChat, forKey: .allowDirectChat)
        try container.encode(allowAgentToAgent, forKey: .allowAgentToAgent)
        try container.encode(allowAccompanied, forKey: .allowAccompanied)
        try container.encode(tasks, forKey: .tasks)
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

    /// Whether this agent has introduction questions configured
    var hasIntroduction: Bool {
        !introductionQuestions.isEmpty
    }

    /// Tasks that need user confirmation (have assumptions)
    var tasksNeedingConfirmation: [AgentTask] {
        tasks.filter { $0.status == .needsConfirmation }
    }

    /// Pending tasks looking for opportunities
    var pendingTasks: [AgentTask] {
        tasks.filter { $0.status == .pending }
    }

    /// Active tasks currently being worked on
    var activeTasks: [AgentTask] {
        tasks.filter { $0.status == .active }
    }

    /// Completed tasks
    var completedTasks: [AgentTask] {
        tasks.filter { $0.status == .completed }
    }

    /// All actionable tasks (needs confirmation + pending + active)
    var actionableTasks: [AgentTask] {
        tasks.filter { $0.status == .needsConfirmation || $0.status == .pending || $0.status == .active }
    }

    /// Find pending tasks that match a host agent
    func matchingTasks(forHost hostName: String, hostDescription: String) -> [AgentTask] {
        pendingTasks.filter { $0.matchesHost(name: hostName, description: hostDescription) }
    }

    /// System prompt incorporating personality (uses customSystemPrompt if set)
    var systemPrompt: String {
        if let custom = customSystemPrompt, !custom.isEmpty {
            return custom
        }
        return """
        You are \(name), a personal AI assistant. Your personality is \(personality).

        CRITICAL: Keep ALL responses under 50 words. Aim for 20 words when possible. Your responses will be spoken aloud, so be brief and conversational.

        Guidelines:
        - Be conversational and natural
        - Remember details the user shares with you
        - Ask follow-up questions to learn more
        - Be supportive and encouraging
        - Keep responses SHORT - under 50 words max
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
            accentColorName: template.accentColorName,
            introductionGreeting: template.introductionGreeting,
            introductionQuestions: template.introductionQuestions
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
    let introductionGreeting: String?
    let introductionQuestions: [IntroductionQuestion]

    init(
        name: String,
        emoji: String,
        description: String,
        personality: String,
        greeting: String,
        accentColorName: String,
        suggestedCategories: [String],
        introductionGreeting: String? = nil,
        introductionQuestions: [IntroductionQuestion] = []
    ) {
        self.name = name
        self.emoji = emoji
        self.description = description
        self.personality = personality
        self.greeting = greeting
        self.accentColorName = accentColorName
        self.suggestedCategories = suggestedCategories
        self.introductionGreeting = introductionGreeting
        self.introductionQuestions = introductionQuestions
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

// MARK: - Agent Tasks

/// A task assigned to an agent that is looking for an opportunity to be completed
/// Tasks are conversation-agnostic - agents will look for matching opportunities
struct AgentTask: Codable, Identifiable {
    let id: UUID
    var serverId: String?        // Server-generated ID for synced tasks (used for completion tracking)
    var description: String      // "Make reservations for 4 at 5:30 PM"
    var keywords: [String]       // ["restaurant", "reservation", "dining", "food"]
    var category: TaskCategory   // Type of task for matching
    var status: TaskStatus
    var targetPersonName: String?  // Person this task is about (for contact linking)
    var contactId: String?       // Server contact ID if matched
    var createdAt: Date
    var completedAt: Date?
    var summary: String?         // Summary of how task was completed
    var hostAgentName: String?   // Which agent helped complete this task

    enum TaskStatus: String, Codable {
        case needsConfirmation  // Has assumptions that need user confirmation
        case pending            // Looking for opportunity
        case active             // Currently being worked on
        case completed          // Task finished
        case cancelled          // User cancelled
    }

    enum TaskCategory: String, Codable, CaseIterable {
        case restaurant = "restaurant"      // Reservations, dining
        case health = "health"              // Medical, wellness, allergies
        case realEstate = "real_estate"     // Property, housing market
        case finance = "finance"            // Banking, investments
        case travel = "travel"              // Flights, hotels, trips
        case shopping = "shopping"          // Purchases, products
        case research = "research"          // General information gathering
        case appointment = "appointment"    // Scheduling, bookings
        case social = "social"              // Communication, dates, meetups, invitations
        case other = "other"

        var displayName: String {
            switch self {
            case .restaurant: return "Dining"
            case .health: return "Health"
            case .realEstate: return "Real Estate"
            case .finance: return "Finance"
            case .travel: return "Travel"
            case .shopping: return "Shopping"
            case .research: return "Research"
            case .appointment: return "Appointment"
            case .social: return "Social"
            case .other: return "Other"
            }
        }

        var icon: String {
            switch self {
            case .restaurant: return "fork.knife"
            case .health: return "heart.text.square"
            case .realEstate: return "house"
            case .finance: return "dollarsign.circle"
            case .travel: return "airplane"
            case .shopping: return "bag"
            case .research: return "magnifyingglass"
            case .appointment: return "calendar"
            case .social: return "person.2"
            case .other: return "list.bullet"
            }
        }

        /// Keywords that indicate this category
        var matchKeywords: [String] {
            switch self {
            case .restaurant:
                return ["restaurant", "reservation", "dining", "food", "eat", "dinner", "lunch", "breakfast", "table", "menu", "ristorante", "cafe", "bistro"]
            case .health:
                return ["health", "doctor", "medical", "allergy", "symptom", "medication", "wellness", "clinic", "hospital", "therapy", "prescription"]
            case .realEstate:
                return ["real estate", "property", "house", "home", "apartment", "market", "mortgage", "rent", "buy", "sell", "listing", "realtor"]
            case .finance:
                return ["bank", "finance", "money", "investment", "loan", "credit", "account", "budget", "savings"]
            case .travel:
                return ["travel", "flight", "hotel", "trip", "vacation", "booking", "airline", "destination"]
            case .shopping:
                return ["buy", "purchase", "shop", "order", "product", "price", "deal", "store"]
            case .research:
                return ["research", "find out", "learn", "information", "discover", "investigate"]
            case .appointment:
                return ["appointment", "schedule", "book", "meeting", "consultation"]
            case .social:
                return ["date", "meetup", "invite", "invitation", "party", "ask out", "hang out", "get together", "meet up", "social", "friend", "contact"]
            case .other:
                return []
            }
        }
    }

    init(
        id: UUID = UUID(),
        serverId: String? = nil,
        description: String,
        keywords: [String] = [],
        category: TaskCategory = .other,
        status: TaskStatus = .pending,
        targetPersonName: String? = nil,
        contactId: String? = nil
    ) {
        self.id = id
        self.serverId = serverId
        self.description = description
        self.keywords = keywords
        self.category = category
        self.status = status
        self.targetPersonName = targetPersonName
        self.contactId = contactId
        self.createdAt = Date()
        self.completedAt = nil
        self.summary = nil
        self.hostAgentName = nil
    }

    /// Check if this task might match a host agent's domain
    func matchesHost(name: String, description: String) -> Bool {
        let hostText = "\(name) \(description)".lowercased()

        // Check explicit keywords
        if keywords.contains(where: { hostText.contains($0.lowercased()) }) {
            return true
        }

        // Check category keywords
        return category.matchKeywords.contains { keyword in
            hostText.contains(keyword.lowercased())
        }
    }

    /// Mark task as completed with summary
    mutating func complete(summary: String, hostAgentName: String? = nil) {
        self.status = .completed
        self.completedAt = Date()
        self.summary = summary
        self.hostAgentName = hostAgentName
    }

    /// Mark task as active (being worked on)
    mutating func activate() {
        self.status = .active
    }

    /// Cancel the task
    mutating func cancel() {
        self.status = .cancelled
        self.completedAt = Date()
    }

    /// Confirm a task with assumptions (move from needsConfirmation to pending)
    mutating func confirm() {
        if self.status == .needsConfirmation {
            self.status = .pending
        }
    }
}
