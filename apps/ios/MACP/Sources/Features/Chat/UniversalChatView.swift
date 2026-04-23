import SwiftUI

// Make String work with fullScreenCover(item:)
extension String: @retroactive Identifiable {
    public var id: String { self }
}

/// Universal Chat View - Orchestration-based chat with automatic agent routing
/// Supports both typed and spoken messages
struct UniversalChatView: View {
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var memoryService: MemoryService
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var publicAgentService: PublicAgentService
    @EnvironmentObject var inputModeService: InputModeService
    @StateObject private var tts = ElevenLabsService.shared
    @StateObject private var speechRecognizer = SpeechRecognizer()
    @StateObject private var profileService = ProfileService.shared

    @State private var conversationId: String?
    @State private var messages: [UniversalMessage] = []
    @State private var inputText = ""
    @State private var isLoading = false
    @State private var isSending = false
    @State private var errorMessage: String?
    @State private var currentAgentEmoji: String?
    @State private var isRecording = false
    @State private var recordingPulse = false
    @State private var queuedTask: AgentTask?
    @State private var suggestedContacts: [ExtractedContact] = []
    @State private var showQRScanner = false
    @State private var scannedAgentId: String?
    @FocusState private var isInputFocused: Bool

    @EnvironmentObject var contactService: ContactService

    // Context tracking for multi-turn conversations
    @State private var pendingOriginalRequest: String?
    @State private var pendingPersonName: String?
    @State private var awaitingRelationshipClarification = false

    // Profile onboarding mode
    @State private var activeProfilePrompt: ProfilePrompt?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if !hasApiKeyConfigured {
                    apiKeyRequiredView
                } else {
                    messageList
                    inputBar
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Chat")
            .navigationBarTitleDisplayMode(.inline)
            .alert("Error", isPresented: .init(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
            .task {
                if hasApiKeyConfigured {
                    await profileService.fetchProfile()
                    await startConversation()
                }
            }
            .onChange(of: speechRecognizer.transcript) { _, newValue in
                if !newValue.isEmpty {
                    inputText = newValue
                }
            }
            .toolbar {
                // Left: QR Scanner and Done button
                ToolbarItem(placement: .navigationBarLeading) {
                    HStack(spacing: 16) {
                        Button {
                            showQRScanner = true
                        } label: {
                            Image(systemName: "qrcode.viewfinder")
                                .font(.title3)
                        }

                        if !messages.isEmpty {
                            Button("Done") {
                                startNewChat()
                            }
                        }
                    }
                }

                // Right: Inbox button
                ToolbarItem(placement: .navigationBarTrailing) {
                    InboxToolbarButton()
                }
            }
            .sheet(isPresented: $showQRScanner) {
                QRScannerView { code in
                    handleScannedCode(code)
                }
            }
            .fullScreenCover(item: $scannedAgentId) { agentId in
                OrchestratedChatView(hostAgentId: agentId)
                    .environmentObject(agentStorage)
                    .environmentObject(apiKeyService)
                    .environmentObject(publicAgentService)
                    .environmentObject(authService)
                    .environmentObject(inputModeService)
                    .environmentObject(contactService)
            }
        }
    }

    /// Handle scanned QR code
    private func handleScannedCode(_ code: String) {
        print("[QR] Scanned code: \(code)")

        var agentId = code

        // Parse various QR code formats
        if code.hasPrefix("macp://agent/") {
            agentId = String(code.dropFirst("macp://agent/".count))
        } else if code.hasPrefix("https://macp.io/") {
            agentId = String(code.dropFirst("https://macp.io/".count))
        } else if let url = URL(string: code) {
            // Handle URL formats like https://macp.io/{agentId}
            if url.host == "macp.io" || url.host == "www.macp.io" {
                agentId = url.pathComponents.dropFirst().first ?? code
            } else if url.host == "agent" {
                agentId = url.lastPathComponent
            }
        }

        print("[QR] Parsed agent ID: \(agentId)")

        // Dismiss scanner first, then show orchestrated chat
        showQRScanner = false

        // Small delay to allow sheet dismissal before presenting fullScreenCover
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            print("[QR] Presenting orchestrated chat for agent: \(agentId)")
            // Setting scannedAgentId to non-nil triggers the fullScreenCover
            self.scannedAgentId = agentId
        }
    }

    private var hasApiKeyConfigured: Bool {
        apiKeyService.hasAnthropicKey ||
        apiKeyService.hasOpenAIKey ||
        apiKeyService.hasGeminiKey ||
        apiKeyService.hasGroqKey
    }

    // MARK: - Views

    private var apiKeyRequiredView: some View {
        VStack(spacing: 24) {
            Spacer()

            Image("IconInColor")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 240, height: 240)

            VStack(spacing: 8) {
                Text("API Key Required")
                    .font(.title2)
                    .fontWeight(.semibold)

                Text("Add an API key in Settings to start chatting with your agents.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            NavigationLink {
                SettingsView()
            } label: {
                Text("Go to Settings")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 14)
                    .background(Color.orange)
                    .clipShape(Capsule())
            }

            Spacer()
        }
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 16) {
                    if messages.isEmpty && !isLoading {
                        welcomeHeader
                    }

                    ForEach(messages) { message in
                        UniversalChatBubble(message: message)
                            .id(message.id)
                    }

                    if isSending {
                        typingIndicator
                    }

                    // Task queued notification
                    if let task = queuedTask {
                        taskQueuedBanner(task: task)
                    }

                    // Contact suggestion notifications
                    ForEach(suggestedContacts, id: \.name) { contact in
                        contactSuggestionBanner(contact: contact)
                    }
                }
                .padding()
            }
            .onChange(of: messages.count) { _, _ in
                if let lastMessage = messages.last {
                    withAnimation {
                        proxy.scrollTo(lastMessage.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var welcomeHeader: some View {
        VStack(spacing: 24) {
            Spacer().frame(height: 40)

            Image("IconInColor")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 180, height: 180)

            AboutMePromptCard(profileService: profileService) { prompt in
                startProfileChat(prompt: prompt)
            }
            .padding(.horizontal)

            Spacer()
        }
    }

    private var typingIndicator: some View {
        HStack(alignment: .bottom, spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.blue.opacity(0.15))
                    .frame(width: 32, height: 32)
                Text(currentAgentEmoji ?? "🤖")
                    .font(.system(size: 16))
            }

            HStack(spacing: 4) {
                ForEach(0..<3) { index in
                    Circle()
                        .fill(Color.secondary)
                        .frame(width: 8, height: 8)
                        .offset(y: typingAnimation(for: index))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(.systemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .shadow(color: .black.opacity(0.05), radius: 2)

            Spacer()
        }
        .padding(.leading, 4)
    }

    private func typingAnimation(for index: Int) -> CGFloat {
        let delay = Double(index) * 0.15
        return sin((Date().timeIntervalSinceReferenceDate + delay) * 5) * 4
    }

    private var inputBar: some View {
        HStack(spacing: 12) {
            Button {
                toggleRecording()
            } label: {
                ZStack {
                    // Pulsing ring for auto-send indicator
                    if isRecording {
                        Circle()
                            .stroke(Color.red.opacity(0.4), lineWidth: 2)
                            .frame(width: 44, height: 44)
                            .scaleEffect(recordingPulse ? 1.3 : 1.0)
                            .opacity(recordingPulse ? 0 : 1)
                            .animation(
                                .easeOut(duration: 1.0).repeatForever(autoreverses: false),
                                value: recordingPulse
                            )
                    }

                    Image(systemName: isRecording ? "mic.fill" : "mic")
                        .font(.system(size: 22))
                        .foregroundStyle(isRecording ? .red : .secondary)
                        .frame(width: 44, height: 44)
                        .background(isRecording ? Color.red.opacity(0.1) : Color.clear)
                        .clipShape(Circle())
                }
            }
            .accessibilityLabel(isRecording ? "Recording - will auto-send on silence" : "Start voice input")

            TextField("Type or speak...", text: $inputText, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 24))
                .focused($isInputFocused)
                .toolbar {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Done") { isInputFocused = false }
                    }
                }
                .overlay(
                    Group {
                        if isRecording {
                            HStack {
                                Spacer()
                                RecordingWaveform()
                                    .padding(.trailing, 12)
                            }
                        }
                    }
                )

            Button {
                Task { await sendMessage() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(inputText.isEmpty ? Color.secondary : .blue)
            }
            .disabled(inputText.isEmpty || isSending)

            if tts.isSpeaking {
                Button {
                    tts.stop()
                } label: {
                    Image(systemName: "speaker.slash.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(.red)
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Voice Input

    private func toggleRecording() {
        if isRecording {
            stopRecording()
        } else {
            startRecording()
        }
    }

    private func startRecording() {
        speechRecognizer.resetTranscript()

        // Set up silence detection callback for auto-send
        speechRecognizer.onSilenceDetected = { [weak speechRecognizer] in
            guard let recognizer = speechRecognizer, !recognizer.transcript.isEmpty else { return }
            Task { @MainActor in
                self.stopRecording()
                await self.sendMessage()
            }
        }

        speechRecognizer.startTranscribing()
        isRecording = true
        recordingPulse = true
    }

    private func stopRecording() {
        speechRecognizer.stopTranscribing()
        isRecording = false
        recordingPulse = false

        if !speechRecognizer.transcript.isEmpty {
            inputText = speechRecognizer.transcript
        }
    }

    /// Start a profile onboarding chat from the AboutMePromptCard
    private func startProfileChat(prompt: ProfilePrompt) {
        // Track that we're in profile onboarding mode
        activeProfilePrompt = prompt

        // Clear any existing input
        inputText = ""

        // Start voice recording - user speaks naturally
        // The card already showed them the question, so they know what to talk about
        startRecording()
    }

    /// Get the next unanswered profile questions after the given prompt
    private func getNextProfileQuestions(after currentPrompt: ProfilePrompt, limit: Int) -> [ProfilePrompt] {
        // Get skipped IDs from profile
        let skippedIds: Set<String> = {
            guard let fact = profileService.fact(forKey: ProfilePrompt.skippedPromptsKey),
                  !fact.displayValue.isEmpty else {
                return []
            }
            return Set(fact.displayValue.components(separatedBy: ","))
        }()

        // Find prompts after the current one that are unanswered and not skipped
        var foundCurrent = false
        var nextPrompts: [ProfilePrompt] = []

        for prompt in ProfilePrompt.allPrompts {
            if prompt.id == currentPrompt.id {
                foundCurrent = true
                continue
            }
            if foundCurrent {
                let isAnswered = profileService.fact(forKey: prompt.factKey) != nil
                let isSkipped = skippedIds.contains(prompt.id)
                if !isAnswered && !isSkipped {
                    nextPrompts.append(prompt)
                    if nextPrompts.count >= limit {
                        break
                    }
                }
            }
        }

        return nextPrompts
    }

    // MARK: - API Methods

    /// Start a fresh chat, clearing the current conversation
    private func startNewChat() {
        // Clear current state
        messages = []
        conversationId = nil
        queuedTask = nil
        errorMessage = nil
        inputText = ""

        // Refresh profile and start a new conversation
        Task {
            await profileService.fetchProfile()
            await startConversation()
        }
    }

    private func startConversation() async {
        isLoading = true
        defer { isLoading = false }

        guard let apiKey = getAvailableApiKey() else {
            errorMessage = "Please configure at least one AI provider API key in Settings"
            return
        }

        let provider = getProviderForKey()

        let result = await memoryService.createUniversalConversation(
            apiKey: apiKey,
            provider: provider
        )

        if let conversation = result {
            conversationId = conversation.id
        } else {
            errorMessage = "Failed to start conversation. Please try again."
        }
    }

    private func sendMessage() async {
        guard !inputText.isEmpty, let conversationId = conversationId else { return }

        if isRecording {
            stopRecording()
        }

        var userMessage = inputText
        inputText = ""
        isSending = true

        // If in profile onboarding mode, add context for the agent
        if let prompt = activeProfilePrompt {
            // Build context with the current question and next questions
            let nextQuestions = getNextProfileQuestions(after: prompt, limit: 2)
            let nextQuestionsText = nextQuestions.isEmpty ? "" :
                " After acknowledging, ask about: \(nextQuestions.map { $0.question }.joined(separator: " or "))"

            let profileContext = "[Profile onboarding: User is answering '\(prompt.question)'.\(nextQuestionsText) Keep response brief.]"
            userMessage = "\(profileContext) \(userMessage)"

            // Clear the profile mode
            activeProfilePrompt = nil
        }

        let userChatMessage = UniversalMessage(
            id: UUID().uuidString,
            content: userMessage,
            isFromUser: true,
            agentName: nil,
            agentEmoji: nil,
            intent: nil,
            timestamp: Date()
        )
        withAnimation {
            messages.append(userChatMessage)
        }

        // Get API key and default agent for ChatService
        guard let apiKey = getAvailableApiKey(),
              let defaultAgent = agentStorage.defaultAgent else {
            isSending = false
            return
        }

        // Check if we're awaiting relationship clarification
        if awaitingRelationshipClarification, let personName = pendingPersonName, let originalRequest = pendingOriginalRequest {
            // User just told us who this person is - save as memory and return to original request
            awaitingRelationshipClarification = false
            pendingPersonName = nil
            pendingOriginalRequest = nil

            // Save the relationship as a memory to the default agent
            let relationshipMemory = "\(personName) is the user's \(userMessage)"
            if var updatedAgent = agentStorage.agents.first(where: { $0.id == defaultAgent.id }) {
                let memoryEntry = MemoryEntry(content: relationshipMemory, category: "personal")
                if let personalIndex = updatedAgent.memoryStores.firstIndex(where: { $0.name.lowercased() == "personal" }) {
                    updatedAgent.memoryStores[personalIndex].entries.append(memoryEntry)
                } else {
                    let personalStore = MemoryStore(name: "Personal", description: "Personal information and relationships", entries: [memoryEntry])
                    updatedAgent.memoryStores.append(personalStore)
                }
                agentStorage.updateAgent(updatedAgent)
            }

            // Acknowledge and return to original request
            let ackMessage = UniversalMessage(
                id: UUID().uuidString,
                content: "Got it, \(personName) is your \(userMessage). Now, about your question...",
                isFromUser: false,
                agentName: defaultAgent.name,
                agentEmoji: defaultAgent.emoji,
                intent: nil,
                timestamp: Date()
            )
            currentAgentEmoji = defaultAgent.emoji
            withAnimation {
                messages.append(ackMessage)
            }

            if tts.isAvailable {
                await tts.speak("Got it, \(personName) is your \(userMessage). Now, about your question...")
            }

            // Re-process the original request with fresh agent data
            let freshAgent = agentStorage.agents.first(where: { $0.id == defaultAgent.id }) ?? defaultAgent

            let result = await ChatService.shared.processMessage(
                originalRequest,
                agent: freshAgent,
                conversationHistory: messages,
                apiKey: apiKey,
                provider: getProviderForKey()
            )

            await handleUniversalChatResult(result, defaultAgent: freshAgent, apiKey: apiKey)
            isSending = false
            return
        }

        // Use ChatService for task detection FIRST
        let result = await ChatService.shared.processMessage(
            userMessage,
            agent: defaultAgent,
            conversationHistory: messages,
            apiKey: apiKey,
            provider: getProviderForKey()
        )

        switch result {
        case .relationshipQuery(let queryResponse):
            // We need to know who this person is - SAVE CONTEXT
            pendingOriginalRequest = userMessage
            pendingPersonName = queryResponse.personName
            awaitingRelationshipClarification = true

            let agentMessage = UniversalMessage(
                id: UUID().uuidString,
                content: queryResponse.question,
                isFromUser: false,
                agentName: defaultAgent.name,
                agentEmoji: defaultAgent.emoji,
                intent: nil,
                timestamp: Date()
            )
            currentAgentEmoji = defaultAgent.emoji
            withAnimation {
                messages.append(agentMessage)
            }

            if tts.isAvailable {
                await tts.speak(queryResponse.question)
            }

            // Still extract contacts - user might have provided relationship info
            await extractContactInfo(userMessage: userMessage, agentResponse: queryResponse.question)

        case .personMentioned(let personResponse):
            // Person mentioned - create task automatically and acknowledge briefly
            let relationshipNote = personResponse.relationship.map { " (\($0))" } ?? ""
            let taskDescription = "\(userMessage) - involves \(personResponse.personName)\(relationshipNote)"

            // Create and queue the task
            let newTask = AgentTask(
                description: taskDescription,
                keywords: [personResponse.personName.lowercased()],
                category: .social,
                status: .pending,
                targetPersonName: personResponse.personName
            )

            let targetAgent = findAgentForTask(category: .social)
            var updatedAgent = targetAgent
            updatedAgent.tasks.append(newTask)
            agentStorage.updateAgent(updatedAgent)

            // Brief acknowledgment
            let responseText = "Got it! I'll ask \(personResponse.personName)\(relationshipNote) when we connect."

            let agentMessage = UniversalMessage(
                id: UUID().uuidString,
                content: responseText,
                isFromUser: false,
                agentName: defaultAgent.name,
                agentEmoji: defaultAgent.emoji,
                intent: nil,
                timestamp: Date()
            )
            currentAgentEmoji = defaultAgent.emoji
            withAnimation {
                messages.append(agentMessage)
                queuedTask = newTask
            }

            if tts.isAvailable {
                await tts.speak(responseText)
            }

            // Extract contacts - person was mentioned with relationship
            await extractContactInfo(userMessage: userMessage, agentResponse: responseText)

        case .taskDetected(let taskResponse):
            // Task detected - show brief acknowledgment locally, don't send to server
            // Save the task to the appropriate agent
            let targetAgent = findAgentForTask(category: taskResponse.task.category)
            var updatedAgent = targetAgent
            updatedAgent.tasks.append(taskResponse.task)
            agentStorage.updateAgent(updatedAgent)

            // Show brief acknowledgment (under 20 words!)
            let agentMessage = UniversalMessage(
                id: UUID().uuidString,
                content: taskResponse.acknowledgment,
                isFromUser: false,
                agentName: defaultAgent.name,
                agentEmoji: defaultAgent.emoji,
                intent: nil,
                timestamp: Date()
            )
            currentAgentEmoji = defaultAgent.emoji
            withAnimation {
                messages.append(agentMessage)
                queuedTask = taskResponse.task
            }

            if tts.isAvailable {
                await tts.speak(taskResponse.acknowledgment)
            }

            // Extract contacts - tasks often involve people
            await extractContactInfo(userMessage: userMessage, agentResponse: taskResponse.acknowledgment)

        case .normal(let localResponse):
            // Not a task - try to send to server for orchestrated response
            if let response = await memoryService.sendUniversalMessage(
                conversationId: conversationId,
                content: userMessage
            ) {
                let agentResponses = response.agentMessages ?? [response.agentMessage]

                for agentInfo in agentResponses {
                    let agentMessage = UniversalMessage(
                        id: agentInfo.id,
                        content: agentInfo.content,
                        isFromUser: false,
                        agentName: agentInfo.agentName,
                        agentEmoji: agentInfo.agentEmoji,
                        intent: agentInfo.intent,
                        timestamp: Date()
                    )
                    currentAgentEmoji = agentInfo.agentEmoji
                    withAnimation {
                        messages.append(agentMessage)
                    }

                    // Extract contact info from conversation
                    await extractContactInfo(userMessage: userMessage, agentResponse: agentInfo.content)
                }

                if tts.isAvailable {
                    let combinedSpeech = agentResponses.map { $0.content }.joined(separator: " ")
                    await tts.speak(combinedSpeech)
                }
            } else {
                // Server call failed - use local response from ChatService and still extract contacts
                let agentMessage = UniversalMessage(
                    id: UUID().uuidString,
                    content: localResponse,
                    isFromUser: false,
                    agentName: defaultAgent.name,
                    agentEmoji: defaultAgent.emoji,
                    intent: nil,
                    timestamp: Date()
                )
                currentAgentEmoji = defaultAgent.emoji
                withAnimation {
                    messages.append(agentMessage)
                }

                // Still extract contact info - this runs client-side with user's API key
                await extractContactInfo(userMessage: userMessage, agentResponse: localResponse)

                if tts.isAvailable {
                    await tts.speak(localResponse)
                }
            }

        case .error(let errorMsg):
            showError(errorMsg)
        }

        isSending = false
    }

    private func showError(_ message: String) {
        let errorMessage = UniversalMessage(
            id: UUID().uuidString,
            content: message,
            isFromUser: false,
            agentName: "System",
            agentEmoji: "⚠️",
            intent: nil,
            timestamp: Date()
        )
        withAnimation {
            messages.append(errorMessage)
        }
    }

    /// Helper to handle chat results after re-processing
    private func handleUniversalChatResult(_ result: ChatService.ResponseType, defaultAgent: LocalAgent, apiKey: String) async {
        switch result {
        case .relationshipQuery(let queryResponse):
            let agentMessage = UniversalMessage(
                id: UUID().uuidString,
                content: queryResponse.question,
                isFromUser: false,
                agentName: defaultAgent.name,
                agentEmoji: defaultAgent.emoji,
                intent: nil,
                timestamp: Date()
            )
            currentAgentEmoji = defaultAgent.emoji
            withAnimation {
                messages.append(agentMessage)
            }

        case .personMentioned(let personResponse):
            // Person mentioned - create task automatically
            let relationshipNote = personResponse.relationship.map { " (\($0))" } ?? ""
            let taskDescription = "\(pendingOriginalRequest ?? "") - involves \(personResponse.personName)\(relationshipNote)"

            let newTask = AgentTask(
                description: taskDescription,
                keywords: [personResponse.personName.lowercased()],
                category: .social,
                status: .pending,
                targetPersonName: personResponse.personName
            )

            let targetAgent = findAgentForTask(category: .social)
            var updatedAgent = targetAgent
            updatedAgent.tasks.append(newTask)
            agentStorage.updateAgent(updatedAgent)

            let responseText = "Got it! I'll ask \(personResponse.personName)\(relationshipNote) when we connect."

            let agentMessage = UniversalMessage(
                id: UUID().uuidString,
                content: responseText,
                isFromUser: false,
                agentName: defaultAgent.name,
                agentEmoji: defaultAgent.emoji,
                intent: nil,
                timestamp: Date()
            )
            currentAgentEmoji = defaultAgent.emoji
            withAnimation {
                messages.append(agentMessage)
                queuedTask = newTask
            }

            if tts.isAvailable {
                await tts.speak(responseText)
            }

        case .taskDetected(let taskResponse):
            let targetAgent = findAgentForTask(category: taskResponse.task.category)
            var updatedAgent = targetAgent
            updatedAgent.tasks.append(taskResponse.task)
            agentStorage.updateAgent(updatedAgent)

            let agentMessage = UniversalMessage(
                id: UUID().uuidString,
                content: taskResponse.acknowledgment,
                isFromUser: false,
                agentName: defaultAgent.name,
                agentEmoji: defaultAgent.emoji,
                intent: nil,
                timestamp: Date()
            )
            currentAgentEmoji = defaultAgent.emoji
            withAnimation {
                messages.append(agentMessage)
                queuedTask = taskResponse.task
            }

            if tts.isAvailable {
                await tts.speak(taskResponse.acknowledgment)
            }

        case .normal(_):
            // Not a task after clarification - send to server for normal response
            if let conversationId = conversationId,
               let response = await memoryService.sendUniversalMessage(
                conversationId: conversationId,
                content: pendingOriginalRequest ?? ""
            ) {
                let agentMessage = UniversalMessage(
                    id: response.agentMessage.id,
                    content: response.agentMessage.content,
                    isFromUser: false,
                    agentName: response.agentMessage.agentName,
                    agentEmoji: response.agentMessage.agentEmoji,
                    intent: response.agentMessage.intent,
                    timestamp: Date()
                )
                currentAgentEmoji = response.agentMessage.agentEmoji
                withAnimation {
                    messages.append(agentMessage)
                }

                if tts.isAvailable {
                    await tts.speak(response.agentMessage.content)
                }
            }

        case .error(let errorMsg):
            showError(errorMsg)
        }
    }

    private func getAvailableApiKey() -> String? {
        if apiKeyService.hasAnthropicKey {
            return apiKeyService.getKey(for: "anthropic")
        } else if apiKeyService.hasOpenAIKey {
            return apiKeyService.getKey(for: "openai")
        } else if apiKeyService.hasGeminiKey {
            return apiKeyService.getKey(for: "gemini")
        } else if apiKeyService.hasGroqKey {
            return apiKeyService.getKey(for: "groq")
        }
        return nil
    }

    private func getProviderForKey() -> String {
        if apiKeyService.hasAnthropicKey {
            return "anthropic"
        } else if apiKeyService.hasOpenAIKey {
            return "openai"
        } else if apiKeyService.hasGeminiKey {
            return "gemini"
        } else if apiKeyService.hasGroqKey {
            return "groq"
        }
        return "anthropic"
    }

    // MARK: - Task Queued Banner

    private func taskQueuedBanner(task: AgentTask) -> some View {
        let needsConfirmation = task.status == .needsConfirmation

        return VStack(spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: needsConfirmation ? "questionmark.circle.fill" : "checklist.checked")
                    .foregroundStyle(needsConfirmation ? .yellow : .orange)

                VStack(alignment: .leading, spacing: 2) {
                    Text(needsConfirmation ? "Confirm Task Details" : "Task Queued")
                        .font(.subheadline)
                        .fontWeight(.semibold)

                    Text(task.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }

                Spacer()

                if needsConfirmation {
                    // Confirm/reject buttons
                    HStack(spacing: 8) {
                        Button {
                            confirmQueuedTask()
                        } label: {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.green)
                        }

                        Button {
                            rejectQueuedTask()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.title2)
                                .foregroundStyle(.red)
                        }
                    }
                } else {
                    Image(systemName: "clock.fill")
                        .foregroundStyle(.orange)
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(UIColor.systemBackground))
                .shadow(color: .black.opacity(0.05), radius: 5)
        )
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func confirmQueuedTask() {
        guard let task = queuedTask else { return }

        // Find the agent that has this task and confirm it
        for var agent in agentStorage.agents {
            if let index = agent.tasks.firstIndex(where: { $0.id == task.id }) {
                agent.tasks[index].confirm()
                agentStorage.updateAgent(agent)
                break
            }
        }

        withAnimation {
            queuedTask = nil
        }
    }

    private func rejectQueuedTask() {
        guard let task = queuedTask else { return }

        // Find the agent and remove the task
        for var agent in agentStorage.agents {
            if let index = agent.tasks.firstIndex(where: { $0.id == task.id }) {
                agent.tasks.remove(at: index)
                agentStorage.updateAgent(agent)
                break
            }
        }

        withAnimation {
            queuedTask = nil
        }
    }

    // MARK: - Contact Suggestion Banner

    private func contactSuggestionBanner(contact: ExtractedContact) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                // Avatar
                ZStack {
                    Circle()
                        .fill(contact.isUpdate ? Color.orange.opacity(0.15) : Color.blue.opacity(0.15))
                        .frame(width: 40, height: 40)
                    if contact.isUpdate {
                        Image(systemName: "pencil")
                            .font(.headline)
                            .foregroundStyle(.orange)
                    } else {
                        Text(String(contact.name.prefix(1)).uppercased())
                            .font(.headline)
                            .foregroundStyle(.blue)
                    }
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(contact.actionDescription)
                        .font(.subheadline)
                        .fontWeight(.semibold)

                    Text(contact.summary)
                        .font(.caption)
                        .foregroundStyle(.primary)

                    Text(contact.detailsSummary)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                // Confirm/reject buttons
                HStack(spacing: 8) {
                    Button {
                        confirmSuggestedContact(contact)
                    } label: {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.green)
                    }

                    Button {
                        rejectSuggestedContact(contact)
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.red)
                    }
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(UIColor.systemBackground))
                .shadow(color: .black.opacity(0.05), radius: 5)
        )
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func confirmSuggestedContact(_ extracted: ExtractedContact) {
        // Remove from suggestions immediately
        withAnimation {
            suggestedContacts.removeAll { $0.name == extracted.name }
        }

        // Create or update the contact via the service
        Task {
            if extracted.isUpdate, let existingId = extracted.existingContactId {
                // Update existing contact
                print("[Contacts] Attempting to update contact: \(extracted.name) (id: \(existingId))")

                // Get existing contact first
                if let existing = await contactService.getContact(id: existingId) {
                    var updated = existing
                    // Merge new info with existing
                    if let rel = extracted.relationship { updated.relationship = rel }
                    if let bday = extracted.birthday { updated.birthday = bday }
                    if let email = extracted.email { updated.email = email }
                    if let phone = extracted.phone { updated.phone = phone }
                    if let notes = extracted.notes {
                        updated.notes = (updated.notes ?? "") + "\n" + notes
                    }
                    // Add new aliases
                    for alias in extracted.aliases where !updated.aliases.contains(alias) {
                        updated.aliases.append(alias)
                    }

                    let success = await contactService.updateContact(updated)
                    if success {
                        print("[Contacts] Successfully updated: \(updated.name)")
                    } else {
                        print("[Contacts] Failed to update. Error: \(contactService.error ?? "Unknown")")
                    }
                }
            } else {
                // Create new contact
                let newContact = ContactExtractionService.shared.createContact(from: extracted)
                print("[Contacts] Attempting to save contact: \(newContact.name)")

                let result = await contactService.createContact(
                    name: newContact.name,
                    aliases: newContact.aliases,
                    relationship: newContact.relationship,
                    birthday: newContact.birthday,
                    email: newContact.email,
                    phone: newContact.phone,
                    notes: newContact.notes,
                    tags: newContact.tags
                )

                if let savedContact = result {
                    print("[Contacts] Successfully saved: \(savedContact.name) (id: \(savedContact.id))")
                } else {
                    print("[Contacts] Failed to save contact. Error: \(contactService.error ?? "Unknown")")
                    if let error = contactService.error {
                        errorMessage = "Couldn't save contact: \(error)"
                    }
                }
            }
        }
    }

    private func rejectSuggestedContact(_ contact: ExtractedContact) {
        withAnimation {
            suggestedContacts.removeAll { $0.name == contact.name }
        }
    }

    // MARK: - Contact Extraction

    private func extractContactInfo(userMessage: String, agentResponse: String) async {
        guard let apiKey = getAvailableApiKey() else { return }

        let provider = getProviderForKey()
        let conversationContext = messages.suffix(5).map { $0.content }

        // Use new multi-contact extraction
        let extracted = await ContactExtractionService.shared.extractContacts(
            from: userMessage,
            agentResponse: agentResponse,
            conversationContext: conversationContext,
            existingContacts: contactService.contacts,
            apiKey: apiKey,
            provider: provider
        )

        // Filter to medium/high confidence only
        let validContacts = extracted.filter { $0.confidence != .low }

        guard !validContacts.isEmpty else { return }

        // Add all extracted contacts to suggestions
        withAnimation {
            for contact in validContacts {
                // Avoid duplicates
                if !suggestedContacts.contains(where: { $0.name == contact.name }) {
                    suggestedContacts.append(contact)
                }
            }
        }

        // Auto-dismiss each after 15 seconds if not acted upon
        for contact in validContacts {
            let contactName = contact.name
            DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
                withAnimation {
                    suggestedContacts.removeAll { $0.name == contactName }
                }
            }
        }
    }

    // MARK: - Task Extraction

    private func extractAndQueueTask(from message: String) async {
        guard let apiKey = getAvailableApiKey() else { return }
        guard !agentStorage.agents.isEmpty else { return }

        let provider = getProviderForKey()
        let conversationContext = messages.suffix(5).map { $0.content }

        // Gather memories from all agents for relationship context
        let allMemories = agentStorage.agents.flatMap { agent in
            agent.memoryStores.flatMap { $0.entries }.map { $0.content }
        }

        // Extract task from message
        let extractedTask = await TaskExtractionService.shared.extractTask(
            from: message,
            conversationContext: conversationContext,
            memories: allMemories,
            apiKey: apiKey,
            provider: provider
        )

        guard let extracted = extractedTask else { return }

        // Create the task
        let newTask = TaskExtractionService.shared.createAgentTask(from: extracted)

        // Find best agent for this task based on category
        let targetAgent = findAgentForTask(category: newTask.category)

        // Add task to the agent
        var updatedAgent = targetAgent
        updatedAgent.tasks.append(newTask)
        agentStorage.updateAgent(updatedAgent)

        // Show notification
        withAnimation {
            queuedTask = newTask
        }

        // Auto-dismiss after 4 seconds only if it doesn't need confirmation
        if newTask.status != .needsConfirmation {
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                withAnimation {
                    if queuedTask?.id == newTask.id {
                        queuedTask = nil
                    }
                }
            }
        }
    }

    private func findAgentForTask(category: AgentTask.TaskCategory) -> LocalAgent {
        // Map task categories to agent intents
        let categoryIntentMap: [AgentTask.TaskCategory: [String]] = [
            .restaurant: ["food", "dining", "restaurant"],
            .health: ["health", "medical", "wellness", "fitness"],
            .realEstate: ["real_estate", "housing", "property"],
            .finance: ["finance", "money", "budget"],
            .travel: ["travel", "vacation", "trip"],
            .shopping: ["shopping", "retail", "purchase"],
            .research: ["research", "education", "learning"],
            .appointment: ["appointment", "scheduling", "calendar"],
            .other: ["general"]
        ]

        let targetIntents = categoryIntentMap[category] ?? ["general"]

        // Find an agent whose intents match the task category
        for agent in agentStorage.agents {
            for intent in agent.intents {
                if targetIntents.contains(intent.lowercased()) {
                    return agent
                }
            }
        }

        // Default to first agent (usually the personal assistant)
        return agentStorage.agents.first!
    }
}

// MARK: - Message Model

struct UniversalMessage: Identifiable, ChatServiceMessage {
    let id: String
    let content: String
    let isFromUser: Bool
    let agentName: String?
    let agentEmoji: String?
    let intent: String?
    let timestamp: Date
}

// MARK: - Chat Bubble

struct UniversalChatBubble: View {
    let message: UniversalMessage

    var agentColor: Color {
        switch message.agentEmoji {
        case "🏥": return .red
        case "💪": return .orange
        case "💼": return .blue
        case "💰": return .green
        case "📔": return .purple
        case "📚": return .cyan
        default: return .blue
        }
    }

    var body: some View {
        VStack(alignment: message.isFromUser ? .trailing : .leading, spacing: 4) {
            if !message.isFromUser, let agentName = message.agentName {
                HStack(spacing: 4) {
                    if let emoji = message.agentEmoji {
                        Text(emoji)
                            .font(.caption)
                    }
                    Text(agentName)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(agentColor)
                }
                .padding(.leading, 44)
            }

            HStack(alignment: .bottom, spacing: 8) {
                if message.isFromUser {
                    Spacer(minLength: 60)
                } else {
                    ZStack {
                        Circle()
                            .fill(agentColor.opacity(0.15))
                            .frame(width: 32, height: 32)
                        Text(message.agentEmoji ?? "🤖")
                            .font(.system(size: 16))
                    }
                }

                Text(message.content)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(message.isFromUser ? Color.blue : Color(.systemBackground))
                    .foregroundStyle(message.isFromUser ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                    .shadow(color: .black.opacity(0.05), radius: 2)

                if !message.isFromUser {
                    Spacer(minLength: 60)
                }
            }
        }
    }
}

#Preview {
    UniversalChatView()
        .environmentObject(APIKeyService.shared)
        .environmentObject(MemoryService.shared)
        .environmentObject(AuthService.shared)
}
