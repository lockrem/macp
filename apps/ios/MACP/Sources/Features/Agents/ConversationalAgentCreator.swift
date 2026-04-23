import SwiftUI

/// Conversational agent creation - feels like chatting with an assistant
struct ConversationalAgentCreator: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService

    // Agent properties being built
    @State private var agentName = ""
    @State private var agentEmoji = ""
    @State private var agentPersonality = ""
    @State private var agentGreeting = ""
    @State private var agentColor = "blue"
    @State private var agentProvider: AgentProvider = .anthropic

    // Conversation state
    @State private var messages: [CreatorMessage] = []
    @State private var currentStep: CreationStep = .welcome
    @State private var inputText = ""
    @State private var isTyping = false
    @State private var showQuickReplies = false
    @FocusState private var isInputFocused: Bool

    enum CreationStep: Int, CaseIterable {
        case welcome
        case askName
        case askEmoji
        case askPersonality
        case askGreeting
        case askColor
        case askProvider
        case preview
        case complete
    }

    struct CreatorMessage: Identifiable {
        let id = UUID()
        let content: String
        let isFromAssistant: Bool
        let quickReplies: [QuickReply]?
        let showPreview: Bool

        init(content: String, isFromAssistant: Bool, quickReplies: [QuickReply]? = nil, showPreview: Bool = false) {
            self.content = content
            self.isFromAssistant = isFromAssistant
            self.quickReplies = quickReplies
            self.showPreview = showPreview
        }
    }

    struct QuickReply: Identifiable {
        let id = UUID()
        let label: String
        let value: String
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(messages) { message in
                                CreatorMessageBubble(message: message, onQuickReply: handleQuickReply)
                                    .id(message.id)
                            }

                            if isTyping {
                                CreatorTypingIndicator()
                                    .id("typing")
                            }
                        }
                        .padding()
                    }
                    .onChange(of: messages.count) { _, _ in
                        withAnimation {
                            if let lastId = messages.last?.id {
                                proxy.scrollTo(lastId, anchor: .bottom)
                            } else {
                                proxy.scrollTo("typing", anchor: .bottom)
                            }
                        }
                    }
                    .onChange(of: isTyping) { _, newValue in
                        if newValue {
                            withAnimation {
                                proxy.scrollTo("typing", anchor: .bottom)
                            }
                        }
                    }
                }

                // Input area (hidden during quick reply steps)
                if shouldShowInput {
                    inputArea
                }
            }
            .background(Color(UIColor.systemGroupedBackground))
            .navigationTitle("Create Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                if currentStep == .preview {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Create") {
                            createAgent()
                        }
                        .fontWeight(.semibold)
                    }
                }
            }
            .onAppear {
                startConversation()
            }
        }
    }

    private var shouldShowInput: Bool {
        switch currentStep {
        case .askEmoji, .askColor, .askProvider, .preview, .complete, .welcome:
            return false
        default:
            return true
        }
    }

    private var inputArea: some View {
        HStack(spacing: 12) {
            TextField(inputPlaceholder, text: $inputText)
                .textFieldStyle(.plain)
                .padding(12)
                .background(Color(UIColor.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .focused($isInputFocused)
                .onSubmit {
                    submitInput()
                }

            Button(action: submitInput) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title)
                    .foregroundStyle(inputText.isEmpty ? .gray : .orange)
            }
            .disabled(inputText.isEmpty)
        }
        .padding()
        .background(Color(UIColor.systemBackground))
    }

    private var inputPlaceholder: String {
        switch currentStep {
        case .askName: return "Enter a name..."
        case .askPersonality: return "Describe their personality..."
        case .askGreeting: return "How should they greet you?"
        default: return "Type a message..."
        }
    }

    // MARK: - Conversation Flow

    private func startConversation() {
        Task {
            await addAssistantMessage("Hi! I'm here to help you create your perfect AI companion. Let's make this fun!")
            try? await Task.sleep(for: .milliseconds(800))
            await advanceToStep(.askName)
        }
    }

    private func advanceToStep(_ step: CreationStep) async {
        currentStep = step

        switch step {
        case .welcome:
            break

        case .askName:
            await addAssistantMessage("First things first - what would you like to call your new agent?")
            isInputFocused = true

        case .askEmoji:
            let emojis = ["🤖", "🏥", "💪", "💼", "💰", "📚", "🎯", "🧘", "🎨", "🍎", "✈️", "🏠", "🐕", "🌟", "🔮"]
            let quickReplies = emojis.map { QuickReply(label: $0, value: $0) }
            await addAssistantMessage("Nice to meet \(agentName)! Now pick an emoji that represents them:", quickReplies: quickReplies)

        case .askPersonality:
            await addAssistantMessage("What kind of personality should \(agentEmoji) \(agentName) have? For example: \"friendly and encouraging\" or \"professional and concise\"")
            isInputFocused = true

        case .askGreeting:
            await addAssistantMessage("How should \(agentName) greet you when you start a conversation?")
            isInputFocused = true

        case .askColor:
            let colors: [(String, String)] = [
                ("Blue", "blue"), ("Orange", "orange"), ("Green", "green"),
                ("Purple", "purple"), ("Red", "red"), ("Cyan", "cyan"), ("Pink", "pink")
            ]
            let quickReplies = colors.map { QuickReply(label: $0.0, value: $0.1) }
            await addAssistantMessage("Almost done! Pick a color theme for \(agentName):", quickReplies: quickReplies)

        case .askProvider:
            var providers: [(String, String)] = []
            if apiKeyService.hasAnthropicKey { providers.append(("Claude (Anthropic)", "anthropic")) }
            if apiKeyService.hasOpenAIKey { providers.append(("GPT (OpenAI)", "openai")) }
            if apiKeyService.hasGeminiKey { providers.append(("Gemini (Google)", "gemini")) }
            if apiKeyService.hasGroqKey { providers.append(("Groq", "groq")) }

            if providers.isEmpty {
                // Default to anthropic if no keys configured
                agentProvider = .anthropic
                await advanceToStep(.preview)
            } else if providers.count == 1 {
                // Auto-select if only one provider
                agentProvider = AgentProvider(rawValue: providers[0].1) ?? .anthropic
                await advanceToStep(.preview)
            } else {
                let quickReplies = providers.map { QuickReply(label: $0.0, value: $0.1) }
                await addAssistantMessage("Which AI provider should power \(agentName)?", quickReplies: quickReplies)
            }

        case .preview:
            await addAssistantMessage("Here's your new agent! Tap 'Create' when you're ready.", showPreview: true)

        case .complete:
            break
        }
    }

    private func submitInput() {
        guard !inputText.isEmpty else { return }

        let text = inputText
        inputText = ""

        Task {
            // Add user message
            await addUserMessage(text)

            // Process based on current step
            switch currentStep {
            case .askName:
                agentName = text.trimmingCharacters(in: .whitespacesAndNewlines)
                try? await Task.sleep(for: .milliseconds(500))
                await advanceToStep(.askEmoji)

            case .askPersonality:
                agentPersonality = text.trimmingCharacters(in: .whitespacesAndNewlines)
                try? await Task.sleep(for: .milliseconds(500))
                await advanceToStep(.askGreeting)

            case .askGreeting:
                agentGreeting = text.trimmingCharacters(in: .whitespacesAndNewlines)
                try? await Task.sleep(for: .milliseconds(500))
                await advanceToStep(.askColor)

            default:
                break
            }
        }
    }

    private func handleQuickReply(_ reply: QuickReply) {
        Task {
            await addUserMessage(reply.label)

            switch currentStep {
            case .askEmoji:
                agentEmoji = reply.value
                try? await Task.sleep(for: .milliseconds(500))
                await advanceToStep(.askPersonality)

            case .askColor:
                agentColor = reply.value
                try? await Task.sleep(for: .milliseconds(500))
                await advanceToStep(.askProvider)

            case .askProvider:
                agentProvider = AgentProvider(rawValue: reply.value) ?? .anthropic
                try? await Task.sleep(for: .milliseconds(500))
                await advanceToStep(.preview)

            default:
                break
            }
        }
    }

    @MainActor
    private func addAssistantMessage(_ content: String, quickReplies: [QuickReply]? = nil, showPreview: Bool = false) async {
        isTyping = true
        try? await Task.sleep(for: .milliseconds(600))
        isTyping = false

        withAnimation(.spring(response: 0.3)) {
            messages.append(CreatorMessage(
                content: content,
                isFromAssistant: true,
                quickReplies: quickReplies,
                showPreview: showPreview
            ))
        }
    }

    @MainActor
    private func addUserMessage(_ content: String) async {
        withAnimation(.spring(response: 0.3)) {
            messages.append(CreatorMessage(content: content, isFromAssistant: false))
        }
    }

    private func createAgent() {
        let agent = LocalAgent(
            name: agentName,
            description: agentPersonality,
            provider: agentProvider,
            emoji: agentEmoji,
            personality: agentPersonality,
            greeting: agentGreeting,
            accentColorName: agentColor
        )

        agentStorage.addAgent(agent)
        Task { await SettingsSyncService.shared.syncAgents() }
        dismiss()
    }
}

// MARK: - Message Bubble

private struct CreatorMessageBubble: View {
    let message: ConversationalAgentCreator.CreatorMessage
    let onQuickReply: (ConversationalAgentCreator.QuickReply) -> Void

    var body: some View {
        VStack(alignment: message.isFromAssistant ? .leading : .trailing, spacing: 8) {
            HStack {
                if message.isFromAssistant {
                    // Assistant avatar
                    ZStack {
                        Circle()
                            .fill(Color.orange.opacity(0.15))
                            .frame(width: 32, height: 32)
                        Text("🎨")
                            .font(.system(size: 16))
                    }
                }

                if !message.isFromAssistant {
                    Spacer()
                }

                Text(message.content)
                    .padding(12)
                    .background(message.isFromAssistant ? Color(UIColor.secondarySystemBackground) : Color.orange)
                    .foregroundColor(message.isFromAssistant ? .primary : .white)
                    .clipShape(RoundedRectangle(cornerRadius: 16))

                if message.isFromAssistant {
                    Spacer()
                }
            }

            // Quick replies
            if let quickReplies = message.quickReplies {
                quickRepliesView(quickReplies)
            }

            // Agent preview
            if message.showPreview {
                AgentPreviewCard()
                    .padding(.top, 8)
            }
        }
    }

    @ViewBuilder
    private func quickRepliesView(_ replies: [ConversationalAgentCreator.QuickReply]) -> some View {
        // Check if these are emojis (single character replies)
        let isEmojiPicker = replies.first?.label.count == 1

        if isEmojiPicker {
            // Grid for emojis
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5), spacing: 8) {
                ForEach(replies) { reply in
                    Button {
                        onQuickReply(reply)
                    } label: {
                        Text(reply.label)
                            .font(.title)
                            .frame(width: 44, height: 44)
                            .background(Color(UIColor.secondarySystemBackground))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
            .padding(.leading, 40)
        } else {
            // Horizontal scroll for text options
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(replies) { reply in
                        Button {
                            onQuickReply(reply)
                        } label: {
                            Text(reply.label)
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(Color.orange.opacity(0.1))
                                .foregroundStyle(.orange)
                                .clipShape(Capsule())
                        }
                    }
                }
                .padding(.leading, 40)
            }
        }
    }
}

// MARK: - Typing Indicator

private struct CreatorTypingIndicator: View {
    @State private var animationPhase = 0

    var body: some View {
        HStack {
            ZStack {
                Circle()
                    .fill(Color.orange.opacity(0.15))
                    .frame(width: 32, height: 32)
                Text("🎨")
                    .font(.system(size: 16))
            }

            HStack(spacing: 4) {
                ForEach(0..<3) { index in
                    Circle()
                        .fill(Color.secondary)
                        .frame(width: 8, height: 8)
                        .opacity(animationPhase == index ? 1.0 : 0.4)
                }
            }
            .padding(12)
            .background(Color(UIColor.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))

            Spacer()
        }
        .onAppear {
            startAnimation()
        }
    }

    private func startAnimation() {
        Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { _ in
            withAnimation(.easeInOut(duration: 0.2)) {
                animationPhase = (animationPhase + 1) % 3
            }
        }
    }
}

// MARK: - Agent Preview Card

private struct AgentPreviewCard: View {
    @EnvironmentObject var agentStorage: AgentStorageService

    var body: some View {
        // Access parent's state through environment or binding
        // For now, show a placeholder that will be populated
        PreviewCardContent()
    }
}

private struct PreviewCardContent: View {
    var body: some View {
        VStack(spacing: 16) {
            Text("Your agent is ready!")
                .font(.headline)

            Text("Tap 'Create' in the top right to add them to your team.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color(UIColor.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.leading, 40)
    }
}

// MARK: - Preview

#Preview {
    ConversationalAgentCreator()
        .environmentObject(AgentStorageService.shared)
        .environmentObject(APIKeyService.shared)
}
