import SwiftUI

/// Chat view for the agent introduction flow
struct IntroductionChatView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var introductionService: IntroductionService
    @EnvironmentObject var apiKeyService: APIKeyService
    @StateObject private var tts = ElevenLabsService.shared

    let agentId: String
    let agentName: String
    let agentEmoji: String
    let accentColor: Color

    // For custom agents, optionally provide the agent with questions
    var customAgent: LocalAgent? = nil

    @State private var conversationId: String?
    @State private var messages: [IntroMessage] = []
    @State private var inputText = ""
    @State private var isLoading = false
    @State private var isSending = false
    @State private var error: String?
    @State private var progress: IntroductionProgress?
    @State private var isComplete = false
    @State private var completionSummary: IntroductionCompleteResponse?
    @State private var showCompletionCelebration = false

    var body: some View {
        VStack(spacing: 0) {
            // Progress indicator
            if let progress = progress, !isComplete {
                ProgressHeader(
                    current: progress.questionsAsked,
                    total: progress.totalQuestions,
                    accentColor: accentColor
                )
            }

            // Messages
            ScrollViewReader { scrollProxy in
                ScrollView {
                    LazyVStack(spacing: 16) {
                        ForEach(messages) { message in
                            IntroMessageBubble(
                                message: message,
                                agentName: agentName,
                                agentEmoji: agentEmoji,
                                accentColor: accentColor
                            )
                            .id(message.id)
                        }

                        if isSending {
                            HStack {
                                IntroTypingIndicator(accentColor: accentColor)
                                Spacer()
                            }
                            .padding(.horizontal)
                            .id("typing")
                        }
                    }
                    .padding()
                }
                .onChange(of: messages.count) { _, _ in
                    scrollToBottom(scrollProxy)
                }
                .onChange(of: isSending) { _, _ in
                    scrollToBottom(scrollProxy)
                }
            }

            // Completion celebration
            if showCompletionCelebration, let summary = completionSummary {
                CompletionCard(
                    summary: summary,
                    agentName: agentName,
                    agentEmoji: agentEmoji,
                    accentColor: accentColor,
                    onDone: {
                        dismiss()
                    }
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Input area
            if !showCompletionCelebration {
                InputArea(
                    text: $inputText,
                    isEnabled: !isSending && conversationId != nil,
                    accentColor: accentColor,
                    isSpeaking: tts.isSpeaking,
                    onSend: sendMessage,
                    onStopSpeaking: { tts.stop() }
                )
            }
        }
        .navigationTitle("Getting to Know You")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") {
                    dismiss()
                }
            }
        }
        .task {
            await startConversation()
        }
        .alert("Error", isPresented: .constant(error != nil)) {
            Button("OK") { error = nil }
        } message: {
            Text(error ?? "")
        }
    }

    // MARK: - Actions

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.2)) {
            if isSending {
                proxy.scrollTo("typing", anchor: .bottom)
            } else if let lastMessage = messages.last {
                proxy.scrollTo(lastMessage.id, anchor: .bottom)
            }
        }
    }

    private func startConversation() async {
        isLoading = true

        do {
            // Get API key - use the custom agent's provider if available
            let providerKey = customAgent?.provider.rawValue ?? "anthropic"
            guard let apiKey = apiKeyService.getKey(for: providerKey) else {
                error = "Please configure an API key in Settings"
                isLoading = false
                return
            }

            // Create the introduction conversation
            let response = try await introductionService.createIntroductionConversation(
                agentId: agentId,
                apiKey: apiKey,
                provider: providerKey,
                agentName: customAgent?.name,
                agentEmoji: customAgent?.emoji,
                introductionGreeting: customAgent?.introductionGreeting,
                introductionQuestions: customAgent?.introductionQuestions
            )

            conversationId = response.id
            progress = IntroductionProgress(
                questionsAsked: 0,
                totalQuestions: response.totalQuestions
            )

            // Add the greeting as first message
            let greetingMessage = IntroMessage(
                id: UUID().uuidString,
                content: response.introductionGreeting,
                isUser: false,
                timestamp: Date()
            )
            messages.append(greetingMessage)

            // Speak the greeting
            if tts.isAvailable {
                let voiceId = customAgent?.voiceId ?? ElevenLabsService.defaultVoiceId
                let voiceSpeed = customAgent?.voiceSpeed ?? ElevenLabsService.defaultSpeed
                await tts.speak(response.introductionGreeting, voiceId: voiceId, speed: voiceSpeed)
            }

        } catch {
            self.error = "Failed to start introduction: \(error.localizedDescription)"
        }

        isLoading = false
    }

    private func sendMessage() {
        let content = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, let convId = conversationId else { return }

        inputText = ""
        isSending = true

        // Add user message
        let userMessage = IntroMessage(
            id: UUID().uuidString,
            content: content,
            isUser: true,
            timestamp: Date()
        )
        messages.append(userMessage)

        Task {
            do {
                let response = try await introductionService.sendMessage(
                    conversationId: convId,
                    content: content
                )

                // Add agent response
                let agentMessage = IntroMessage(
                    id: response.agentMessage.id,
                    content: response.agentMessage.content,
                    isUser: false,
                    timestamp: Date()
                )
                messages.append(agentMessage)

                // Speak the response using TTS
                if tts.isAvailable {
                    let voiceId = customAgent?.voiceId ?? ElevenLabsService.defaultVoiceId
                    let voiceSpeed = customAgent?.voiceSpeed ?? ElevenLabsService.defaultSpeed
                    await tts.speak(response.agentMessage.content, voiceId: voiceId, speed: voiceSpeed)
                }

                // Update progress
                progress = response.progress
                isComplete = response.isComplete

                // If complete, trigger completion flow
                if response.isComplete {
                    await completeIntroduction()
                }

            } catch {
                self.error = "Failed to send message: \(error.localizedDescription)"
            }

            isSending = false
        }
    }

    private func completeIntroduction() async {
        guard let convId = conversationId else { return }

        do {
            let summary = try await introductionService.completeIntroduction(conversationId: convId)
            completionSummary = summary

            // Update local status
            introductionService.markCompleted(
                agentId: agentId,
                factsLearned: summary.factsLearned,
                rulesLearned: summary.rulesLearned
            )

            // Show celebration
            withAnimation(.spring(response: 0.6, dampingFraction: 0.8)) {
                showCompletionCelebration = true
            }

        } catch {
            print("Failed to complete introduction: \(error)")
            // Still show completion, just without stats
            withAnimation {
                showCompletionCelebration = true
            }
        }
    }
}

// MARK: - Supporting Types

struct IntroMessage: Identifiable {
    let id: String
    let content: String
    let isUser: Bool
    let timestamp: Date
}

// MARK: - Progress Header

private struct ProgressHeader: View {
    let current: Int
    let total: Int
    let accentColor: Color

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("Question \(current) of \(total)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(accentColor.opacity(0.2))
                        .frame(height: 4)

                    RoundedRectangle(cornerRadius: 2)
                        .fill(accentColor)
                        .frame(width: geo.size.width * (Double(current) / Double(max(total, 1))), height: 4)
                        .animation(.easeInOut(duration: 0.3), value: current)
                }
            }
            .frame(height: 4)
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
    }
}

// MARK: - Introduction Message Bubble

private struct IntroMessageBubble: View {
    let message: IntroMessage
    let agentName: String
    let agentEmoji: String
    let accentColor: Color

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            if message.isUser {
                Spacer(minLength: 60)
            } else {
                // Agent avatar
                ZStack {
                    Circle()
                        .fill(accentColor.opacity(0.15))
                        .frame(width: 32, height: 32)
                    Text(agentEmoji)
                        .font(.system(size: 16))
                }
            }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 4) {
                if !message.isUser {
                    Text(agentName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Text(message.content)
                    .font(.body)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(message.isUser ? accentColor : Color(.systemGray6))
                    .foregroundStyle(message.isUser ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
            }

            if !message.isUser {
                Spacer(minLength: 60)
            }
        }
    }
}

// MARK: - Introduction Typing Indicator

private struct IntroTypingIndicator: View {
    let accentColor: Color
    @State private var animationPhase = 0

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(accentColor.opacity(animationPhase == index ? 1.0 : 0.4))
                    .frame(width: 8, height: 8)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 18))
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

// MARK: - Input Area

private struct InputArea: View {
    @Binding var text: String
    let isEnabled: Bool
    let accentColor: Color
    let isSpeaking: Bool
    let onSend: () -> Void
    let onStopSpeaking: () -> Void
    @FocusState private var isInputFocused: Bool

    var body: some View {
        HStack(spacing: 12) {
            TextField("Type your response...", text: $text, axis: .vertical)
                .lineLimit(1...4)
                .textFieldStyle(.plain)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .focused($isInputFocused)
                .toolbar {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Done") {
                            isInputFocused = false
                        }
                    }
                }

            Button(action: onSend) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(text.isEmpty ? .gray : accentColor)
            }
            .disabled(text.isEmpty || !isEnabled)

            // Stop speaking button
            if isSpeaking {
                Button(action: onStopSpeaking) {
                    Image(systemName: "speaker.slash.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(.red)
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
    }
}

// MARK: - Completion Card

private struct CompletionCard: View {
    let summary: IntroductionCompleteResponse
    let agentName: String
    let agentEmoji: String
    let accentColor: Color
    let onDone: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            // Celebration emoji
            Text("🎉")
                .font(.system(size: 48))

            Text("Nice to meet you!")
                .font(.title2.weight(.semibold))

            // Summary
            VStack(spacing: 8) {
                HStack(spacing: 20) {
                    StatPill(icon: "brain.fill", value: summary.factsLearned, label: "facts", color: .blue)
                    StatPill(icon: "heart.fill", value: summary.rulesLearned, label: "preferences", color: .pink)
                }
            }

            Text(summary.summary)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button(action: onDone) {
                Text("Start Chatting")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(accentColor)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .padding(.horizontal)
        }
        .padding()
        .padding(.bottom, 20)
        .background(.ultraThinMaterial)
    }
}

private struct StatPill: View {
    let icon: String
    let value: Int
    let label: String
    let color: Color

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(color)

            Text("\(value) \(label)")
                .font(.subheadline.weight(.medium))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(color.opacity(0.1))
        .clipShape(Capsule())
    }
}

#Preview {
    NavigationStack {
        IntroductionChatView(
            agentId: "health_buddy",
            agentName: "Health Buddy",
            agentEmoji: "🏥",
            accentColor: .red
        )
        .environmentObject(IntroductionService.shared)
        .environmentObject(APIKeyService.shared)
    }
}
