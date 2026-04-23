import Foundation

/// Unified chat service that enforces consistent behavior across all chat views
/// - 20-word response limit
/// - Task detection and brief acknowledgment
/// - Memory-aware responses
/// - Proactive information sharing
@MainActor
class ChatService: ObservableObject {
    static let shared = ChatService()

    // MARK: - Response Types

    enum ResponseType {
        case normal(String)                    // Regular conversation
        case taskDetected(TaskResponse)        // Task was detected, offer options
        case relationshipQuery(RelationshipQueryResponse)  // Need to clarify who someone is
        case personMentioned(PersonMentionedResponse)      // Person mentioned, offer options
        case error(String)
    }

    struct RelationshipQueryResponse {
        let personName: String
        let question: String                   // "Who is Jane to you?"
    }

    struct PersonMentionedResponse {
        let personName: String
        let relationship: String?              // Known relationship if any
        let acknowledgment: String             // "This involves Jane (your girlfriend)."
        let options: [PersonActionOption]      // What to do about it
    }

    struct PersonActionOption: Identifiable {
        let id = UUID()
        let label: String
        let action: PersonAction
    }

    enum PersonAction {
        case createTaskForAgent                // Record task to discuss with their agent
        case discussNow                        // Talk through it now with me
        case dismiss                           // Never mind
    }

    struct TaskResponse {
        let acknowledgment: String             // Brief acknowledgment
        let task: AgentTask                    // The created task
        let options: [TaskOption]              // Options to present to user
    }

    struct TaskOption: Identifiable {
        let id = UUID()
        let label: String
        let action: TaskAction
    }

    enum TaskAction {
        case recordForLater                    // Save task for orchestrated conversations
        case brainstormNow                     // Help user think through it now
        case dismiss                           // User doesn't want to track this
    }

    // MARK: - Configuration

    /// Maximum words for any agent response
    static let maxResponseWords = 20

    /// System prompt suffix enforcing brevity
    static let brevityRule = """

    ═══════════════════════════════════════════════════
    ABSOLUTE RULE: RESPOND IN 20 WORDS OR LESS.
    Count your words. If over 20, rewrite shorter. NO EXCEPTIONS.
    ═══════════════════════════════════════════════════
    """

    private init() {}

    // MARK: - Main Entry Point

    /// Process a user message and generate an appropriate response
    /// This is the ONLY way chat responses should be generated
    func processMessage(
        _ message: String,
        agent: LocalAgent,
        conversationHistory: [ChatServiceMessage],
        apiKey: String,
        provider: String
    ) async -> ResponseType {

        // Gather memories for relationship context
        let memories = agent.memoryStores.flatMap { $0.entries }.map { $0.content }

        // Step 1: Check if people are mentioned and handle relationship awareness
        if let personResponse = await analyzeForPeopleMentioned(
            message: message,
            memories: memories,
            apiKey: apiKey,
            provider: provider
        ) {
            // If we don't know who this person is, ask first
            if personResponse.needsRelationshipClarification {
                return .relationshipQuery(RelationshipQueryResponse(
                    personName: personResponse.personName,
                    question: "Who is \(personResponse.personName) to you? This helps me understand how to help."
                ))
            }

            // If the message involves a person and could benefit from agent-to-agent communication
            if personResponse.couldInvolveTheirAgent {
                return .personMentioned(PersonMentionedResponse(
                    personName: personResponse.personName,
                    relationship: personResponse.relationship,
                    acknowledgment: personResponse.acknowledgment,
                    options: [
                        PersonActionOption(label: "Create task for \(personResponse.personName)'s agent", action: .createTaskForAgent),
                        PersonActionOption(label: "Talk through it with me now", action: .discussNow),
                        PersonActionOption(label: "Never mind", action: .dismiss)
                    ]
                ))
            }
        }

        // Step 2: Check if this is a task request (without person involved)
        if let taskResponse = await detectAndAcknowledgeTask(
            message: message,
            agent: agent,
            conversationHistory: conversationHistory,
            apiKey: apiKey,
            provider: provider
        ) {
            return .taskDetected(taskResponse)
        }

        // Step 3: Generate normal response with enforced brevity
        do {
            let response = try await generateResponse(
                to: message,
                agent: agent,
                conversationHistory: conversationHistory,
                apiKey: apiKey,
                provider: provider
            )
            return .normal(response)
        } catch {
            return .error("Sorry, I couldn't process that. Please try again.")
        }
    }

    // MARK: - Person/Relationship Analysis

    struct PersonAnalysisResult {
        let personName: String
        let relationship: String?
        let needsRelationshipClarification: Bool
        let couldInvolveTheirAgent: Bool
        let acknowledgment: String
    }

    /// Analyzes a message for people mentioned and checks memory for relationships
    private func analyzeForPeopleMentioned(
        message: String,
        memories: [String],
        apiKey: String,
        provider: String
    ) async -> PersonAnalysisResult? {

        let memoriesContext = memories.isEmpty ? "No memories stored yet." :
            memories.map { "- \($0)" }.joined(separator: "\n")

        let prompt = """
        Analyze this message to see if it mentions or involves another PERSON (not the AI assistant).

        User's memories:
        \(memoriesContext)

        User message: "\(message)"

        IMPORTANT DISTINCTIONS:
        1. Is the user SHARING/PROVIDING relationship info? (e.g., "Jane is my girlfriend", "My mom's name is Sarah")
           → If YES: personMentioned=true BUT relationshipUnknown=false and couldInvolveTheirAgent=false
           → The user is telling us who someone is - we should accept this info, not ask again!

        2. Is the user ASKING about or wanting to interact with someone? (e.g., "Why is Jane mad at me?")
           → If the person is NOT in memories: relationshipUnknown=true (we should ask who they are)
           → If the person IS in memories: couldInvolveTheirAgent=true if their agent could help

        Examples:
        - "Jane is my girlfriend" → personMentioned=true, relationshipUnknown=FALSE (user just told us!)
        - "My sister Sarah works at Google" → personMentioned=true, relationshipUnknown=FALSE (info sharing)
        - "Why is Jane mad at me?" (Jane not in memory) → relationshipUnknown=TRUE (need to ask)
        - "Help me plan a surprise for Matthew" (Matthew is partner in memory) → couldInvolveTheirAgent=true
        - "What's the weather?" → personMentioned=false

        Respond with JSON:
        {
          "personMentioned": true/false,
          "personName": "Jane" or null,
          "relationshipFromMemory": "girlfriend" or null if not in memory,
          "relationshipProvidedInMessage": "girlfriend" or null if user is sharing the relationship,
          "relationshipUnknown": true ONLY if person mentioned AND NOT in memories AND user is ASKING about them (not sharing info),
          "couldInvolveTheirAgent": true if talking to their agent might help (never true for info-sharing),
          "acknowledgment": "This involves Jane, your girlfriend." or similar
        }

        JSON only:
        """

        do {
            let response = try await callLLM(
                systemPrompt: "You analyze messages for people mentioned. Return only valid JSON.",
                userMessage: prompt,
                apiKey: apiKey,
                provider: provider,
                maxTokens: 200
            )

            // Parse response
            guard let jsonStart = response.firstIndex(of: "{"),
                  let jsonEnd = response.lastIndex(of: "}") else {
                return nil
            }

            let jsonString = String(response[jsonStart...jsonEnd])
            guard let data = jsonString.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return nil
            }

            guard let personMentioned = json["personMentioned"] as? Bool, personMentioned,
                  let personName = json["personName"] as? String else {
                return nil
            }

            let relationshipFromMemory = json["relationshipFromMemory"] as? String
            let relationshipProvided = json["relationshipProvidedInMessage"] as? String
            let relationship = relationshipFromMemory ?? relationshipProvided
            let relationshipUnknown = json["relationshipUnknown"] as? Bool ?? false
            let couldInvolveAgent = json["couldInvolveTheirAgent"] as? Bool ?? false
            let acknowledgment = json["acknowledgment"] as? String ?? "This involves \(personName)."

            // If user provided relationship info in this message, don't ask for clarification
            // and don't suggest agent communication - just let it flow through for contact extraction
            let needsClarification = relationshipUnknown && relationshipProvided == nil

            return PersonAnalysisResult(
                personName: personName,
                relationship: relationship,
                needsRelationshipClarification: needsClarification,
                couldInvolveTheirAgent: couldInvolveAgent && relationshipProvided == nil,
                acknowledgment: acknowledgment
            )
        } catch {
            return nil
        }
    }

    // MARK: - Task Detection

    /// Detects if a message is a task request and returns a brief acknowledgment with options
    private func detectAndAcknowledgeTask(
        message: String,
        agent: LocalAgent,
        conversationHistory: [ChatServiceMessage],
        apiKey: String,
        provider: String
    ) async -> TaskResponse? {

        // Check for potential task indicators - be BROAD to catch all possible tasks
        // Better to check with LLM and get "not a task" than to miss real tasks
        let taskIndicators = [
            // Action requests
            "help me", "find out", "remind me", "i need", "can you", "could you",
            "would you", "please", "i want", "i'd like", "i would like",

            // Scheduling/booking
            "make a reservation", "book", "schedule", "appointment", "reserve",

            // Research/investigation
            "research", "figure out", "look into", "check if", "check on",
            "find", "search", "look for", "investigate", "explore",

            // Communication/social tasks - KEY ADDITION
            "ask", "tell", "contact", "reach out", "message", "send",
            "call", "email", "text", "inform", "notify", "invite",
            "let them know", "let her know", "let him know",
            "check with", "talk to", "speak to", "get in touch",

            // Planning/coordination
            "plan", "organize", "arrange", "coordinate", "set up",

            // Purchases/transactions
            "buy", "order", "purchase", "get me", "pick up"
        ]

        let lowerMessage = message.lowercased()
        let mightBeTask = taskIndicators.contains { lowerMessage.contains($0) }

        guard mightBeTask else { return nil }

        // Use LLM to confirm and extract task details
        let context = conversationHistory.suffix(5).map { $0.content }

        // Gather memories for relationship context
        let memories = agent.memoryStores.flatMap { $0.entries }.map { $0.content }

        guard let extracted = await TaskExtractionService.shared.extractTask(
            from: message,
            conversationContext: context,
            memories: memories,
            apiKey: apiKey,
            provider: provider
        ) else {
            return nil
        }

        // Get first person mentioned for contact linking
        let targetPersonName = extracted.peopleMentioned.first?.name

        // Sync task to server first to get server ID and contact matching
        var serverId: String? = nil
        var contactId: String? = nil

        if AuthService.shared.isAuthenticated {
            do {
                let serverTask = try await TaskService.shared.createTask(
                    title: extracted.description,
                    description: nil,
                    priority: .medium,
                    targetPersonName: targetPersonName,
                    source: .chatDetected
                )
                serverId = serverTask.id
                contactId = serverTask.contactId
                print("[ChatService] Synced task to server: \(serverId ?? "nil"), contactId: \(contactId ?? "none")")
            } catch {
                print("[ChatService] Failed to sync task to server: \(error)")
                // Continue with local-only task
            }
        }

        // Create the task with server ID if available
        let task = TaskExtractionService.shared.createAgentTask(
            from: extracted,
            serverId: serverId,
            contactId: contactId
        )

        // Generate acknowledgment - include clarification if needed
        var acknowledgment = generateTaskAcknowledgment(for: task, agent: agent)
        if extracted.needsClarification, let clarification = extracted.clarificationNeeded {
            acknowledgment = clarification
        } else if !extracted.peopleMentioned.isEmpty {
            // Include relationship context in acknowledgment
            let peopleContext = extracted.peopleMentioned.compactMap { person -> String? in
                if let relationship = person.relationship, !relationship.isEmpty, relationship != "unknown" {
                    return "\(person.name) (\(relationship))"
                }
                return nil
            }.joined(separator: ", ")
            if !peopleContext.isEmpty {
                acknowledgment = "Got it - this involves \(peopleContext). " + acknowledgment
            }
        }

        // Create options based on task type
        let options = generateTaskOptions(for: task)

        return TaskResponse(
            acknowledgment: acknowledgment,
            task: task,
            options: options
        )
    }

    /// Generate a brief acknowledgment for a detected task (under 20 words)
    private func generateTaskAcknowledgment(for task: AgentTask, agent: LocalAgent) -> String {
        // Keep these SHORT - under 20 words
        switch task.category {
        case .restaurant:
            return "Got it - dining plans. Save for when we visit restaurants, or brainstorm now?"
        case .health:
            return "Health-related task noted. Save for a medical visit, or discuss now?"
        case .realEstate:
            return "Property search noted. Record for agents, or explore options now?"
        case .finance:
            return "Financial task noted. Save for relevant discussions, or work through it now?"
        case .travel:
            return "Travel planning noted. Record for booking, or brainstorm now?"
        case .shopping:
            return "Shopping task noted. Save for stores/agents, or explore options now?"
        case .research:
            return "Research task noted. Should I record this or help you brainstorm now?"
        case .appointment:
            return "Appointment task noted. Save for scheduling, or discuss timing now?"
        case .social:
            return "Got it - I'll ask when I connect with their agent. Record this task?"
        case .other:
            return "Task noted. Should I record this for later, or help you think through it now?"
        }
    }

    /// Generate options for a task
    private func generateTaskOptions(for task: AgentTask) -> [TaskOption] {
        return [
            TaskOption(
                label: "Record for later",
                action: .recordForLater
            ),
            TaskOption(
                label: "Brainstorm now",
                action: .brainstormNow
            ),
            TaskOption(
                label: "Never mind",
                action: .dismiss
            )
        ]
    }

    // MARK: - Response Generation

    /// Generate a response with enforced 20-word limit
    private func generateResponse(
        to message: String,
        agent: LocalAgent,
        conversationHistory: [ChatServiceMessage],
        apiKey: String,
        provider: String
    ) async throws -> String {

        // Build conversation context
        let historyText = conversationHistory.suffix(10).map { msg in
            let role = msg.isFromUser ? "User" : agent.name
            return "\(role): \(msg.content)"
        }.joined(separator: "\n")

        // Build memory context
        let memories = agent.memoryStores.flatMap { $0.entries }.suffix(10)
        let memoryContext = memories.isEmpty ? "" : """

        Things you know about the user:
        \(memories.map { "- \($0.content)" }.joined(separator: "\n"))
        """

        // System prompt with enforced brevity
        let systemPrompt = """
        You are \(agent.name), a personal AI assistant.
        Personality: \(agent.personality)
        \(memoryContext)
        \(Self.brevityRule)

        Be conversational, warm, and BRIEF. Ask follow-up questions to learn more.
        """

        let response = try await callLLM(
            systemPrompt: systemPrompt,
            userMessage: """
            Conversation:
            \(historyText)

            User: \(message)

            Respond in 20 words or less.
            """,
            apiKey: apiKey,
            provider: provider,
            maxTokens: 80  // Enforce brevity at token level too
        )

        return response
    }

    // MARK: - LLM Calls

    private func callLLM(
        systemPrompt: String,
        userMessage: String,
        apiKey: String,
        provider: String,
        maxTokens: Int = 80
    ) async throws -> String {
        switch provider {
        case "anthropic":
            return try await callAnthropic(
                systemPrompt: systemPrompt,
                userMessage: userMessage,
                apiKey: apiKey,
                maxTokens: maxTokens
            )
        case "openai":
            return try await callOpenAI(
                systemPrompt: systemPrompt,
                userMessage: userMessage,
                apiKey: apiKey,
                maxTokens: maxTokens
            )
        default:
            return try await callAnthropic(
                systemPrompt: systemPrompt,
                userMessage: userMessage,
                apiKey: apiKey,
                maxTokens: maxTokens
            )
        }
    }

    private func callAnthropic(
        systemPrompt: String,
        userMessage: String,
        apiKey: String,
        maxTokens: Int
    ) async throws -> String {
        guard let url = URL(string: "https://api.anthropic.com/v1/messages") else {
            throw ChatServiceError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        let body: [String: Any] = [
            "model": "claude-sonnet-4-20250514",
            "max_tokens": maxTokens,
            "temperature": 0.7,
            "system": systemPrompt,
            "messages": [
                ["role": "user", "content": userMessage]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await URLSession.shared.data(for: request)

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = json["content"] as? [[String: Any]],
              let firstContent = content.first,
              let text = firstContent["text"] as? String else {
            throw ChatServiceError.invalidResponse
        }

        return text
    }

    private func callOpenAI(
        systemPrompt: String,
        userMessage: String,
        apiKey: String,
        maxTokens: Int
    ) async throws -> String {
        guard let url = URL(string: "https://api.openai.com/v1/chat/completions") else {
            throw ChatServiceError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "model": "gpt-4o",
            "max_tokens": maxTokens,
            "temperature": 0.7,
            "messages": [
                ["role": "system", "content": systemPrompt],
                ["role": "user", "content": userMessage]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await URLSession.shared.data(for: request)

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let firstChoice = choices.first,
              let message = firstChoice["message"] as? [String: Any],
              let content = message["content"] as? String else {
            throw ChatServiceError.invalidResponse
        }

        return content
    }
}

// MARK: - Errors

enum ChatServiceError: Error {
    case invalidURL
    case invalidResponse
    case noApiKey
}

// Note: ChatServiceMessage protocol is defined in ChatModels.swift
