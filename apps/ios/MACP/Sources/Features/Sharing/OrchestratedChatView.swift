import SwiftUI

/// View for orchestrated conversations started via QR scan
/// Host agent greets immediately, user chats, and user's agents join based on relevance
struct OrchestratedChatView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var publicAgentService: PublicAgentService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var inputModeService: InputModeService
    @EnvironmentObject var contactService: ContactService
    @StateObject private var tts = ElevenLabsService.shared
    @StateObject private var speechRecognizer = SpeechRecognizer()

    // Input
    let hostAgentId: String

    // State
    @State private var hostAgent: PublishedAgent?
    @State private var turns: [OrchestratedTurn] = []
    @State private var isStarted = false
    @State private var isComplete = false
    @State private var thinkingAgent: (id: String, name: String?)?
    @State private var activeAgents: [OrchestratedAgentInfo] = []
    @State private var errorMessage: String?
    @State private var inputText = ""
    @State private var isSending = false
    @State private var showStopConfirm = false
    @State private var isLoading = true
    @State private var isRecording = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    loadingView
                } else if let error = errorMessage, hostAgent == nil {
                    errorView(error)
                } else {
                    chatContent
                }
            }
            .background(Color(UIColor.systemGroupedBackground))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    if let host = hostAgent {
                        HStack(spacing: 4) {
                            Text(host.emoji)
                            Text(host.name)
                                .font(.headline)
                        }
                    } else {
                        Text("Connecting...")
                            .font(.headline)
                    }
                }

                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        if turns.isEmpty || isComplete {
                            dismiss()
                        } else {
                            showStopConfirm = true
                        }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                }

                // Input mode toggle (Type vs Talk)
                ToolbarItem(placement: .topBarTrailing) {
                    InputModeToolbarToggle()
                }
            }
            .confirmationDialog("Leave Conversation?", isPresented: $showStopConfirm) {
                Button("Leave", role: .destructive) {
                    publicAgentService.disconnectWebSocket()
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("The conversation will end.")
            }
            .onDisappear {
                publicAgentService.disconnectWebSocket()
            }
            .alert("Error", isPresented: .init(
                get: { errorMessage != nil && hostAgent != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
            .task {
                await loadAndStart()
            }
        }
    }

    // MARK: - Subviews

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Connecting to agent...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(.orange)

            Text("Could not connect")
                .font(.headline)

            Text(error)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button("Try Again") {
                Task { await loadAndStart() }
            }
            .buttonStyle(.bordered)

            Button("Close") {
                dismiss()
            }
            .foregroundStyle(.secondary)
        }
        .padding()
    }

    private var chatContent: some View {
        VStack(spacing: 0) {
            // Active agents header (shows as agents join)
            if !activeAgents.isEmpty {
                activeAgentsHeader
            }

            // Messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        // Waiting for greeting
                        if !isStarted && turns.isEmpty {
                            waitingForGreetingView
                        }

                        // Conversation turns
                        ForEach(turns) { turn in
                            OrchestratedTurnBubble(
                                turn: turn,
                                hostAgent: hostAgent
                            )
                            .id(turn.id)
                        }

                        // Thinking indicator
                        if let thinking = thinkingAgent {
                            thinkingIndicator(for: thinking)
                        }
                    }
                    .padding()
                }
                .onChange(of: turns.count) { _, _ in
                    if let lastTurn = turns.last {
                        withAnimation {
                            proxy.scrollTo(lastTurn.id, anchor: .bottom)
                        }
                    }
                }
            }

            // Input bar
            if !isComplete {
                inputBar
            } else {
                completeBar
            }
        }
    }

    private var activeAgentsHeader: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Host agent
                if let host = hostAgent {
                    AgentChip(
                        emoji: host.emoji,
                        name: host.name,
                        color: host.accentColorValue,
                        isHost: true
                    )
                }

                // User's active agents
                ForEach(activeAgents, id: \.id) { agent in
                    AgentChip(
                        emoji: agent.emoji,
                        name: agent.name,
                        color: .blue,
                        isHost: false
                    )
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .background(Color(UIColor.systemBackground))
    }

    private var waitingForGreetingView: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Waiting for greeting...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 40)
    }

    private func thinkingIndicator(for agent: (id: String, name: String?)) -> some View {
        HStack {
            if agent.id == "host" {
                Spacer().frame(width: 20)
            } else {
                Spacer()
            }

            HStack(spacing: 8) {
                if let name = agent.name {
                    Text(name)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                ProgressView()
                    .scaleEffect(0.8)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color(UIColor.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))

            if agent.id != "host" {
                Spacer().frame(width: 20)
            } else {
                Spacer()
            }
        }
    }

    private var inputBar: some View {
        Group {
            if inputModeService.currentMode == .voice {
                // Continuous listening interface - no big button
                ContinuousListeningBar(
                    isRecording: $isRecording,
                    isSpeaking: tts.isSpeaking,
                    transcript: inputText,
                    accentColor: hostAgent?.accentColorValue ?? .blue,
                    onStopSpeaking: { tts.stop() },
                    onSendManually: inputText.isEmpty ? nil : {
                        Task { await sendMessage() }
                    }
                )
            } else {
                // Text-first interface (with voice option)
                ChatInputBarWithVoice(
                    text: $inputText,
                    placeholder: "Type a message...",
                    accentColor: hostAgent?.accentColorValue ?? .blue,
                    isEnabled: !isSending,
                    isSpeaking: tts.isSpeaking,
                    isRecording: isRecording,
                    onSend: {
                        Task { await sendMessage() }
                    },
                    onToggleRecording: {
                        toggleRecording()
                    },
                    onStopSpeaking: {
                        tts.stop()
                    }
                )
            }
        }
        .onChange(of: speechRecognizer.transcript) { _, newValue in
            if isRecording {
                inputText = newValue
            }
        }
        .onAppear {
            // Auto-send when user stops speaking (for continuous listening)
            speechRecognizer.onSilenceDetected = {
                if isRecording && !inputText.isEmpty && inputModeService.currentMode == .voice {
                    // In voice mode, auto-send and continue listening
                    stopRecordingAndSend(continueListening: true)
                } else if isRecording && !inputText.isEmpty {
                    // In text mode with voice input, just stop (don't auto-send)
                    stopRecordingAndSend(continueListening: false)
                }
            }
        }
        .onChange(of: isStarted) { _, started in
            // Auto-start recording in voice mode after host greets
            if started && inputModeService.currentMode == .voice && !isRecording {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    startContinuousListening()
                }
            }
        }
        .onChange(of: tts.isSpeaking) { _, speaking in
            // Pause recording while TTS is speaking (to avoid capturing it)
            if inputModeService.currentMode == .voice {
                if speaking && isRecording {
                    // Pause recording
                    speechRecognizer.stopTranscribing()
                    isRecording = false
                } else if !speaking && !isRecording && !isSending && !isComplete {
                    // Resume recording after TTS finishes
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        startContinuousListening()
                    }
                }
            }
        }
    }

    /// Starts continuous listening mode
    private func startContinuousListening() {
        guard inputModeService.currentMode == .voice else { return }
        guard !isRecording && !tts.isSpeaking && !isSending && !isComplete else { return }

        speechRecognizer.resetTranscript()
        inputText = ""
        speechRecognizer.startTranscribing()
        isRecording = true
        print("[Voice] Started continuous listening")
    }

    private func toggleRecording() {
        if isRecording {
            // Stop recording
            speechRecognizer.stopTranscribing()
            isRecording = false
        } else {
            // Start recording
            speechRecognizer.resetTranscript()
            inputText = ""
            speechRecognizer.startTranscribing()
            isRecording = true
        }
    }

    private func stopRecordingAndSend(continueListening: Bool = false) {
        guard isRecording else { return }

        speechRecognizer.stopTranscribing()
        isRecording = false

        if !inputText.isEmpty {
            Task {
                await sendMessage()
                // If continuous listening, restart after a brief delay
                if continueListening && inputModeService.currentMode == .voice && !isComplete {
                    // Don't restart immediately - wait for TTS to start playing
                    // The onChange(of: tts.isSpeaking) handler will restart after TTS finishes
                }
            }
        } else if continueListening && inputModeService.currentMode == .voice {
            // No text to send, restart listening
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                startContinuousListening()
            }
        }
    }

    private var completeBar: some View {
        Button {
            dismiss()
        } label: {
            Text("Done")
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(hostAgent?.accentColorValue ?? .blue)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding()
        .background(Color(UIColor.systemBackground))
    }

    // MARK: - Actions

    private func loadAndStart() async {
        isLoading = true
        errorMessage = nil

        // Load host agent info
        do {
            hostAgent = try await publicAgentService.fetchPublicAgent(agentId: hostAgentId)
        } catch {
            errorMessage = "Could not find agent: \(error.localizedDescription)"
            isLoading = false
            return
        }

        // Check for API key
        guard let apiKey = apiKeyService.getFirstAvailableKey() else {
            errorMessage = "No API key configured. Please add an API key in Settings."
            isLoading = false
            return
        }

        let provider = apiKeyService.getFirstAvailableProvider()?.rawValue ?? "anthropic"

        // Start orchestrated conversation
        // visitorId: Device ID for the restaurant to recognize this visitor
        // visitorUserId: Authenticated user ID for storing facts to user's global memory
        let visitorId = UIDevice.current.identifierForVendor?.uuidString
        let visitorUserId = authService.currentUser?.id  // For persistent memory storage

        do {
            try await publicAgentService.startOrchestratedSession(
                hostAgentId: hostAgentId,
                userAgents: agentStorage.agents,
                apiKey: apiKey,
                provider: provider,
                visitorId: visitorId,
                visitorUserId: visitorUserId
            ) { event in
                handleEvent(event)
            }
            isLoading = false
        } catch {
            errorMessage = "Failed to start conversation: \(error.localizedDescription)"
            isLoading = false
        }
    }

    private func handleEvent(_ event: OrchestratedSessionEvent) {
        switch event {
        case .started(let info):
            isStarted = true
            // Host agent info already loaded

        case .turn(let turn):
            thinkingAgent = nil
            withAnimation {
                turns.append(turn)
            }
            // Speak if TTS available, using appropriate voice settings
            if tts.isAvailable && turn.role != "user" {
                Task {
                    let voiceId: String
                    let speed: Double

                    if turn.role == "host" {
                        // Host agent uses host's voice settings
                        voiceId = hostAgent?.voiceId ?? ElevenLabsService.defaultVoiceId
                        speed = hostAgent?.voiceSpeed ?? ElevenLabsService.defaultSpeed
                    } else if turn.role == "agent", let agentId = turn.agentId,
                              let userAgent = agentStorage.agents.first(where: { $0.id.uuidString == agentId }) {
                        // User's agent uses that agent's voice settings
                        voiceId = userAgent.voiceId
                        speed = userAgent.voiceSpeed
                    } else {
                        // Fallback to defaults
                        voiceId = ElevenLabsService.defaultVoiceId
                        speed = ElevenLabsService.defaultSpeed
                    }

                    await tts.speak(turn.content, voiceId: voiceId, speed: speed)
                }
            }

        case .thinking(let agentId, let agentName):
            thinkingAgent = (agentId, agentName)

        case .agentJoined(let agent, _):
            if !activeAgents.contains(where: { $0.id == agent.id }) {
                withAnimation {
                    activeAgents.append(agent)
                }
            }

        case .taskCompleted(let info):
            // Update the task status in the agent storage
            // Match by either serverId (if synced) or local UUID
            if let agentUUID = UUID(uuidString: info.agentId),
               var agent = agentStorage.agents.first(where: { $0.id == agentUUID }),
               let taskIndex = agent.tasks.firstIndex(where: {
                   $0.serverId == info.taskId || $0.id.uuidString == info.taskId
               }) {
                agent.tasks[taskIndex].complete(summary: info.summary, hostAgentName: info.hostAgentName)
                agentStorage.updateAgent(agent)
                print("[TaskCompleted] Task '\(info.summary)' marked complete for \(info.agentName)")

                // Refresh contacts - the server may have updated contact info (birthday, etc.)
                Task {
                    await contactService.fetchContacts()
                    print("[TaskCompleted] Refreshed contacts after task completion")
                }
            } else {
                print("[TaskCompleted] Could not find matching task for taskId: \(info.taskId), agentId: \(info.agentId)")
            }

        case .complete:
            isComplete = true
            thinkingAgent = nil

        case .stopped:
            isComplete = true
            thinkingAgent = nil

        case .error(let message):
            errorMessage = message
            if !isStarted {
                // Fatal error during startup
            }
        }
    }

    private func sendMessage() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        isSending = true
        inputText = ""

        do {
            try await publicAgentService.sendOrchestratedMessage(text)
        } catch {
            errorMessage = "Failed to send: \(error.localizedDescription)"
        }

        isSending = false
    }
}

// MARK: - Agent Chip

private struct AgentChip: View {
    let emoji: String
    let name: String
    let color: Color
    let isHost: Bool

    var body: some View {
        HStack(spacing: 4) {
            Text(emoji)
                .font(.caption)
            Text(name)
                .font(.caption)
                .fontWeight(.medium)
            if isHost {
                Text("Host")
                    .font(.caption2)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(color.opacity(0.2))
                    .clipShape(Capsule())
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(color.opacity(0.1))
        .clipShape(Capsule())
    }
}

// MARK: - Turn Bubble

private struct OrchestratedTurnBubble: View {
    let turn: OrchestratedTurn
    let hostAgent: PublishedAgent?

    var isHost: Bool { turn.role == "host" }
    var isUser: Bool { turn.role == "user" }
    var isRightAligned: Bool { !isHost }

    var bubbleColor: Color {
        if isUser {
            return .blue
        } else if isHost {
            return hostAgent?.accentColorValue ?? .gray
        } else {
            return .green  // User's agents
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if isRightAligned {
                Spacer(minLength: 40)
            }

            // Avatar for left-aligned (host)
            if isHost {
                avatar
            }

            VStack(alignment: isHost ? .leading : .trailing, spacing: 4) {
                // Agent name
                Text(turn.agentName)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(bubbleColor)

                // Message content
                Text(turn.content)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(isHost ? Color(UIColor.secondarySystemBackground) : bubbleColor)
                    .foregroundColor(isHost ? .primary : .white)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }

            // Avatar for right-aligned (user/agents)
            if isRightAligned {
                avatar
            }

            if !isRightAligned {
                Spacer(minLength: 40)
            }
        }
    }

    private var avatar: some View {
        ZStack {
            Circle()
                .fill(bubbleColor.opacity(0.15))
                .frame(width: 32, height: 32)
            Text(turn.emoji)
                .font(.system(size: 16))
        }
    }
}

// MARK: - Preview

#Preview {
    OrchestratedChatView(hostAgentId: "test-dr-elena")
        .environmentObject(PublicAgentService.shared)
        .environmentObject(APIKeyService.shared)
        .environmentObject(AgentStorageService.shared)
        .environmentObject(AuthService.shared)
        .environmentObject(InputModeService.shared)
        .environmentObject(ContactService.shared)
}
