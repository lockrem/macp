import SwiftUI

/// View that displays an autonomous agent-to-agent conversation in real-time
struct AutonomousAgentChatView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var publicAgentService: PublicAgentService
    @EnvironmentObject var apiKeyService: APIKeyService
    @StateObject private var tts = ElevenLabsService.shared

    // Input
    let hostAgent: PublishedAgent
    let visitorAgent: LocalAgent
    let visitorContext: String?

    // State
    @State private var turns: [AutonomousTurn] = []
    @State private var isStarted = false
    @State private var isComplete = false
    @State private var completion: AutonomousSessionComplete?
    @State private var thinkingAgent: String?
    @State private var isSummarizing = false
    @State private var errorMessage: String?
    @State private var showStopConfirm = false
    @State private var interjectionText = ""
    @State private var isSendingInterjection = false
    @State private var wasStopped = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Agent header
                agentHeader

                // Messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            // Initial status
                            if !isStarted && turns.isEmpty {
                                startingView
                            }

                            // Conversation turns
                            ForEach(turns) { turn in
                                AutonomousTurnBubble(
                                    turn: turn,
                                    hostAgent: hostAgent,
                                    visitorAgent: visitorAgent
                                )
                                .id(turn.id)
                            }

                            // Thinking indicator
                            if let thinking = thinkingAgent {
                                thinkingIndicator(for: thinking)
                            }

                            // Summarizing indicator
                            if isSummarizing {
                                summarizingIndicator
                            }

                            // Stopped indicator
                            if wasStopped {
                                stoppedIndicator
                            }

                            // Completion summary
                            if let completion = completion {
                                completionSummaryView(completion)
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

                // Bottom bar
                if !isComplete {
                    bottomBar
                } else {
                    doneBar
                }
            }
            .background(Color(UIColor.systemGroupedBackground))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Agent Conversation")
                        .font(.headline)
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
            }
            .confirmationDialog("Stop Conversation?", isPresented: $showStopConfirm) {
                Button("Stop", role: .destructive) {
                    Task {
                        try? await publicAgentService.stopAutonomousSession()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("The conversation will end without a summary.")
            }
            .onDisappear {
                publicAgentService.disconnectWebSocket()
            }
            .alert("Error", isPresented: .init(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
            .task {
                await startConversation()
            }
        }
    }

    // MARK: - Subviews

    private var agentHeader: some View {
        HStack(spacing: 20) {
            // Host agent
            VStack(spacing: 4) {
                ZStack {
                    Circle()
                        .fill(hostAgent.accentColorValue.opacity(0.15))
                        .frame(width: 50, height: 50)
                    Text(hostAgent.emoji)
                        .font(.title2)
                }
                Text(hostAgent.name)
                    .font(.caption)
                    .lineLimit(1)
            }

            // Connection indicator
            Image(systemName: "arrow.left.arrow.right")
                .font(.title3)
                .foregroundStyle(.secondary)

            // Visitor agent
            VStack(spacing: 4) {
                ZStack {
                    Circle()
                        .fill(Color.blue.opacity(0.15))
                        .frame(width: 50, height: 50)
                    Text(visitorAgent.emoji)
                        .font(.title2)
                }
                Text(visitorAgent.name)
                    .font(.caption)
                    .lineLimit(1)
            }
        }
        .padding()
        .background(Color(UIColor.systemBackground))
    }

    private var startingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)

            Text("Starting conversation...")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if let context = visitorContext {
                Text("\"\(context)\"")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
        }
        .padding(.vertical, 40)
    }

    private func thinkingIndicator(for agent: String) -> some View {
        HStack {
            if agent == "host" {
                Spacer().frame(width: 20)
            } else {
                Spacer()
            }

            HStack(spacing: 4) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(Color.gray.opacity(0.6))
                        .frame(width: 8, height: 8)
                        .scaleEffect(1.0)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(UIColor.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))

            if agent == "visitor" {
                Spacer().frame(width: 20)
            } else {
                Spacer()
            }
        }
    }

    private var summarizingIndicator: some View {
        HStack(spacing: 12) {
            ProgressView()
            Text("Summarizing conversation...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(Color(UIColor.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var stoppedIndicator: some View {
        HStack(spacing: 12) {
            Image(systemName: "stop.circle.fill")
                .foregroundStyle(.orange)
            Text("Conversation stopped")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(Color(UIColor.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func completionSummaryView(_ completion: AutonomousSessionComplete) -> some View {
        VStack(spacing: 16) {
            // Success header
            HStack {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text("Conversation Complete")
                    .font(.headline)
            }

            // Summary
            if !completion.summary.isEmpty {
                Text(completion.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            // Facts learned
            if !completion.factsLearned.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("What your agent learned:")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(.secondary)

                    ForEach(completion.factsLearned, id: \.self) { fact in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "lightbulb.fill")
                                .font(.caption)
                                .foregroundStyle(.yellow)
                            Text(fact)
                                .font(.subheadline)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            // Questions answered
            if !completion.questionsAnswered.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Questions answered:")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(.secondary)

                    ForEach(completion.questionsAnswered, id: \.self) { question in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.caption)
                                .foregroundStyle(.green)
                            Text(question)
                                .font(.subheadline)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            // Stats
            HStack(spacing: 24) {
                VStack {
                    Text("\(completion.totalTurns)")
                        .font(.title2.weight(.bold))
                    Text("Turns")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                VStack {
                    Text("\(completion.factsLearned.count)")
                        .font(.title2.weight(.bold))
                    Text("Facts")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                VStack {
                    Text("\(completion.questionsAnswered.count)")
                        .font(.title2.weight(.bold))
                    Text("Answered")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(20)
        .background(Color(UIColor.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var bottomBar: some View {
        VStack(spacing: 8) {
            // Interject input row
            HStack(spacing: 8) {
                TextField("Interject...", text: $interjectionText)
                    .textFieldStyle(.roundedBorder)
                    .disabled(isSendingInterjection)

                Button {
                    Task {
                        await sendInterjection()
                    }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundStyle(interjectionText.isEmpty ? .gray : hostAgent.accentColorValue)
                }
                .disabled(interjectionText.isEmpty || isSendingInterjection)
            }

            // Turn counter and stop button row
            HStack {
                Text("Turn \(turns.count) of ~10")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Button {
                    showStopConfirm = true
                } label: {
                    Text("Stop Early")
                        .font(.subheadline)
                        .foregroundStyle(.red)
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(Color(UIColor.systemBackground))
    }

    private var doneBar: some View {
        Button {
            dismiss()
        } label: {
            Text("Done")
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(hostAgent.accentColorValue)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding()
        .background(Color(UIColor.systemBackground))
    }

    // MARK: - Actions

    private func startConversation() async {
        guard let apiKey = apiKeyService.getFirstAvailableKey() else {
            errorMessage = "No API key configured. Please add an API key in Settings."
            return
        }

        let provider = apiKeyService.getFirstAvailableProvider()?.rawValue ?? "anthropic"

        do {
            try await publicAgentService.startAutonomousSession(
                hostAgentId: hostAgent.agentId,
                visitorAgent: visitorAgent,
                visitorQuestions: visitorAgent.introductionQuestions.map { $0.question },
                visitorContext: visitorContext,
                apiKey: apiKey,
                provider: provider,
                maxTurns: 10
            ) { event in
                handleEvent(event)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func handleEvent(_ event: AutonomousSessionEvent) {
        switch event {
        case .started:
            isStarted = true

        case .turn(let turn):
            thinkingAgent = nil
            withAnimation {
                turns.append(turn)
            }
            // Speak the turn if TTS is available
            if tts.isAvailable {
                Task {
                    await tts.speak(turn.content)
                }
            }

        case .thinking(let agent):
            thinkingAgent = agent

        case .summarizing:
            thinkingAgent = nil
            isSummarizing = true

        case .complete(let result):
            isSummarizing = false
            isComplete = true
            completion = result

        case .stopped:
            thinkingAgent = nil
            isSummarizing = false
            wasStopped = true
            isComplete = true

        case .error(let message):
            errorMessage = message
            isComplete = true
        }
    }

    private func sendInterjection() async {
        let text = interjectionText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        isSendingInterjection = true
        interjectionText = ""

        do {
            try await publicAgentService.sendInterjection(text)
        } catch {
            errorMessage = "Failed to send: \(error.localizedDescription)"
        }

        isSendingInterjection = false
    }
}

// MARK: - Turn Bubble

private struct AutonomousTurnBubble: View {
    let turn: AutonomousTurn
    let hostAgent: PublishedAgent
    let visitorAgent: LocalAgent

    var isHost: Bool { turn.role == "host" }
    var isUser: Bool { turn.role == "user" }
    var isRightAligned: Bool { !isHost }  // Visitor and user on right side

    var bubbleColor: Color {
        if isUser {
            return .green
        } else if isHost {
            return hostAgent.accentColorValue
        } else {
            return .blue
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if isRightAligned {
                Spacer(minLength: 40)
            }

            // Avatar for host (left side)
            if isHost {
                ZStack {
                    Circle()
                        .fill(bubbleColor.opacity(0.15))
                        .frame(width: 32, height: 32)
                    Text(turn.emoji)
                        .font(.system(size: 16))
                }
            }

            VStack(alignment: isHost ? .leading : .trailing, spacing: 4) {
                // Agent/user name
                HStack(spacing: 4) {
                    if isUser {
                        Image(systemName: "hand.raised.fill")
                            .font(.caption2)
                            .foregroundStyle(.green)
                    }
                    Text(turn.agentName)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(bubbleColor)
                }

                // Message content
                Text(turn.content)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(isHost ? Color(UIColor.secondarySystemBackground) : bubbleColor)
                    .foregroundColor(isHost ? .primary : .white)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }

            // Avatar for visitor/user (right side)
            if isRightAligned {
                ZStack {
                    Circle()
                        .fill(bubbleColor.opacity(0.15))
                        .frame(width: 32, height: 32)
                    Text(turn.emoji)
                        .font(.system(size: 16))
                }
            }

            if !isRightAligned {
                Spacer(minLength: 40)
            }
        }
    }
}

// MARK: - Preview

#Preview {
    AutonomousAgentChatView(
        hostAgent: PublishedAgent(
            agentId: "test-host",
            ownerName: "Test Owner",
            name: "Dr. Smith's Agent",
            emoji: "🏥",
            description: "Medical intake assistant",
            greeting: "Welcome!",
            accentColor: "red",
            introductionGreeting: "Hi! I'm here to help.",
            allowDirectChat: true,
            allowAgentToAgent: true,
            allowAccompaniedChat: true,
            viewCount: 0,
            voiceId: nil,
            voiceSpeed: nil
        ),
        visitorAgent: LocalAgent(
            name: "My Assistant",
            emoji: "🤖",
            personality: "helpful and curious"
        ),
        visitorContext: "Ask about appointment availability"
    )
    .environmentObject(PublicAgentService.shared)
    .environmentObject(APIKeyService.shared)
}
