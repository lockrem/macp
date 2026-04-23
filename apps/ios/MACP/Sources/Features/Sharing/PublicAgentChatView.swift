import SwiftUI

/// Chat view for interacting with a public agent
struct PublicAgentChatView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var publicAgentService: PublicAgentService
    @EnvironmentObject var apiKeyService: APIKeyService

    let session: PublicAgentSession
    let agent: PublishedAgent
    let mode: PublicAgentInteractionMode
    let visitorAgent: LocalAgent?

    @State private var messages: [PublicChatMessage] = []
    @State private var inputText = ""
    @State private var isSending = false
    @State private var showEndConfirm = false
    @State private var isCompleting = false
    @State private var completionResult: SessionCompletionResponse?
    @State private var errorMessage: String?
    @FocusState private var isInputFocused: Bool

    var accentColor: Color {
        agent.accentColorValue
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            // Agent greeting
                            if messages.isEmpty && !isSending {
                                agentGreetingView
                            }

                            ForEach(messages) { message in
                                PublicChatBubble(
                                    message: message,
                                    agentName: agent.name,
                                    agentEmoji: agent.emoji,
                                    visitorAgentName: visitorAgent?.name,
                                    visitorAgentEmoji: visitorAgent?.emoji,
                                    accentColor: accentColor
                                )
                                .id(message.id)
                            }

                            if isSending {
                                typingIndicator
                            }

                            // Completion summary
                            if let result = completionResult {
                                completionSummaryView(result: result)
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

                // Input bar (disabled after completion)
                if completionResult == nil {
                    inputBar
                }
            }
            .background(Color(UIColor.systemGroupedBackground))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        Text(agent.emoji)
                            .font(.title2)
                        Text(agent.name)
                            .font(.headline)
                    }
                }

                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        if messages.isEmpty || completionResult != nil {
                            dismiss()
                        } else {
                            showEndConfirm = true
                        }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    if !messages.isEmpty && completionResult == nil {
                        Button {
                            showEndConfirm = true
                        } label: {
                            Text("Done")
                                .fontWeight(.semibold)
                                .foregroundStyle(accentColor)
                        }
                    }
                }
            }
            .confirmationDialog("End Session?", isPresented: $showEndConfirm) {
                Button("End Session", role: .destructive) {
                    Task { await completeSession() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("The agent owner will be able to see your conversation summary.")
            }
            .alert("Error", isPresented: .init(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    // MARK: - Agent Greeting

    private var agentGreetingView: some View {
        VStack(spacing: 20) {
            Spacer().frame(height: 40)

            // Avatar
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.15))
                    .frame(width: 100, height: 100)

                Text(agent.emoji)
                    .font(.system(size: 50))
            }

            // Greeting
            VStack(spacing: 8) {
                Text(agent.name)
                    .font(.title2)
                    .fontWeight(.bold)

                Text(agent.introductionGreeting)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)

                // Mode indicator
                HStack {
                    Image(systemName: mode.iconName)
                    Text(mode.displayName)
                }
                .font(.caption)
                .foregroundStyle(.tertiary)
                .padding(.top, 8)
            }

            Spacer()
        }
    }

    // MARK: - Typing Indicator

    private var typingIndicator: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(Color.gray.opacity(0.6))
                        .frame(width: 8, height: 8)
                        .scaleEffect(1.0)
                        .animation(
                            Animation.easeInOut(duration: 0.6)
                                .repeatForever()
                                .delay(Double(i) * 0.2),
                            value: isSending
                        )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(UIColor.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))

            Spacer()
        }
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        HStack(spacing: 12) {
            TextField("Message...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...4)
                .padding(12)
                .background(Color(UIColor.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .focused($isInputFocused)

            Button {
                Task { await sendMessage() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(inputText.isEmpty || isSending ? .gray : accentColor)
            }
            .disabled(inputText.isEmpty || isSending)
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(Color(UIColor.systemBackground))
    }

    // MARK: - Completion Summary

    private func completionSummaryView(result: SessionCompletionResponse) -> some View {
        VStack(spacing: 16) {
            // Success header
            HStack {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text("Session Complete")
                    .font(.headline)
            }

            // Summary
            if !result.extractedData.summary.isEmpty {
                Text(result.extractedData.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            // Stats
            HStack(spacing: 24) {
                VStack {
                    Text("\(result.messageCount)")
                        .font(.title2.weight(.bold))
                    Text("Messages")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                VStack {
                    Text("\(result.extractedData.memories.count)")
                        .font(.title2.weight(.bold))
                    Text("Memories")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                VStack {
                    Text("\(result.extractedData.completedTopics.count)")
                        .font(.title2.weight(.bold))
                    Text("Topics")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Button("Close") {
                dismiss()
            }
            .buttonStyle(.bordered)
        }
        .padding(20)
        .background(Color(UIColor.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Actions

    private func sendMessage() async {
        let content = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }

        // Check for API key
        guard let apiKey = apiKeyService.getFirstAvailableKey() else {
            errorMessage = "No API key configured. Please add an API key in Settings."
            return
        }

        let provider = apiKeyService.getFirstAvailableProvider()?.rawValue ?? "anthropic"
        let role = mode == .agentToAgent ? "visitor_agent" : "user"

        inputText = ""
        isSending = true

        // Add user message immediately
        let userMessage = PublicChatMessage(
            id: UUID().uuidString,
            role: role == "user" ? .user : .visitorAgent,
            content: content,
            isFromUser: true
        )
        messages.append(userMessage)

        do {
            let response = try await publicAgentService.sendMessage(
                agentId: session.agentId,
                sessionId: session.sessionId,
                content: content,
                role: role,
                apiKey: apiKey,
                provider: provider
            )

            // Add agent response
            let agentMessage = PublicChatMessage(
                id: response.agentMessage.id,
                role: .assistant,
                content: response.agentMessage.content,
                isFromUser: false
            )
            messages.append(agentMessage)
        } catch {
            errorMessage = error.localizedDescription
        }

        isSending = false
    }

    private func completeSession() async {
        guard let apiKey = apiKeyService.getFirstAvailableKey() else {
            errorMessage = "No API key configured."
            return
        }

        let provider = apiKeyService.getFirstAvailableProvider()?.rawValue ?? "anthropic"

        isCompleting = true

        do {
            let result = try await publicAgentService.completeSession(
                agentId: session.agentId,
                sessionId: session.sessionId,
                apiKey: apiKey,
                provider: provider
            )
            completionResult = result
        } catch {
            errorMessage = error.localizedDescription
        }

        isCompleting = false
    }
}

// MARK: - Chat Message Model

struct PublicChatMessage: Identifiable {
    let id: String
    let role: MessageRole
    let content: String
    let isFromUser: Bool

    enum MessageRole {
        case user
        case assistant
        case visitorAgent
        case system
    }
}

// MARK: - Chat Bubble

private struct PublicChatBubble: View {
    let message: PublicChatMessage
    let agentName: String
    let agentEmoji: String
    let visitorAgentName: String?
    let visitorAgentEmoji: String?
    let accentColor: Color

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if message.isFromUser {
                Spacer(minLength: 60)
            } else {
                // Agent avatar
                Text(agentEmoji)
                    .font(.title3)
            }

            VStack(alignment: message.isFromUser ? .trailing : .leading, spacing: 4) {
                // Sender label for agent-to-agent mode
                if message.role == .visitorAgent, let name = visitorAgentName {
                    HStack(spacing: 4) {
                        if let emoji = visitorAgentEmoji {
                            Text(emoji)
                        }
                        Text(name)
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                Text(message.content)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(
                        message.isFromUser
                            ? accentColor
                            : Color(UIColor.secondarySystemBackground)
                    )
                    .foregroundStyle(message.isFromUser ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }

            if !message.isFromUser {
                Spacer(minLength: 60)
            } else if message.role == .visitorAgent, let emoji = visitorAgentEmoji {
                Text(emoji)
                    .font(.title3)
            }
        }
    }
}

// MARK: - API Key Service Extension

extension APIKeyService {
    func getFirstAvailableKey() -> String? {
        if hasKey(for: .anthropic), let key = getAnthropicKey() {
            return key
        }
        if hasKey(for: .openai), let key = getOpenAIKey() {
            return key
        }
        if hasKey(for: .gemini), let key = getGeminiKey() {
            return key
        }
        if hasKey(for: .groq), let key = getGroqKey() {
            return key
        }
        return nil
    }

    func getFirstAvailableProvider() -> AgentProvider? {
        if hasKey(for: .anthropic) { return .anthropic }
        if hasKey(for: .openai) { return .openai }
        if hasKey(for: .gemini) { return .gemini }
        if hasKey(for: .groq) { return .groq }
        return nil
    }
}
