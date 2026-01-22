import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authService: AuthService

    var body: some View {
        Group {
            if authService.isAuthenticated {
                MainTabView()
            } else {
                SignInView()
            }
        }
        .animation(.default, value: authService.isAuthenticated)
    }
}

struct MainTabView: View {
    @EnvironmentObject var deepLinkHandler: DeepLinkHandler
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var conversationService: ConversationService
    @EnvironmentObject var archiveService: ArchiveService
    @EnvironmentObject var memoryService: MemoryService

    var body: some View {
        TabView {
            // Home - Chat with your agents (PRIMARY)
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }

            // Multi-agent conversations
            ConversationsListView()
                .tabItem {
                    Label("Collab", systemImage: "bubble.left.and.bubble.right")
                }

            // Archives
            ArchivesListView()
                .tabItem {
                    Label("History", systemImage: "archivebox")
                }

            // Settings
            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
        }
        .sheet(isPresented: $deepLinkHandler.showJoinSheet) {
            if let conversationId = deepLinkHandler.pendingConversationId {
                JoinConversationSheet(conversationId: conversationId)
                    .environmentObject(agentStorage)
                    .environmentObject(conversationService)
                    .environmentObject(deepLinkHandler)
            }
        }
    }
}

// MARK: - Join Conversation Sheet

struct JoinConversationSheet: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var conversationService: ConversationService
    @EnvironmentObject var deepLinkHandler: DeepLinkHandler

    let conversationId: String

    @State private var selectedAgent: LocalAgent?
    @State private var isLoading = false
    @State private var error: String?
    @State private var conversationDetails: ConversationResponse?

    var body: some View {
        NavigationStack {
            Form {
                if isLoading && conversationDetails == nil {
                    Section {
                        HStack {
                            Spacer()
                            ProgressView("Loading conversation...")
                            Spacer()
                        }
                    }
                } else if let details = conversationDetails {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(details.topic)
                                .font(.headline)
                            if let goal = details.goal {
                                Text(goal)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            HStack {
                                Label("\(details.maxTurns) turns", systemImage: "arrow.triangle.2.circlepath")
                                Spacer()
                                Text(details.mode.capitalized)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 2)
                                    .background(.blue.opacity(0.1))
                                    .foregroundStyle(.blue)
                                    .clipShape(Capsule())
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                    } header: {
                        Text("Conversation")
                    }

                    Section {
                        if agentStorage.agents.isEmpty {
                            Text("No agents configured. Create one in My Agent tab.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(agentStorage.agents) { agent in
                                Button {
                                    selectedAgent = agent
                                } label: {
                                    HStack {
                                        VStack(alignment: .leading) {
                                            Text(agent.name)
                                                .foregroundStyle(.primary)
                                            Text(agent.provider.displayName)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        if selectedAgent?.id == agent.id {
                                            Image(systemName: "checkmark.circle.fill")
                                                .foregroundStyle(.blue)
                                        }
                                    }
                                }
                            }
                        }
                    } header: {
                        Text("Select Agent to Join")
                    }

                    if let error = error {
                        Section {
                            Text(error)
                                .foregroundStyle(.red)
                        }
                    }
                } else if let error = error {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Join Conversation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        deepLinkHandler.clearPending()
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Join") {
                        joinConversation()
                    }
                    .disabled(selectedAgent == nil || isLoading)
                }
            }
            .task {
                await loadConversationDetails()
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func loadConversationDetails() async {
        isLoading = true
        error = nil

        do {
            conversationDetails = try await APIClient.shared.get("/conversations/\(conversationId)")
            // Auto-select default agent if available
            if selectedAgent == nil {
                selectedAgent = agentStorage.agents.first { $0.isDefault } ?? agentStorage.agents.first
            }
        } catch {
            self.error = "Failed to load conversation: \(error.localizedDescription)"
        }

        isLoading = false
    }

    private func joinConversation() {
        guard let agent = selectedAgent else { return }

        isLoading = true
        error = nil

        Task {
            do {
                try await conversationService.joinConversation(conversationId, with: agent)
                deepLinkHandler.clearPending()
                dismiss()
            } catch {
                self.error = "Failed to join: \(error.localizedDescription)"
            }
            isLoading = false
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AuthService.shared)
        .environmentObject(ConversationService.shared)
}
