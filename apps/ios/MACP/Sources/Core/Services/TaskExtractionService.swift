import Foundation

/// Service for extracting tasks from conversation with an AI agent
/// When users say things like "I need reservations for 4 at 5:30", this extracts it as a queued task
@MainActor
class TaskExtractionService: ObservableObject {
    static let shared = TaskExtractionService()

    private init() {}

    /// Analyzes a message to determine if it contains a task request
    /// Returns extracted task info if found, nil if it's just conversation
    func extractTask(
        from message: String,
        conversationContext: [String] = [],
        memories: [String] = [],
        apiKey: String,
        provider: String = "anthropic"
    ) async -> ExtractedTask? {
        let contextStr = conversationContext.suffix(5).joined(separator: "\n")

        // Build memories section for relationship context
        let memoriesSection = memories.isEmpty ? "" : """

        WHAT YOU KNOW ABOUT THE USER (from past conversations):
        \(memories.map { "- \($0)" }.joined(separator: "\n"))

        Use this information to understand WHO people are:
        - If "Jane" is mentioned and you know "Jane is the user's girlfriend" - include that context
        - If "Matthew" could be multiple people (son vs friend), note the ambiguity
        """

        let prompt = """
        Analyze this user message to determine if they are assigning a TASK that should be queued for later action, or if they are just having a conversation.

        A TASK is something the user wants done that requires:
        - Finding a specific service/agent (restaurant, doctor, realtor, etc.)
        - Making a reservation, appointment, or booking
        - Researching specific information
        - Completing a transaction
        - COMMUNICATING with someone else (asking, telling, inviting, coordinating with another person)
        - Coordinating with another person's AI agent
        - Social planning (dates, meetups, events)
        - Delivering a message or request to someone

        IMPORTANT: If the user asks you to "ask [person]", "tell [person]", "invite [person]",
        "check with [person]", or any communication with another person - THIS IS A TASK.
        These get recorded so the agent can communicate when connected to that person's agent.

        NOT a task (just conversation):
        - Asking YOU (the agent) questions about general topics
        - Chatting about feelings or experiences with YOU
        - Asking for advice without specific external action needed
        - Casual conversation with YOU (not involving third parties)
        \(memoriesSection)

        Recent conversation context:
        \(contextStr.isEmpty ? "(none)" : contextStr)

        User message: "\(message)"

        RELATIONSHIP AWARENESS:
        - If any PERSON is mentioned, check memories to understand who they are
        - Include relationship context in the description (e.g., "Jane (girlfriend)")
        - If a name could refer to multiple people, add a clarification question
        - If a person is mentioned but not in memories, note "relationship unknown"

        IMPORTANT: If this IS a task, ALWAYS fill in ALL details using reasonable assumptions:
        - If no time mentioned: assume "evening" for dinner, "morning" for breakfast, etc.
        - If no date mentioned: assume "today" or "this week" based on context
        - If no quantity mentioned: assume "2 people" for reservations
        - If no location mentioned: assume "nearby" or leave as "not specified"

        Mark any assumed values with "(assumed)" suffix so the user can confirm.

        If this IS a task request, respond with JSON:
        {
          "isTask": true,
          "description": "Clear description including relationship context",
          "category": "restaurant|health|real_estate|finance|travel|shopping|research|appointment|social|other",
          "keywords": ["relevant", "keywords", "for", "matching", "include person names"],
          "peopleMentioned": [{"name": "Jane", "relationship": "girlfriend"}, {"name": "Matthew", "relationship": "ambiguous - could be son or friend"}],
          "clarificationNeeded": "Which Matthew - your son or your friend?",
          "details": {
            "time": "time value or reasonable assumption with (assumed)",
            "date": "date value or reasonable assumption with (assumed)",
            "quantity": "quantity value or reasonable assumption with (assumed)",
            "location": "location value or 'nearby (assumed)'"
          },
          "assumptions": ["list of assumptions made for user confirmation"]
        }

        If this is NOT a task (just conversation), respond with:
        {
          "isTask": false
        }

        Respond with JSON only.
        """

        do {
            let response = try await callLLM(prompt: prompt, apiKey: apiKey, provider: provider)
            return parseTaskResponse(response)
        } catch {
            print("[TaskExtraction] Error: \(error)")
            return nil
        }
    }

    /// Creates an AgentTask from extracted task info
    func createAgentTask(from extracted: ExtractedTask, serverId: String? = nil, contactId: String? = nil) -> AgentTask {
        // Include assumptions in description if any were made
        var fullDescription = extracted.description
        if let assumptionsSummary = extracted.assumptionsSummary {
            fullDescription += "\n\n⚠️ \(assumptionsSummary)"
        }

        // Get first person mentioned for contact linking
        let targetPersonName = extracted.peopleMentioned.first?.name

        return AgentTask(
            serverId: serverId,
            description: fullDescription,
            keywords: extracted.keywords,
            category: extracted.category,
            status: .pending,  // Always create as pending - skip confirmation
            targetPersonName: targetPersonName,
            contactId: contactId
        )
    }

    // MARK: - Private

    private func callLLM(prompt: String, apiKey: String, provider: String) async throws -> String {
        // Call the LLM provider directly
        switch provider {
        case "anthropic":
            return try await callAnthropic(prompt: prompt, apiKey: apiKey)
        case "openai":
            return try await callOpenAI(prompt: prompt, apiKey: apiKey)
        default:
            // Default to Anthropic
            return try await callAnthropic(prompt: prompt, apiKey: apiKey)
        }
    }

    private func callAnthropic(prompt: String, apiKey: String) async throws -> String {
        guard let url = URL(string: "https://api.anthropic.com/v1/messages") else {
            throw TaskExtractionError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        let body: [String: Any] = [
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 300,
            "temperature": 0.1,
            "system": "You analyze user messages and extract task requests. Respond only with valid JSON.",
            "messages": [
                ["role": "user", "content": prompt]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await URLSession.shared.data(for: request)

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = json["content"] as? [[String: Any]],
              let firstContent = content.first,
              let text = firstContent["text"] as? String else {
            print("[TaskExtraction] Invalid Anthropic response: \(String(data: data, encoding: .utf8) ?? "nil")")
            throw TaskExtractionError.invalidResponse
        }

        return text
    }

    private func callOpenAI(prompt: String, apiKey: String) async throws -> String {
        guard let url = URL(string: "https://api.openai.com/v1/chat/completions") else {
            throw TaskExtractionError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "model": "gpt-4o",
            "max_tokens": 300,
            "temperature": 0.1,
            "messages": [
                ["role": "system", "content": "You analyze user messages and extract task requests. Respond only with valid JSON."],
                ["role": "user", "content": prompt]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await URLSession.shared.data(for: request)

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let firstChoice = choices.first,
              let message = firstChoice["message"] as? [String: Any],
              let content = message["content"] as? String else {
            print("[TaskExtraction] Invalid OpenAI response: \(String(data: data, encoding: .utf8) ?? "nil")")
            throw TaskExtractionError.invalidResponse
        }

        return content
    }

    private func parseTaskResponse(_ response: String) -> ExtractedTask? {
        // Extract JSON from response
        guard let jsonStart = response.firstIndex(of: "{"),
              let jsonEnd = response.lastIndex(of: "}") else {
            return nil
        }

        let jsonString = String(response[jsonStart...jsonEnd])
        guard let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        guard let isTask = json["isTask"] as? Bool, isTask else {
            return nil
        }

        let description = json["description"] as? String ?? ""
        let categoryStr = json["category"] as? String ?? "other"
        let keywords = json["keywords"] as? [String] ?? []
        let details = json["details"] as? [String: String] ?? [:]
        let assumptions = json["assumptions"] as? [String] ?? []
        let clarificationNeeded = json["clarificationNeeded"] as? String

        // Parse people mentioned
        var peopleMentioned: [PersonMentioned] = []
        if let peopleArray = json["peopleMentioned"] as? [[String: String]] {
            peopleMentioned = peopleArray.compactMap { dict in
                guard let name = dict["name"] else { return nil }
                return PersonMentioned(name: name, relationship: dict["relationship"])
            }
        }

        let category = AgentTask.TaskCategory(rawValue: categoryStr) ?? .other

        return ExtractedTask(
            description: description,
            category: category,
            keywords: keywords,
            details: details,
            assumptions: assumptions,
            peopleMentioned: peopleMentioned,
            clarificationNeeded: clarificationNeeded
        )
    }
}

/// A person mentioned in a task with their relationship to the user
struct PersonMentioned {
    let name: String
    let relationship: String?
}

/// Extracted task information before creating an AgentTask
struct ExtractedTask {
    let description: String
    let category: AgentTask.TaskCategory
    let keywords: [String]
    let details: [String: String]
    let assumptions: [String]
    let peopleMentioned: [PersonMentioned]
    let clarificationNeeded: String?

    /// Returns true if any assumptions were made that need user confirmation
    var hasAssumptions: Bool { !assumptions.isEmpty }

    /// Returns true if clarification is needed about a person
    var needsClarification: Bool { clarificationNeeded != nil && !clarificationNeeded!.isEmpty }

    /// Human-readable summary of assumptions made
    var assumptionsSummary: String? {
        guard hasAssumptions else { return nil }
        return "Assumed: " + assumptions.joined(separator: ", ")
    }
}

enum TaskExtractionError: Error {
    case invalidURL
    case invalidResponse
}
