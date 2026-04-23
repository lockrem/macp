import Foundation
import SwiftUI

@MainActor
class PublicAgentService: ObservableObject {
    static let shared = PublicAgentService()

    @Published var isLoading = false
    @Published var error: String?

    // Cache for visited public agents
    @Published var cachedPublicAgent: PublishedAgent?
    @Published var cachedAgentId: String?

    // My published agents
    @Published var myPublishedAgents: [MyPublishedAgentInfo] = []

    private let apiClient = APIClient.shared

    private init() {}

    // MARK: - Visitor ID

    /// Gets or creates a persistent anonymous visitor ID
    var visitorId: String {
        if let id = UserDefaults.standard.string(forKey: "macp_visitor_id") {
            return id
        }
        let id = UUID().uuidString
        UserDefaults.standard.set(id, forKey: "macp_visitor_id")
        return id
    }

    // MARK: - Public Agent Fetching (No Auth Required)

    /// Fetches a public agent by agentId
    func fetchPublicAgent(agentId: String) async throws -> PublishedAgent {
        isLoading = true
        error = nil

        defer { isLoading = false }

        do {
            let agent: PublishedAgent = try await publicGet("/public/agent/\(agentId)")
            cachedPublicAgent = agent
            cachedAgentId = agentId
            return agent
        } catch {
            self.error = error.localizedDescription
            throw error
        }
    }

    // MARK: - Session Management (No Auth Required for Public)

    /// Creates a new session with a public agent
    func createSession(
        agentId: String,
        mode: PublicAgentInteractionMode,
        visitorAgent: LocalAgent? = nil
    ) async throws -> PublicAgentSession {
        let request = CreatePublicSessionRequest(
            mode: mode,
            visitorId: visitorId,
            visitorUserId: AuthService.shared.currentUser?.id,
            visitorAgentId: visitorAgent?.id.uuidString,
            visitorAgentName: visitorAgent?.name
        )

        return try await publicPost("/public/agent/\(agentId)/session", body: request)
    }

    /// Sends a message in a public session
    func sendMessage(
        agentId: String,
        sessionId: String,
        content: String,
        role: String = "user",
        apiKey: String,
        provider: String = "anthropic"
    ) async throws -> PublicMessageResponse {
        let request = SendPublicMessageRequest(
            sessionId: sessionId,
            content: content,
            role: role,
            apiKey: apiKey,
            provider: provider
        )

        return try await publicPost("/public/agent/\(agentId)/message", body: request)
    }

    /// Completes a public session and extracts data
    func completeSession(
        agentId: String,
        sessionId: String,
        apiKey: String,
        provider: String = "anthropic"
    ) async throws -> SessionCompletionResponse {
        let request = CompletePublicSessionRequest(
            sessionId: sessionId,
            apiKey: apiKey,
            provider: provider
        )

        return try await publicPost("/public/agent/\(agentId)/complete", body: request)
    }

    // MARK: - Publishing (Auth Required)

    /// Publishes an agent
    func publishAgent(
        agent: LocalAgent,
        allowDirectChat: Bool = true,
        allowAgentToAgent: Bool = true,
        allowAccompaniedChat: Bool = true,
        introductionGreeting: String? = nil,
        introductionQuestions: [PublicIntroductionQuestion]? = nil
    ) async throws -> PublishAgentResponse {
        let config = PublishAgentConfig(
            agentId: agent.id.uuidString,
            name: agent.name,
            emoji: agent.emoji,
            description: agent.description,
            personality: agent.personality,
            greeting: agent.greeting,
            accentColor: agent.accentColorName,
            allowDirectChat: allowDirectChat,
            allowAgentToAgent: allowAgentToAgent,
            allowAccompaniedChat: allowAccompaniedChat,
            introductionGreeting: introductionGreeting,
            introductionQuestions: introductionQuestions
        )

        let response: PublishAgentResponse = try await apiClient.post(
            "/api/agents/\(agent.id.uuidString)/publish",
            body: config
        )

        // Refresh my published agents list
        try? await fetchMyPublishedAgents()

        return response
    }

    /// Updates published agent settings
    func updatePublishedAgent(
        agentId: String,
        allowDirectChat: Bool? = nil,
        allowAgentToAgent: Bool? = nil,
        allowAccompaniedChat: Bool? = nil,
        isActive: Bool? = nil
    ) async throws {
        struct UpdateRequest: Codable {
            let allowDirectChat: Bool?
            let allowAgentToAgent: Bool?
            let allowAccompaniedChat: Bool?
            let isActive: Bool?
        }

        let request = UpdateRequest(
            allowDirectChat: allowDirectChat,
            allowAgentToAgent: allowAgentToAgent,
            allowAccompaniedChat: allowAccompaniedChat,
            isActive: isActive
        )

        let _: PublishStatusResponse = try await apiClient.put(
            "/api/agents/\(agentId)/publish",
            body: request
        )

        // Refresh my published agents list
        try? await fetchMyPublishedAgents()
    }

    /// Unpublishes an agent
    func unpublishAgent(agentId: String) async throws {
        try await apiClient.delete("/api/agents/\(agentId)/publish")

        // Refresh my published agents list
        try? await fetchMyPublishedAgents()
    }

    /// Gets publish status for an agent
    func getPublishStatus(agentId: String) async throws -> PublishStatusResponse {
        return try await apiClient.get("/api/agents/\(agentId)/publish")
    }

    /// Fetches all of the user's published agents
    func fetchMyPublishedAgents() async throws {
        let response: MyPublishedAgentsResponse = try await apiClient.get("/api/agents/published")
        myPublishedAgents = response.agents
    }

    // MARK: - Helper Methods

    /// Checks if an agent is published
    func isAgentPublished(_ agentId: String) -> Bool {
        myPublishedAgents.contains { $0.agentId == agentId }
    }

    /// Gets the published info for an agent
    func getPublishedInfo(for agentId: String) -> MyPublishedAgentInfo? {
        myPublishedAgents.first { $0.agentId == agentId }
    }

    /// Generates the public URL for an agentId
    func getPublicURL(agentId: String) -> String {
        "https://macp.io/\(agentId)"
    }

    // MARK: - Public API Requests (No Auth)

    /// Performs a GET request without authentication
    private func publicGet<T: Decodable>(_ path: String) async throws -> T {
        let url = URL(string: "\(apiClient.baseURL)\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = "GET"

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateResponse(response)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(T.self, from: data)
    }

    /// Performs a POST request without authentication
    private func publicPost<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        let url = URL(string: "\(apiClient.baseURL)\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        request.httpBody = try encoder.encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        try validateResponse(response)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(T.self, from: data)
    }

    private func validateResponse(_ response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw PublicAgentError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200...299:
            return
        case 404:
            throw PublicAgentError.notFound
        case 400:
            throw PublicAgentError.badRequest
        case 500...599:
            throw PublicAgentError.serverError
        default:
            throw PublicAgentError.unknown(httpResponse.statusCode)
        }
    }

    // MARK: - Autonomous Conversation (WebSocket)

    /// Active WebSocket connection for autonomous conversations
    private var webSocketTask: URLSessionWebSocketTask?
    private var onEventHandler: ((AutonomousSessionEvent) -> Void)?

    /// Starts an autonomous agent-to-agent conversation via WebSocket
    func startAutonomousSession(
        hostAgentId: String,
        visitorAgent: LocalAgent,
        visitorQuestions: [String] = [],
        visitorContext: String? = nil,
        apiKey: String,
        provider: String = "anthropic",
        maxTurns: Int = 10,
        onEvent: @escaping (AutonomousSessionEvent) -> Void
    ) async throws {
        // Store the event handler
        self.onEventHandler = onEvent

        // Connect to WebSocket
        guard let url = URL(string: apiClient.autonomousWSURL) else {
            throw PublicAgentError.invalidResponse
        }

        let session = URLSession(configuration: .default)
        webSocketTask = session.webSocketTask(with: url)
        webSocketTask?.resume()

        // Start receiving messages
        Task {
            await receiveWebSocketMessages()
        }

        // Wait a moment for connection to establish
        try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds

        // Send start message
        let startPayload = StartAutonomousPayload(
            hostAgentId: hostAgentId,
            visitorAgentId: visitorAgent.id.uuidString,
            visitorAgentName: visitorAgent.name,
            visitorAgentEmoji: visitorAgent.emoji,
            visitorAgentPersonality: visitorAgent.personality,
            visitorAgentQuestions: visitorQuestions,
            visitorApiKey: apiKey,
            visitorProvider: provider,
            visitorContext: visitorContext,
            maxTurns: maxTurns
        )

        let message = WebSocketOutgoingMessage(action: "startAutonomous", payload: startPayload)
        let encoder = JSONEncoder()
        let data = try encoder.encode(message)
        let messageString = String(data: data, encoding: .utf8)!

        try await webSocketTask?.send(.string(messageString))
    }

    /// Sends an interjection message into the conversation
    func sendInterjection(_ message: String) async throws {
        guard let task = webSocketTask else {
            throw PublicAgentError.invalidResponse
        }

        let payload = InterjectPayload(message: message)
        let outgoing = WebSocketOutgoingMessage(action: "interject", payload: payload)
        let encoder = JSONEncoder()
        let data = try encoder.encode(outgoing)
        let messageString = String(data: data, encoding: .utf8)!

        try await task.send(.string(messageString))
    }

    /// Stops the autonomous conversation
    func stopAutonomousSession() async throws {
        guard let task = webSocketTask else { return }

        let outgoing = WebSocketOutgoingMessage<EmptyPayload>(action: "stop", payload: nil)
        let encoder = JSONEncoder()
        let data = try encoder.encode(outgoing)
        let messageString = String(data: data, encoding: .utf8)!

        try await task.send(.string(messageString))
    }

    /// Disconnects the WebSocket
    func disconnectWebSocket() {
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        onEventHandler = nil
    }

    /// Receives and processes WebSocket messages
    private func receiveWebSocketMessages() async {
        guard let task = webSocketTask else { return }

        do {
            while task.state == .running {
                let message = try await task.receive()

                switch message {
                case .string(let text):
                    if let event = parseWebSocketMessage(text) {
                        await MainActor.run {
                            self.onEventHandler?(event)
                        }

                        // Auto-disconnect on complete or error
                        if case .complete = event {
                            disconnectWebSocket()
                            return
                        } else if case .error = event {
                            disconnectWebSocket()
                            return
                        }
                    }
                case .data:
                    break // We don't expect binary data
                @unknown default:
                    break
                }
            }
        } catch {
            print("[PublicAgentService] WebSocket receive error: \(error)")
            await MainActor.run {
                self.onEventHandler?(.error(error.localizedDescription))
            }
            disconnectWebSocket()
        }
    }

    /// Parses a WebSocket message into a typed event
    private func parseWebSocketMessage(_ text: String) -> AutonomousSessionEvent? {
        guard let data = text.data(using: .utf8) else { return nil }
        let decoder = JSONDecoder()

        // First decode to get the type
        guard let envelope = try? decoder.decode(WebSocketMessageEnvelope.self, from: data) else {
            return nil
        }

        switch envelope.type {
        case "started":
            if let info = try? decoder.decode(WebSocketStartedMessage.self, from: data) {
                return .started(AutonomousSessionStarted(
                    hostAgent: info.hostAgent,
                    visitorAgent: info.visitorAgent
                ))
            }
        case "turn":
            if let msg = try? decoder.decode(WebSocketTurnMessage.self, from: data) {
                return .turn(msg.turn)
            }
        case "thinking":
            if let msg = try? decoder.decode(WebSocketThinkingMessage.self, from: data) {
                return .thinking(msg.agent)
            }
        case "summarizing":
            return .summarizing
        case "complete":
            if let msg = try? decoder.decode(WebSocketCompleteMessage.self, from: data) {
                return .complete(AutonomousSessionComplete(
                    summary: msg.summary,
                    factsLearned: msg.factsLearned,
                    questionsAnswered: msg.questionsAnswered,
                    totalTurns: msg.totalTurns
                ))
            }
        case "stopped":
            return .stopped
        case "error":
            if let msg = try? decoder.decode(WebSocketErrorMessage.self, from: data) {
                return .error(msg.message)
            }
        default:
            break
        }
        return nil
    }

    /// Checks if autonomous mode is available for an agent
    func checkAutonomousAvailable(agentId: String) async throws -> AutonomousAvailability {
        return try await publicGet("/public/agent/\(agentId)/autonomous-available")
    }

    // MARK: - Orchestrated Conversation (WebSocket)

    /// Handler for orchestrated events
    private var onOrchestratedEventHandler: ((OrchestratedSessionEvent) -> Void)?

    /// Starts an orchestrated conversation where host greets and user's agents bid to participate
    func startOrchestratedSession(
        hostAgentId: String,
        userAgents: [LocalAgent],
        apiKey: String,
        provider: String = "anthropic",
        visitorId: String? = nil,  // Device ID for visitor memory tracking
        visitorUserId: String? = nil,  // Authenticated user ID for persistent memory storage
        onEvent: @escaping (OrchestratedSessionEvent) -> Void
    ) async throws {
        // Store the event handler
        self.onOrchestratedEventHandler = onEvent

        // Connect to WebSocket
        guard let url = URL(string: apiClient.autonomousWSURL) else {
            throw PublicAgentError.invalidResponse
        }

        let session = URLSession(configuration: .default)
        webSocketTask = session.webSocketTask(with: url)
        webSocketTask?.resume()

        // Start receiving messages
        Task {
            await receiveOrchestratedMessages()
        }

        // Wait a moment for connection to establish
        try await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds

        // Send start orchestrated message
        let agentPayloads = userAgents.map { agent in
            // Extract recent memories from the agent's memory stores
            let recentMemories = extractRecentMemories(from: agent, limit: 10)

            // Extract pending tasks that are looking for opportunities
            let pendingTasks = agent.pendingTasks.map { OrchestratedTaskPayload(from: $0) }

            return OrchestratedAgentPayload(
                id: agent.id.uuidString,
                name: agent.name,
                emoji: agent.emoji,
                personality: agent.personality,
                description: agent.description,
                intents: inferIntents(from: agent),
                memories: recentMemories.isEmpty ? nil : recentMemories,
                tasks: pendingTasks.isEmpty ? nil : pendingTasks
            )
        }

        let startPayload = StartOrchestratedPayload(
            hostAgentId: hostAgentId,
            visitorId: visitorId,
            visitorUserId: visitorUserId,  // For persistent user memory storage
            userAgents: agentPayloads,
            apiKey: apiKey,
            provider: provider
        )

        let message = OrchestratedOutgoingMessage(action: "startOrchestrated", payload: startPayload)
        let encoder = JSONEncoder()
        let data = try encoder.encode(message)
        let messageString = String(data: data, encoding: .utf8)!

        try await webSocketTask?.send(.string(messageString))
    }

    /// Sends a message in an orchestrated conversation
    func sendOrchestratedMessage(_ message: String) async throws {
        guard let task = webSocketTask else {
            throw PublicAgentError.invalidResponse
        }

        let payload = SendMessagePayload(message: message)
        let outgoing = OrchestratedSendMessage(action: "sendMessage", payload: payload)
        let encoder = JSONEncoder()
        let data = try encoder.encode(outgoing)
        let messageString = String(data: data, encoding: .utf8)!

        try await task.send(.string(messageString))
    }

    /// Receives and processes orchestrated WebSocket messages
    private func receiveOrchestratedMessages() async {
        guard let task = webSocketTask else { return }

        do {
            while task.state == .running {
                let message = try await task.receive()

                switch message {
                case .string(let text):
                    if let event = parseOrchestratedMessage(text) {
                        await MainActor.run {
                            self.onOrchestratedEventHandler?(event)
                        }

                        // Auto-disconnect on complete or error
                        if case .complete = event {
                            disconnectWebSocket()
                            return
                        } else if case .error = event {
                            disconnectWebSocket()
                            return
                        }
                    }
                case .data:
                    break
                @unknown default:
                    break
                }
            }
        } catch {
            print("[PublicAgentService] Orchestrated WebSocket error: \(error)")
            await MainActor.run {
                self.onOrchestratedEventHandler?(.error(error.localizedDescription))
            }
            disconnectWebSocket()
        }
    }

    /// Parses an orchestrated WebSocket message
    private func parseOrchestratedMessage(_ text: String) -> OrchestratedSessionEvent? {
        guard let data = text.data(using: .utf8) else { return nil }
        let decoder = JSONDecoder()

        guard let envelope = try? decoder.decode(WebSocketMessageEnvelope.self, from: data) else {
            return nil
        }

        switch envelope.type {
        case "orchestratedStarted":
            if let msg = try? decoder.decode(OrchestratedStartedMessage.self, from: data) {
                return .started(OrchestratedStartedInfo(
                    hostAgent: msg.hostAgent,
                    userAgents: msg.userAgents
                ))
            }
        case "turn":
            if let msg = try? decoder.decode(OrchestratedTurnMessage.self, from: data) {
                return .turn(msg.turn)
            }
        case "thinking":
            if let msg = try? decoder.decode(OrchestratedThinkingMessage.self, from: data) {
                return .thinking(msg.agent, msg.agentName)
            }
        case "agentJoined":
            if let msg = try? decoder.decode(OrchestratedAgentJoinedMessage.self, from: data) {
                return .agentJoined(msg.agent, msg.reason)
            }
        case "taskCompleted":
            if let msg = try? decoder.decode(OrchestratedTaskCompletedMessage.self, from: data) {
                return .taskCompleted(TaskCompletedInfo(
                    taskId: msg.taskId,
                    agentId: msg.agentId,
                    agentName: msg.agentName,
                    summary: msg.summary,
                    hostAgentName: msg.hostAgentName
                ))
            }
        case "complete":
            if let msg = try? decoder.decode(OrchestratedCompleteMessage.self, from: data) {
                return .complete(msg.summary)
            }
        case "stopped":
            return .stopped
        case "error":
            if let msg = try? decoder.decode(WebSocketErrorMessage.self, from: data) {
                return .error(msg.message)
            }
        default:
            // Also check for regular turn/thinking messages
            if envelope.type == "turn" {
                if let msg = try? decoder.decode(OrchestratedTurnMessage.self, from: data) {
                    return .turn(msg.turn)
                }
            }
            if envelope.type == "thinking" {
                if let msg = try? decoder.decode(OrchestratedThinkingMessage.self, from: data) {
                    return .thinking(msg.agent, msg.agentName)
                }
            }
        }
        return nil
    }

    /// Extracts recent memories from an agent's memory stores
    private func extractRecentMemories(from agent: LocalAgent, limit: Int) -> [String] {
        var allEntries: [(content: String, date: Date)] = []

        for store in agent.memoryStores {
            for entry in store.entries {
                allEntries.append((content: entry.content, date: entry.timestamp))
            }
        }

        // Sort by date (most recent first) and take the limit
        let sortedEntries = allEntries.sorted { $0.date > $1.date }
        let memories = Array(sortedEntries.prefix(limit).map { $0.content })

        // Log for debugging
        print("[PublicAgentService] Agent '\(agent.name)' memories being sent:")
        if memories.isEmpty {
            print("[PublicAgentService]   (no memories)")
        } else {
            for (i, memory) in memories.enumerated() {
                print("[PublicAgentService]   \(i+1). \(memory)")
            }
        }

        return memories
    }

    /// Infers intents from agent properties
    private func inferIntents(from agent: LocalAgent) -> [String] {
        var intents: [String] = []
        let searchText = "\(agent.name) \(agent.description) \(agent.personality)".lowercased()

        // Intent patterns with cross-domain relevance
        let intentPatterns: [(intent: String, keywords: [String])] = [
            // Health agents are relevant for food/dietary contexts too
            ("health", ["health", "medical", "doctor", "medication", "wellness", "symptom", "dietary", "diet", "allergy", "nutrition"]),
            ("dietary", ["health", "diet", "food", "allergy", "nutrition", "wellness"]),  // Cross-domain for restaurants
            ("fitness", ["fitness", "workout", "exercise", "coach", "training", "sport", "nutrition"]),
            ("work", ["work", "career", "job", "productivity", "professional", "business"]),
            // Finance agents are relevant for any spending context
            ("finance", ["money", "finance", "budget", "financial", "investment", "savings", "mentor", "spending"]),
            ("budget", ["money", "budget", "finance", "mentor", "spending"]),  // Cross-domain for purchases
            ("personal", ["journal", "personal", "mood", "emotional", "reflection", "diary"]),
            ("education", ["study", "learn", "education", "tutor", "teaching", "academic"]),
        ]

        for (intent, keywords) in intentPatterns {
            if keywords.contains(where: { searchText.contains($0) }) {
                intents.append(intent)
            }
        }

        if intents.isEmpty {
            intents.append("general")
        }

        // Log for debugging
        print("[PublicAgentService] Agent '\(agent.name)' intents: \(intents.joined(separator: ", "))")
        print("[PublicAgentService] Agent '\(agent.name)' has \(agent.memoryStores.flatMap { $0.entries }.count) memory entries")

        return intents
    }
}

// MARK: - Errors

enum PublicAgentError: LocalizedError {
    case invalidResponse
    case notFound
    case badRequest
    case serverError
    case unknown(Int)
    case noApiKey

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .notFound:
            return "Agent not found"
        case .badRequest:
            return "Invalid request"
        case .serverError:
            return "Server error occurred"
        case .unknown(let code):
            return "Error: \(code)"
        case .noApiKey:
            return "No API key configured. Please add an API key in Settings."
        }
    }
}
