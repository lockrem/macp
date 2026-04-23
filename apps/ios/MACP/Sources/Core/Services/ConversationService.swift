import Foundation

@MainActor
class ConversationService: ObservableObject {
    static let shared = ConversationService()

    @Published var conversations: [Conversation] = []
    @Published var currentConversation: Conversation?
    @Published var messages: [Message] = []
    @Published var isLoading = false
    @Published var error: String?

    // Real-time updates
    @Published var isConnected = false
    @Published var currentTurnAgent: String?
    @Published var isAgentTyping = false

    private var webSocket: URLSessionWebSocketTask?
    private var pingTimer: Timer?
    private var pendingSubscriptions: [String] = []

    private init() {}

    // MARK: - Conversations

    func fetchConversations() async {
        isLoading = true
        error = nil

        do {
            let response: ConversationsResponse = try await APIClient.shared.get("/conversations")
            self.conversations = response.conversations
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func createConversation(topic: String, goal: String?, agents: [LocalAgent]) async -> Conversation? {
        isLoading = true
        error = nil

        do {
            // Convert LocalAgent to the format the server expects
            let agentConfigs = agents.map { agent in
                AgentConfigForCreate(
                    id: agent.id.uuidString,
                    name: agent.name,
                    provider: agent.provider.rawValue,
                    description: agent.description
                )
            }

            let request = CreateConversationRequest(
                topic: topic,
                goal: goal,
                mode: "campfire",
                maxTurns: 20,
                agents: agentConfigs
            )
            let conversation: Conversation = try await APIClient.shared.post("/conversations", body: request)
            conversations.insert(conversation, at: 0)

            // After creating, join with each selected agent
            for agent in agents {
                guard let apiKey = APIKeyService.shared.getKey(for: agent.provider.rawValue) else {
                    self.error = "Missing API key for \(agent.provider.displayName)"
                    isLoading = false
                    return conversation // Return conversation but note the error
                }

                let joinRequest = JoinConversationRequest(
                    agentId: agent.id.uuidString,
                    apiKey: apiKey,
                    agentConfig: AgentConfig(
                        displayName: agent.name,
                        provider: agent.provider.rawValue,
                        modelId: agent.modelId,
                        systemPrompt: nil,
                        personality: agent.description.isEmpty ? nil : agent.description
                    )
                )
                let _: JoinResponse = try await APIClient.shared.post("/conversations/\(conversation.id)/join", body: joinRequest)
            }

            isLoading = false
            return conversation
        } catch {
            self.error = error.localizedDescription
            isLoading = false
            return nil
        }
    }

    /// Generate a shareable invite link for a conversation
    func getInviteLink(for conversationId: String) async -> InviteResponse? {
        do {
            let response: InviteResponse = try await APIClient.shared.post("/conversations/\(conversationId)/invite", body: EmptyBody())
            return response
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    func joinConversation(_ conversationId: String, with agent: Agent, apiKey: String) async -> Bool {
        do {
            let request = JoinConversationRequest(
                agentId: agent.id,
                apiKey: apiKey, // Client's API key
                agentConfig: AgentConfig(
                    displayName: agent.displayName,
                    provider: agent.provider,
                    modelId: agent.modelId,
                    systemPrompt: agent.systemPrompt,
                    personality: agent.personality
                )
            )
            let _: [String: String] = try await APIClient.shared.post("/conversations/\(conversationId)/join", body: request)
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    /// Join a conversation with a local agent (used for deep link invitations)
    func joinConversation(_ conversationId: String, with agent: LocalAgent) async throws {
        guard let apiKey = APIKeyService.shared.getKey(for: agent.provider.rawValue) else {
            throw ConversationError.missingAPIKey(agent.provider.displayName)
        }

        let request = JoinConversationRequest(
            agentId: agent.id.uuidString,
            apiKey: apiKey,
            agentConfig: AgentConfig(
                displayName: agent.name,
                provider: agent.provider.rawValue,
                modelId: agent.modelId,
                systemPrompt: nil,
                personality: agent.description.isEmpty ? nil : agent.description
            )
        )
        let _: JoinResponse = try await APIClient.shared.post("/conversations/\(conversationId)/join", body: request)

        // Refresh conversations list
        await fetchConversations()
    }

    func startConversation(_ conversationId: String) async -> Bool {
        do {
            let response: StartConversationResponse = try await APIClient.shared.post("/conversations/\(conversationId)/start", body: EmptyBody())
            print("[Conversation] Started: \(response.message)")
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func stopConversation(_ conversationId: String) async -> Bool {
        do {
            let response: StopConversationResponse = try await APIClient.shared.post("/conversations/\(conversationId)/stop", body: EmptyBody())
            print("[Conversation] Stopped: \(response.message)")

            // Update local state
            if let index = conversations.firstIndex(where: { $0.id == conversationId }) {
                // Refresh to get updated status
                await fetchConversations()
            }

            isAgentTyping = false
            currentTurnAgent = nil

            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    // MARK: - Messages

    func fetchMessages(for conversationId: String) async {
        do {
            let response: MessagesResponse = try await APIClient.shared.get("/conversations/\(conversationId)/messages")
            self.messages = response.messages
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - WebSocket Connection

    func connect() {
        guard webSocket == nil else { return }

        // Get a WebSocket ticket first (async)
        Task {
            await connectWithTicket()
        }
    }

    private func connectWithTicket() async {
        do {
            // Request a single-use, short-lived ticket from the server
            let ticketResponse: WSTicketResponse = try await APIClient.shared.post("/auth/ws-ticket", body: EmptyBody())

            // Connect using the ticket
            let wsURLString = "\(APIClient.shared.wsURL)?ticket=\(ticketResponse.ticket)"
            print("[WS] Connecting to: \(wsURLString)")

            guard let wsURL = URL(string: wsURLString) else {
                print("[WS] Invalid WebSocket URL")
                self.error = "Invalid WebSocket URL"
                return
            }

            // Create a URLSession with WebSocket-specific configuration
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 30
            config.timeoutIntervalForResource = 60
            let session = URLSession(configuration: config)

            webSocket = session.webSocketTask(with: wsURL)
            webSocket?.resume()

            // Start receiving messages - the server will send a "connected" message
            // which will trigger processPendingSubscriptions()
            receiveMessages()
            startPingTimer()

            print("[WS] WebSocket resumed, waiting for server connection confirmation...")
        } catch {
            print("[WS] Failed to get ticket: \(error)")
            self.error = "Failed to connect: \(error.localizedDescription)"
        }
    }

    func disconnect() {
        pingTimer?.invalidate()
        pingTimer = nil
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        isConnected = false
    }

    func subscribeToConversation(_ conversationId: String) {
        if isConnected {
            let message = ["type": "subscribe", "payload": ["conversationId": conversationId]] as [String: Any]
            sendJSON(message)
        } else {
            // Queue subscription for when connection is established
            pendingSubscriptions.append(conversationId)
            print("[WS] Queued subscription for: \(conversationId)")
        }
    }

    private func processPendingSubscriptions() {
        for conversationId in pendingSubscriptions {
            let message = ["type": "subscribe", "payload": ["conversationId": conversationId]] as [String: Any]
            sendJSON(message)
            print("[WS] Processed pending subscription: \(conversationId)")
        }
        pendingSubscriptions.removeAll()
    }

    func unsubscribeFromConversation(_ conversationId: String) {
        let message = ["type": "unsubscribe", "payload": ["conversationId": conversationId]] as [String: Any]
        sendJSON(message)
    }

    // MARK: - Private WebSocket Methods

    private func receiveMessages() {
        guard let ws = webSocket else { return }

        ws.receive { [weak self] result in
            guard let self = self else { return }

            Task { @MainActor [weak self] in
                guard let self = self else { return }

                switch result {
                case .success(let message):
                    switch message {
                    case .string(let text):
                        self.handleWebSocketMessage(text)
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8) {
                            self.handleWebSocketMessage(text)
                        }
                    @unknown default:
                        break
                    }
                    // Continue receiving only if still connected
                    if self.isConnected {
                        self.receiveMessages()
                    }

                case .failure(let error):
                    print("[WS] Receive error: \(error)")
                    self.isConnected = false
                }
            }
        }
    }

    private func handleWebSocketMessage(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }

        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let wsMessage = try decoder.decode(WSMessage.self, from: data)

            Task { @MainActor in
                self.processWSMessage(wsMessage)
            }
        } catch {
            print("[WS] Parse error: \(error)")
        }
    }

    private func processWSMessage(_ wsMessage: WSMessage) {
        // Handle connection confirmation first (doesn't have payload.type structure)
        if wsMessage.type == "connected" {
            print("[WS] Server confirmed connection")
            if !isConnected {
                isConnected = true
                processPendingSubscriptions()
            }
            return
        }

        guard let payload = wsMessage.payload else { return }

        switch payload.type {
        case "conversation_start":
            // Conversation has begun
            break

        case "turn_start":
            currentTurnAgent = payload.agentName
            isAgentTyping = true

        case "message":
            isAgentTyping = false
            if let agentName = payload.agentName,
               let content = payload.content,
               let turnNumber = payload.turnNumber {
                let message = Message(
                    id: UUID().uuidString,
                    turnNumber: turnNumber,
                    agentId: "",
                    agentName: agentName,
                    content: content,
                    createdAt: Date()
                )
                messages.append(message)
            }

        case "conversation_end":
            isAgentTyping = false
            currentTurnAgent = nil
            // Refresh conversations to get updated status
            Task {
                await fetchConversations()
            }

        case "conversation_paused":
            isAgentTyping = false
            currentTurnAgent = nil
            // Refresh conversations to get updated status
            Task {
                await fetchConversations()
            }

        case "error":
            error = payload.message

        default:
            break
        }
    }

    private func sendJSON(_ dict: [String: Any]) {
        guard let webSocket = webSocket else {
            print("[WS] Cannot send - no WebSocket connection")
            return
        }

        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let string = String(data: data, encoding: .utf8) else {
            print("[WS] Failed to serialize message")
            return
        }

        webSocket.send(.string(string)) { [weak self] error in
            if let error = error {
                print("[WS] Send error: \(error)")
                Task { @MainActor in
                    self?.isConnected = false
                    // Attempt reconnection
                    self?.webSocket = nil
                    self?.connect()
                }
            }
        }
    }

    private func startPingTimer() {
        pingTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.sendJSON(["type": "ping"])
        }
    }
}

// MARK: - Empty Body for POST requests

struct EmptyBody: Codable {}

// MARK: - Errors

enum ConversationError: LocalizedError {
    case missingAPIKey(String)

    var errorDescription: String? {
        switch self {
        case .missingAPIKey(let provider):
            return "Missing API key for \(provider). Please configure it in Settings."
        }
    }
}
