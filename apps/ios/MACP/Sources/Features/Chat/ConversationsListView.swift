import SwiftUI

struct ConversationsListView: View {
    @EnvironmentObject var conversationService: ConversationService
    @EnvironmentObject var agentStorage: AgentStorageService
    @State private var showNewConversation = false
    @State private var selectedConversation: Conversation?

    var body: some View {
        NavigationSplitView {
            // Sidebar
            Group {
                if conversationService.conversations.isEmpty && !conversationService.isLoading {
                    EmptyConversationsView {
                        showNewConversation = true
                    }
                } else {
                    List(conversationService.conversations, selection: $selectedConversation) { conversation in
                        NavigationLink(value: conversation) {
                            ConversationRow(conversation: conversation)
                        }
                    }
                    .refreshable {
                        await conversationService.fetchConversations()
                    }
                }
            }
            .navigationTitle("Conversations")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showNewConversation = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.title2)
                    }
                }
            }
        } detail: {
            // Detail view for iPad
            if let conversation = selectedConversation {
                ConversationView(conversation: conversation)
            } else {
                ContentUnavailableView(
                    "Select a Conversation",
                    systemImage: "bubble.left.and.bubble.right",
                    description: Text("Choose a conversation from the sidebar")
                )
            }
        }
        .sheet(isPresented: $showNewConversation) {
            NewConversationView()
                .environmentObject(agentStorage)
        }
        .task {
            await conversationService.fetchConversations()
        }
    }
}

// Make Conversation conform to Hashable for NavigationSplitView selection
extension Conversation: Hashable {
    static func == (lhs: Conversation, rhs: Conversation) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

struct ConversationRow: View {
    let conversation: Conversation

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(conversation.topic)
                    .font(.headline)
                    .lineLimit(1)

                Spacer()

                StatusBadge(status: conversation.status)
            }

            // Participants
            if let participants = conversation.participants, !participants.isEmpty {
                HStack(spacing: 8) {
                    ForEach(participants) { participant in
                        ParticipantChip(participant: participant)
                    }
                }
            }

            HStack {
                Text("Turn \(conversation.currentTurn)/\(conversation.maxTurns)")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Spacer()

                Text(conversation.createdAt, style: .relative)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

struct ParticipantChip: View {
    let participant: Participant

    var providerColor: Color {
        switch participant.provider {
        case "anthropic": return .orange
        case "openai": return .green
        case "gemini": return .blue
        case "groq": return .purple
        default: return .gray
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(providerColor)
                .frame(width: 8, height: 8)
            Text(participant.agentName)
                .font(.caption)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(providerColor.opacity(0.1))
        .clipShape(Capsule())
    }
}

struct StatusBadge: View {
    let status: ConversationStatus

    var body: some View {
        Text(status.rawValue.capitalized)
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(backgroundColor)
            .foregroundColor(.white)
            .clipShape(Capsule())
    }

    private var backgroundColor: Color {
        switch status {
        case .pending:
            return .orange
        case .active:
            return .green
        case .paused:
            return .yellow
        case .completed:
            return .blue
        case .cancelled:
            return .gray
        }
    }
}

struct EmptyConversationsView: View {
    let onCreateTapped: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("No Conversations", systemImage: "bubble.left.and.bubble.right")
        } description: {
            Text("Start a conversation between AI agents")
        } actions: {
            Button("Start Conversation") {
                onCreateTapped()
            }
            .buttonStyle(.borderedProminent)
        }
    }
}

#Preview {
    ConversationsListView()
        .environmentObject(ConversationService.shared)
        .environmentObject(AgentStorageService.shared)
}
