import SwiftUI

struct SoloChatView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var agentStorage: AgentStorageService
    @StateObject private var tts = ElevenLabsService.shared

    let agent: LocalAgent

    @State private var conversationId: String?
    @State private var messages: [ChatMessage] = []
    @State private var inputText = ""
    @State private var isLoading = false
    @State private var isSending = false
    @State private var showEndConfirm = false
    @State private var factsExtracted: Int?
    @State private var errorMessage: String?
    @State private var queuedTask: AgentTask?
    @FocusState private var isInputFocused: Bool

    // Context tracking for multi-turn conversations
    @State private var pendingOriginalRequest: String?      // The original request waiting for clarification
    @State private var pendingPersonName: String?           // Person we're asking about
    @State private var awaitingRelationshipClarification = false

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
                                SoloChatBubble(message: message, agent: agent, accentColor: accentColor)
                                    .id(message.id)
                            }

                            if isSending {
                                typingIndicator
                            }

                            // Extracted facts notification
                            if let count = factsExtracted {
                                factsExtractedBanner(count: count)
                            }

                            // Task queued notification
                            if let task = queuedTask {
                                taskQueuedBanner(task: task)
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

    // MARK: - Task Queued Banner

    private func taskQueuedBanner(task: AgentTask) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "checklist.checked")
                .foregroundStyle(.orange)

            VStack(alignment: .leading, spacing: 2) {
                Text("Task Queued")
                    .font(.subheadline)
                    .fontWeight(.semibold)

                Text(task.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer()

            Image(systemName: "clock.fill")
                .foregroundStyle(.orange)
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.05), radius: 5)
        )
        .padding(.horizontal)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .onAppear {
            // Auto-dismiss after 4 seconds
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                withAnimation {
                    queuedTask = nil
                }
            }
        }
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
                .toolbar {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Done") {
                            isInputFocused = false
                        }
                    }
                }

            Button {
                Task { await sendMessage() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(inputText.isEmpty ? Color.secondary : accentColor)
            }
            .disabled(inputText.isEmpty || isSending)

            // Stop speaking button
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

    // MARK: - API Methods

    private func startConversation() async {
        isLoading = true
        defer { isLoading = false }

        guard let apiKey = apiKeyService.getKey(for: agent.provider.rawValue) else {
            errorMessage = "Please configure your \(agent.provider.displayName) API key in Settings"
            return
        }

        // Create enhanced agent with task-aware system prompt
        var taskAwareAgent = agent

        // Build a complete system prompt with task awareness as a RULE, not just personality
        let taskAwareSystemPrompt = """
        You are \(agent.name), a personal AI assistant.

        Your personality: \(agent.personality)

        ABSOLUTE RULES - NEVER BREAK THESE:

        1. EVERY response MUST be 20 words or less. No exceptions. Count your words.

        2. You are part of the MACP agent network. When users mention tasks (reservations, bookings, appointments, etc.):
           - Simply acknowledge it naturally like "Perfect, I've got that noted!" or "On it!"
           - The MACP system AUTOMATICALLY captures and queues tasks - you don't need to do anything special
           - NEVER say you "can't" create tasks or don't have access - just acknowledge naturally
           - NEVER recommend external apps (OpenTable, Yelp, Google, etc.)

        3. Keep responses conversational and natural despite being brief.

        Good: "Perfect! Dinner for 4 at 5:30 - I've got it noted!" (11 words)
        Good: "On it! I'll keep that reservation request in mind." (10 words)
        Bad: "I don't have access to create tasks" - NEVER say this
        Bad: Any response over 20 words, or mentioning external apps.
        """
        taskAwareAgent.customSystemPrompt = taskAwareSystemPrompt

        // Create the conversation via API
        let result = await MemoryService.shared.createSoloConversation(
            agent: taskAwareAgent,
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

        // Get API key
        let apiKey = apiKeyService.getKey(for: agent.provider.rawValue) ?? ""

        // Check if we're awaiting relationship clarification
        if awaitingRelationshipClarification, let personName = pendingPersonName, let originalRequest = pendingOriginalRequest {
            // User just told us who this person is - save as memory and return to original request
            awaitingRelationshipClarification = false
            pendingPersonName = nil
            pendingOriginalRequest = nil

            // Save the relationship as a memory
            let relationshipMemory = "\(personName) is the user's \(userMessage)"
            if var updatedAgent = agentStorage.agents.first(where: { $0.id == agent.id }) {
                // Add to personal memory store
                let memoryEntry = MemoryEntry(content: relationshipMemory, category: "personal")
                if let personalIndex = updatedAgent.memoryStores.firstIndex(where: { $0.name.lowercased() == "personal" }) {
                    updatedAgent.memoryStores[personalIndex].entries.append(memoryEntry)
                } else {
                    // Create personal store if it doesn't exist
                    let personalStore = MemoryStore(name: "Personal", description: "Personal information and relationships", entries: [memoryEntry])
                    updatedAgent.memoryStores.append(personalStore)
                }
                agentStorage.updateAgent(updatedAgent)
            }

            // Acknowledge and return to original request
            let ackMessage = ChatMessage(
                id: UUID().uuidString,
                content: "Got it, \(personName) is your \(userMessage). Now, about your question...",
                isFromUser: false,
                timestamp: Date(),
                agentName: agent.name,
                agentEmoji: agent.emoji
            )
            withAnimation {
                messages.append(ackMessage)
            }

            if tts.isAvailable {
                await tts.speak("Got it, \(personName) is your \(userMessage). Now, about your question...", voiceId: agent.voiceId, speed: agent.voiceSpeed)
            }

            // Re-process the original request with the new memory context
            // Get fresh agent data with updated memories
            let updatedAgent = agentStorage.agents.first(where: { $0.id == agent.id }) ?? agent

            let result = await ChatService.shared.processMessage(
                originalRequest,
                agent: updatedAgent,
                conversationHistory: messages,
                apiKey: apiKey,
                provider: agent.provider.rawValue
            )

            // Handle the result (should now be personMentioned with known relationship)
            await handleChatResult(result, apiKey: apiKey)
            isSending = false
            return
        }

        // Use ChatService for unified processing (task detection + response)
        let result = await ChatService.shared.processMessage(
            userMessage,
            agent: agent,
            conversationHistory: messages,
            apiKey: apiKey,
            provider: agent.provider.rawValue
        )

        switch result {
        case .relationshipQuery(let queryResponse):
            // We need to know who this person is first - SAVE CONTEXT
            pendingOriginalRequest = userMessage
            pendingPersonName = queryResponse.personName
            awaitingRelationshipClarification = true

            let questionMessage = ChatMessage(
                id: UUID().uuidString,
                content: queryResponse.question,
                isFromUser: false,
                timestamp: Date(),
                agentName: agent.name,
                agentEmoji: agent.emoji
            )
            withAnimation {
                messages.append(questionMessage)
            }

            if tts.isAvailable {
                await tts.speak(queryResponse.question, voiceId: agent.voiceId, speed: agent.voiceSpeed)
            }

        case .personMentioned(let personResponse):
            // Person is mentioned - show acknowledgment and options
            var responseText = personResponse.acknowledgment
            if let relationship = personResponse.relationship {
                responseText = "This involves \(personResponse.personName) (\(relationship)). Would you like me to create a task to discuss with their agent, or talk through it with me now?"
            } else {
                responseText = "This involves \(personResponse.personName). Would you like me to create a task to discuss with their agent, or talk through it with me now?"
            }

            let agentChatMessage = ChatMessage(
                id: UUID().uuidString,
                content: responseText,
                isFromUser: false,
                timestamp: Date(),
                agentName: agent.name,
                agentEmoji: agent.emoji
            )
            withAnimation {
                messages.append(agentChatMessage)
            }

            if tts.isAvailable {
                await tts.speak(responseText, voiceId: agent.voiceId, speed: agent.voiceSpeed)
            }

        case .taskDetected(let taskResponse):
            // Task was detected - show brief acknowledgment with options
            // Save the task
            if var updatedAgent = agentStorage.agents.first(where: { $0.id == agent.id }) {
                updatedAgent.tasks.append(taskResponse.task)
                agentStorage.updateAgent(updatedAgent)
            }

            // Show the brief acknowledgment (under 20 words!)
            let agentChatMessage = ChatMessage(
                id: UUID().uuidString,
                content: taskResponse.acknowledgment,
                isFromUser: false,
                timestamp: Date(),
                agentName: agent.name,
                agentEmoji: agent.emoji
            )
            withAnimation {
                messages.append(agentChatMessage)
                queuedTask = taskResponse.task
            }

            // Speak acknowledgment
            if tts.isAvailable {
                await tts.speak(taskResponse.acknowledgment, voiceId: agent.voiceId, speed: agent.voiceSpeed)
            }

        case .normal(let response):
            // Normal response - already enforced 20-word limit
            let agentChatMessage = ChatMessage(
                id: UUID().uuidString,
                content: response,
                isFromUser: false,
                timestamp: Date(),
                agentName: agent.name,
                agentEmoji: agent.emoji
            )
            withAnimation {
                messages.append(agentChatMessage)
            }

            if tts.isAvailable {
                await tts.speak(response, voiceId: agent.voiceId, speed: agent.voiceSpeed)
            }

        case .error(let errorMsg):
            let errorChatMessage = ChatMessage(
                id: UUID().uuidString,
                content: errorMsg,
                isFromUser: false,
                timestamp: Date()
            )
            withAnimation {
                messages.append(errorChatMessage)
            }
        }

        isSending = false
    }

    /// Helper to handle chat results (used for re-processing after clarification)
    private func handleChatResult(_ result: ChatService.ResponseType, apiKey: String) async {
        switch result {
        case .relationshipQuery(let queryResponse):
            // Shouldn't happen after clarification, but handle gracefully
            let questionMessage = ChatMessage(
                id: UUID().uuidString,
                content: queryResponse.question,
                isFromUser: false,
                timestamp: Date(),
                agentName: agent.name,
                agentEmoji: agent.emoji
            )
            withAnimation {
                messages.append(questionMessage)
            }

        case .personMentioned(let personResponse):
            var responseText = personResponse.acknowledgment
            if let relationship = personResponse.relationship {
                responseText = "This involves \(personResponse.personName) (\(relationship)). Would you like me to create a task to discuss with their agent, or talk through it with me now?"
            } else {
                responseText = "This involves \(personResponse.personName). Would you like me to create a task to discuss with their agent, or talk through it with me now?"
            }

            let agentChatMessage = ChatMessage(
                id: UUID().uuidString,
                content: responseText,
                isFromUser: false,
                timestamp: Date(),
                agentName: agent.name,
                agentEmoji: agent.emoji
            )
            withAnimation {
                messages.append(agentChatMessage)
            }

            if tts.isAvailable {
                await tts.speak(responseText, voiceId: agent.voiceId, speed: agent.voiceSpeed)
            }

        case .taskDetected(let taskResponse):
            if var updatedAgent = agentStorage.agents.first(where: { $0.id == agent.id }) {
                updatedAgent.tasks.append(taskResponse.task)
                agentStorage.updateAgent(updatedAgent)
            }

            let agentChatMessage = ChatMessage(
                id: UUID().uuidString,
                content: taskResponse.acknowledgment,
                isFromUser: false,
                timestamp: Date(),
                agentName: agent.name,
                agentEmoji: agent.emoji
            )
            withAnimation {
                messages.append(agentChatMessage)
                queuedTask = taskResponse.task
            }

            if tts.isAvailable {
                await tts.speak(taskResponse.acknowledgment, voiceId: agent.voiceId, speed: agent.voiceSpeed)
            }

        case .normal(let response):
            let agentChatMessage = ChatMessage(
                id: UUID().uuidString,
                content: response,
                isFromUser: false,
                timestamp: Date(),
                agentName: agent.name,
                agentEmoji: agent.emoji
            )
            withAnimation {
                messages.append(agentChatMessage)
            }

            if tts.isAvailable {
                await tts.speak(response, voiceId: agent.voiceId, speed: agent.voiceSpeed)
            }

        case .error(let errorMsg):
            let errorChatMessage = ChatMessage(
                id: UUID().uuidString,
                content: errorMsg,
                isFromUser: false,
                timestamp: Date()
            )
            withAnimation {
                messages.append(errorChatMessage)
            }
        }
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

// MARK: - Solo Chat Bubble

/// Chat bubble specialized for solo chat (takes agent directly)
struct SoloChatBubble: View {
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
    .environmentObject(AgentStorageService.shared)
}
