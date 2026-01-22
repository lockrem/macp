import SwiftUI

struct SoloChatView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var apiKeyService: APIKeyService

    let agent: LocalAgent

    @State private var conversationId: String?
    @State private var messages: [ChatMessage] = []
    @State private var inputText = ""
    @State private var isLoading = false
    @State private var isSending = false
    @State private var showEndConfirm = false
    @State private var factsExtracted: Int?
    @State private var errorMessage: String?
    @FocusState private var isInputFocused: Bool

    var accentColor: Color {
        switch agent.accentColorName {
        case "red": return .red
        case "orange": return .orange
        case "green": return .green
        case "purple": return .purple
        case "cyan": return .cyan
        case "pink": return .pink
        default: return .blue
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            // Agent greeting
                            if messages.isEmpty && !isLoading {
                                agentGreetingView
                            }

                            ForEach(messages) { message in
                                ChatBubble(message: message, agent: agent, accentColor: accentColor)
                                    .id(message.id)
                            }

                            if isSending {
                                typingIndicator
                            }

                            // Extracted facts notification
                            if let count = factsExtracted {
                                factsExtractedBanner(count: count)
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

                // Input bar
                inputBar
            }
            .background(Color(.systemGroupedBackground))
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
                        if messages.isEmpty {
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
                    if !messages.isEmpty {
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
            .confirmationDialog("End Conversation?", isPresented: $showEndConfirm) {
                Button("End & Save", role: .destructive) {
                    Task { await endConversation() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Your agent will remember what you discussed.")
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

                Text(agent.greeting)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            // Suggestion chips
            suggestionChips

            Spacer()
        }
    }

    private var suggestionChips: some View {
        let suggestions = suggestionsForAgent()

        return VStack(spacing: 8) {
            Text("Try saying...")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .padding(.top, 20)

            FlowLayout(spacing: 8) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        inputText = suggestion
                        Task { await sendMessage() }
                    } label: {
                        Text(suggestion)
                            .font(.subheadline)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(accentColor.opacity(0.1))
                            .foregroundStyle(accentColor)
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal)
        }
    }

    private func suggestionsForAgent() -> [String] {
        // Generate suggestions based on agent type
        if agent.name.lowercased().contains("health") {
            return ["I've been feeling tired lately", "Update my medications", "Log today's symptoms"]
        } else if agent.name.lowercased().contains("fitness") {
            return ["I worked out today", "What should I eat?", "I hit my step goal!"]
        } else if agent.name.lowercased().contains("work") {
            return ["What's on my calendar?", "I finished a big project", "Help me prioritize"]
        } else if agent.name.lowercased().contains("money") {
            return ["I made a purchase today", "How's my budget?", "I got paid today"]
        } else if agent.name.lowercased().contains("journal") {
            return ["How was my day?", "I'm grateful for...", "Something's on my mind"]
        } else {
            return ["Tell me about yourself", "What can you help with?", "Let's chat!"]
        }
    }

    // MARK: - Typing Indicator

    private var typingIndicator: some View {
        HStack(alignment: .bottom, spacing: 12) {
            // Agent avatar
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.15))
                    .frame(width: 32, height: 32)
                Text(agent.emoji)
                    .font(.system(size: 16))
            }

            // Typing dots
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

    @State private var typingAnimationOffset: CGFloat = 0

    private func typingAnimation(for index: Int) -> CGFloat {
        let delay = Double(index) * 0.15
        return sin((Date().timeIntervalSinceReferenceDate + delay) * 5) * 4
    }

    // MARK: - Facts Extracted Banner

    private func factsExtractedBanner(count: Int) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "brain.head.profile")
                .foregroundStyle(accentColor)

            VStack(alignment: .leading, spacing: 2) {
                Text("Memory Updated")
                    .font(.subheadline)
                    .fontWeight(.semibold)

                Text("\(count) new \(count == 1 ? "thing" : "things") remembered")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.05), radius: 5)
        )
        .padding(.horizontal)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        HStack(spacing: 12) {
            TextField("Message \(agent.name)...", text: $inputText, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 24))
                .focused($isInputFocused)

            Button {
                Task { await sendMessage() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(inputText.isEmpty ? Color.secondary : accentColor)
            }
            .disabled(inputText.isEmpty || isSending)
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - API Methods

    private func startConversation() async {
        isLoading = true
        defer { isLoading = false }

        guard let apiKey = apiKeyService.getKey(for: agent.provider.rawValue) else {
            errorMessage = "Please configure your \(agent.provider.displayName) API key in Settings"
            return
        }

        // Create the conversation via API
        let result = await MemoryService.shared.createSoloConversation(
            agent: agent,
            apiKey: apiKey,
            topic: "Chat with \(agent.name)",
            memoryCategories: nil, // Load all available
            extractFacts: true
        )

        if let conversation = result {
            conversationId = conversation.id
        } else {
            errorMessage = "Failed to start conversation. Please try again."
        }
    }

    private func sendMessage() async {
        guard !inputText.isEmpty, let conversationId = conversationId else { return }

        let userMessage = inputText
        inputText = ""
        isSending = true

        // Add user message immediately
        let userChatMessage = ChatMessage(
            id: UUID().uuidString,
            content: userMessage,
            isFromUser: true,
            timestamp: Date()
        )
        withAnimation {
            messages.append(userChatMessage)
        }

        // Send to API and get response
        if let response = await MemoryService.shared.sendSoloMessage(
            conversationId: conversationId,
            content: userMessage
        ) {
            let agentChatMessage = ChatMessage(
                id: response.agentMessage.id,
                content: response.agentMessage.content,
                isFromUser: false,
                timestamp: Date()
            )
            withAnimation {
                messages.append(agentChatMessage)
            }
        } else {
            // Error - show message
            let errorChatMessage = ChatMessage(
                id: UUID().uuidString,
                content: "Sorry, I couldn't process that. Can you try again?",
                isFromUser: false,
                timestamp: Date()
            )
            withAnimation {
                messages.append(errorChatMessage)
            }
        }

        isSending = false
    }

    private func endConversation() async {
        guard let conversationId = conversationId else {
            dismiss()
            return
        }

        isLoading = true

        if let result = await MemoryService.shared.endSoloConversation(conversationId: conversationId) {
            if let extracted = result.factsExtracted {
                withAnimation {
                    factsExtracted = extracted.totalFacts
                }
                // Wait a moment to show the banner
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }

        dismiss()
    }
}

// MARK: - Chat Message Model

struct ChatMessage: Identifiable {
    let id: String
    let content: String
    let isFromUser: Bool
    let timestamp: Date
}

// MARK: - Chat Bubble

struct ChatBubble: View {
    let message: ChatMessage
    let agent: LocalAgent
    let accentColor: Color

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.isFromUser {
                Spacer(minLength: 60)
            } else {
                // Agent avatar
                ZStack {
                    Circle()
                        .fill(accentColor.opacity(0.15))
                        .frame(width: 32, height: 32)
                    Text(agent.emoji)
                        .font(.system(size: 16))
                }
            }

            Text(message.content)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(message.isFromUser ? accentColor : Color(.systemBackground))
                .foregroundStyle(message.isFromUser ? .white : .primary)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .shadow(color: .black.opacity(0.05), radius: 2)

            if !message.isFromUser {
                Spacer(minLength: 60)
            }
        }
    }
}

// MARK: - Flow Layout (for suggestion chips)

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(in: proposal.width ?? 0, subviews: subviews, spacing: spacing)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(in: bounds.width, subviews: subviews, spacing: spacing)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.positions[index].x,
                                       y: bounds.minY + result.positions[index].y),
                          proposal: .unspecified)
        }
    }

    struct FlowResult {
        var size: CGSize = .zero
        var positions: [CGPoint] = []

        init(in maxWidth: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var x: CGFloat = 0
            var y: CGFloat = 0
            var rowHeight: CGFloat = 0

            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)

                if x + size.width > maxWidth && x > 0 {
                    x = 0
                    y += rowHeight + spacing
                    rowHeight = 0
                }

                positions.append(CGPoint(x: x, y: y))
                rowHeight = max(rowHeight, size.height)
                x += size.width + spacing
            }

            self.size = CGSize(width: maxWidth, height: y + rowHeight)
        }
    }
}

#Preview {
    SoloChatView(agent: LocalAgent(
        name: "Health Buddy",
        description: "Your health companion",
        emoji: "🏥",
        personality: "caring and supportive",
        greeting: "Hi! How are you feeling today?",
        accentColorName: "red"
    ))
    .environmentObject(APIKeyService.shared)
}
