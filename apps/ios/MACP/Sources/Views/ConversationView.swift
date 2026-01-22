import SwiftUI
import UIKit

struct ConversationView: View {
    @EnvironmentObject var conversationService: ConversationService
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var archiveService: ArchiveService
    let conversation: Conversation

    @State private var showInviteSheet = false
    @State private var isStarting = false
    @State private var isStopping = false
    @State private var isArchiving = false
    @State private var showError = false
    @State private var showArchiveSuccess = false
    @State private var copiedToClipboard = false

    var body: some View {
        VStack(spacing: 0) {
            // Messages List
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 16) {
                        ForEach(conversationService.messages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }

                        // Typing indicator
                        if conversationService.isAgentTyping,
                           let agentName = conversationService.currentTurnAgent {
                            TypingIndicator(agentName: agentName)
                                .id("typing")
                        }
                    }
                    .padding()
                }
                .onChange(of: conversationService.messages.count) { _, _ in
                    withAnimation {
                        proxy.scrollTo(conversationService.messages.last?.id ?? "typing", anchor: .bottom)
                    }
                }
            }

            // Status Bar
            ConversationStatusBar(conversation: conversation)
        }
        .navigationTitle(conversation.topic)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Invite Someone", systemImage: "person.badge.plus") {
                        showInviteSheet = true
                    }

                    if conversation.status == .pending {
                        Button("Start Conversation", systemImage: "play.fill") {
                            Task {
                                isStarting = true
                                let success = await conversationService.startConversation(conversation.id)
                                isStarting = false
                                if !success {
                                    showError = true
                                }
                            }
                        }
                        .disabled(isStarting)
                    }

                    if conversation.status == .active {
                        Button("Stop Conversation", systemImage: "stop.fill", role: .destructive) {
                            Task {
                                isStopping = true
                                let success = await conversationService.stopConversation(conversation.id)
                                isStopping = false
                                if !success {
                                    showError = true
                                }
                            }
                        }
                        .disabled(isStopping)
                    }

                    Button("Refresh", systemImage: "arrow.clockwise") {
                        Task {
                            await conversationService.fetchMessages(for: conversation.id)
                        }
                    }

                    Divider()

                    Button("Copy Transcript", systemImage: "doc.on.doc") {
                        UIPasteboard.general.string = generateTranscript()
                        copiedToClipboard = true
                    }

                    Button("Archive Conversation", systemImage: "archivebox") {
                        Task {
                            isArchiving = true
                            if let _ = await archiveService.archiveConversation(conversation.id) {
                                // Refresh conversations list to remove this one
                                await conversationService.fetchConversations()
                                showArchiveSuccess = true
                            } else {
                                showError = true
                            }
                            isArchiving = false
                        }
                    }
                    .disabled(isArchiving || conversationService.messages.isEmpty)
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $showInviteSheet) {
            InviteSheet(conversationId: conversation.id)
        }
        .alert("Error", isPresented: $showError) {
            Button("OK") {}
        } message: {
            Text(conversationService.error ?? archiveService.error ?? "An error occurred")
        }
        .alert("Archived", isPresented: $showArchiveSuccess) {
            Button("OK") {}
        } message: {
            Text("Conversation has been archived. You can view it in the Archives tab.")
        }
        .overlay {
            if isStarting {
                ProgressView("Starting conversation...")
                    .padding()
                    .background(.regularMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            } else if isStopping {
                ProgressView("Stopping conversation...")
                    .padding()
                    .background(.regularMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            } else if isArchiving {
                ProgressView("Archiving conversation...")
                    .padding()
                    .background(.regularMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            } else if copiedToClipboard {
                Label("Copied to Clipboard", systemImage: "checkmark.circle.fill")
                    .padding()
                    .background(.regularMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .transition(.scale.combined(with: .opacity))
                    .onAppear {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                            withAnimation {
                                copiedToClipboard = false
                            }
                        }
                    }
            }
        }
        .task {
            // Fetch messages and subscribe to updates
            await conversationService.fetchMessages(for: conversation.id)

            // Connect to WebSocket (uses secure ticket-based auth)
            conversationService.connect()
            conversationService.subscribeToConversation(conversation.id)
        }
        .onDisappear {
            conversationService.unsubscribeFromConversation(conversation.id)
        }
    }

    // MARK: - Export Functions

    private func generateTranscript() -> String {
        var transcript = """
        # \(conversation.topic)

        """

        if let goal = conversation.goal {
            transcript += "**Goal:** \(goal)\n\n"
        }

        if let participants = conversation.participants {
            let names = participants.map { $0.agentName }.joined(separator: ", ")
            transcript += "**Participants:** \(names)\n\n"
        }

        transcript += "**Status:** \(conversation.status.rawValue.capitalized)\n"
        transcript += "**Turns:** \(conversation.currentTurn)/\(conversation.maxTurns)\n\n"
        transcript += "---\n\n"

        for message in conversationService.messages {
            let timeFormatter = DateFormatter()
            timeFormatter.dateStyle = .short
            timeFormatter.timeStyle = .short
            let timestamp = timeFormatter.string(from: message.createdAt)

            transcript += "**\(message.agentName)** (Turn \(message.turnNumber)) - \(timestamp)\n\n"
            transcript += "\(message.content)\n\n"
            transcript += "---\n\n"
        }

        transcript += "\n*Exported from MACP*"

        return transcript
    }
}

// MARK: - Invite Sheet

struct InviteSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var conversationService: ConversationService

    let conversationId: String

    @State private var isLoading = true
    @State private var inviteResponse: InviteResponse?
    @State private var errorMessage: String?
    @State private var showShareSheet = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                if isLoading {
                    ProgressView("Generating invite link...")
                        .padding()
                } else if let invite = inviteResponse {
                    // Success state
                    VStack(spacing: 20) {
                        Image(systemName: "link.circle.fill")
                            .font(.system(size: 60))
                            .foregroundStyle(.blue)

                        Text("Share this conversation")
                            .font(.title2.bold())

                        Text("Invite a friend to join \"\(invite.topic)\" with their AI agent")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)

                        // Link preview
                        HStack {
                            Image(systemName: "link")
                                .foregroundStyle(.blue)
                            Text(invite.inviteLink)
                                .font(.system(.body, design: .monospaced))
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                        .padding()
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .padding(.horizontal)

                        // Share button
                        Button {
                            showShareSheet = true
                        } label: {
                            Label("Share Invite Link", systemImage: "square.and.arrow.up")
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(.blue)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .padding(.horizontal)

                        // Copy button
                        Button {
                            UIPasteboard.general.string = invite.inviteLink
                        } label: {
                            Label("Copy Link", systemImage: "doc.on.doc")
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color(.systemGray5))
                                .foregroundStyle(.primary)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                        .padding(.horizontal)
                    }
                } else if let error = errorMessage {
                    // Error state
                    VStack(spacing: 16) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 50))
                            .foregroundStyle(.red)

                        Text("Failed to generate link")
                            .font(.headline)

                        Text(error)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)

                        Button("Try Again") {
                            generateInviteLink()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding()
                }

                Spacer()
            }
            .padding(.top, 40)
            .navigationTitle("Invite Someone")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showShareSheet) {
                if let invite = inviteResponse {
                    ShareSheet(items: [
                        "Join my AI conversation about \"\(invite.topic)\"! \(invite.inviteLink)"
                    ])
                }
            }
            .task {
                generateInviteLink()
            }
        }
    }

    private func generateInviteLink() {
        isLoading = true
        errorMessage = nil

        Task {
            inviteResponse = await conversationService.getInviteLink(for: conversationId)
            if inviteResponse == nil {
                errorMessage = conversationService.error ?? "Failed to generate invite link"
            }
            isLoading = false
        }
    }
}

// MARK: - Share Sheet

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct MessageBubble: View {
    let message: Message

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Agent Header
            HStack {
                Circle()
                    .fill(agentColor.gradient)
                    .frame(width: 32, height: 32)
                    .overlay {
                        Text(message.agentName.prefix(1))
                            .font(.caption.bold())
                            .foregroundColor(.white)
                    }

                VStack(alignment: .leading) {
                    Text(message.agentName)
                        .font(.subheadline.bold())

                    Text("Turn \(message.turnNumber)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Text(message.createdAt, style: .time)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Message Content
            Text(message.content)
                .font(.body)
                .padding()
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var agentColor: Color {
        // Consistent color based on agent name hash
        let hash = message.agentName.hashValue
        let colors: [Color] = [.blue, .purple, .green, .orange, .pink]
        return colors[abs(hash) % colors.count]
    }
}

struct TypingIndicator: View {
    let agentName: String
    @State private var animating = false

    var body: some View {
        HStack {
            Text("\(agentName) is thinking")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack(spacing: 4) {
                ForEach(0..<3) { index in
                    Circle()
                        .fill(.secondary)
                        .frame(width: 6, height: 6)
                        .offset(y: animating ? -4 : 4)
                        .animation(
                            .easeInOut(duration: 0.5)
                            .repeatForever()
                            .delay(Double(index) * 0.15),
                            value: animating
                        )
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .onAppear {
            animating = true
        }
    }
}

struct ConversationStatusBar: View {
    let conversation: Conversation

    var body: some View {
        HStack {
            Label(conversation.status.rawValue.capitalized, systemImage: statusIcon)
                .font(.caption)

            Spacer()

            Text("Turn \(conversation.currentTurn) of \(conversation.maxTurns)")
                .font(.caption)
        }
        .padding()
        .background(Color(.systemGray6))
    }

    private var statusIcon: String {
        switch conversation.status {
        case .pending:
            return "clock"
        case .active:
            return "bubble.left.and.bubble.right"
        case .paused:
            return "pause.circle"
        case .completed:
            return "checkmark.circle"
        case .cancelled:
            return "xmark.circle"
        }
    }
}

#Preview {
    NavigationStack {
        ConversationView(conversation: Conversation(
            id: "preview",
            topic: "AI Collaboration",
            goal: "Explore ideas",
            mode: "campfire",
            maxTurns: 20,
            status: .active,
            currentTurn: 5,
            createdAt: Date(),
            participants: [
                Participant(id: "1", agentName: "Claude", provider: "anthropic"),
                Participant(id: "2", agentName: "GPT", provider: "openai")
            ]
        ))
    }
    .environmentObject(ConversationService.shared)
    .environmentObject(AuthService.shared)
    .environmentObject(ArchiveService.shared)
}
