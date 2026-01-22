import SwiftUI

struct NewConversationView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var conversationService: ConversationService
    @EnvironmentObject var agentStorage: AgentStorageService

    @State private var topic = ""
    @State private var goal = ""
    @State private var selectedAgentIds: Set<UUID> = []
    @State private var isCreating = false
    @State private var showNoAgentsAlert = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                // Agent Selection
                Section {
                    if agentStorage.agents.isEmpty {
                        HStack {
                            Image(systemName: "exclamationmark.triangle")
                                .foregroundStyle(.orange)
                            Text("No agents configured")
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        ForEach(agentStorage.agents) { agent in
                            AgentSelectionRow(
                                agent: agent,
                                isSelected: selectedAgentIds.contains(agent.id),
                                onToggle: {
                                    if selectedAgentIds.contains(agent.id) {
                                        selectedAgentIds.remove(agent.id)
                                    } else {
                                        selectedAgentIds.insert(agent.id)
                                    }
                                }
                            )
                        }
                    }
                } header: {
                    Text("Your Agents")
                } footer: {
                    if agentStorage.agents.isEmpty {
                        Text("Create an agent in the Agents tab first")
                    } else {
                        Text("Select which of your agents will participate")
                    }
                }

                // Topic
                Section {
                    TextField("What should the agents discuss?", text: $topic, axis: .vertical)
                        .lineLimit(2...4)
                } header: {
                    Text("Topic")
                } footer: {
                    Text("This will be the main subject of the conversation")
                }

                // Goal (Optional)
                Section {
                    TextField("Optional: What outcome are you hoping for?", text: $goal, axis: .vertical)
                        .lineLimit(2...3)
                } header: {
                    Text("Goal")
                }

                // Error message
                if let error = errorMessage {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("New Conversation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Start") {
                        createConversation()
                    }
                    .disabled(topic.isEmpty || selectedAgentIds.isEmpty || isCreating)
                }
            }
            .overlay {
                if isCreating {
                    ProgressView("Creating...")
                        .padding()
                        .background(.regularMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .onAppear {
                // Pre-select default agent if available
                if let defaultAgent = agentStorage.agents.first(where: { $0.isDefault }) {
                    selectedAgentIds.insert(defaultAgent.id)
                } else if let firstAgent = agentStorage.agents.first {
                    selectedAgentIds.insert(firstAgent.id)
                }
            }
            .alert("No Agents", isPresented: $showNoAgentsAlert) {
                Button("OK") {}
            } message: {
                Text("Please create at least one agent before starting a conversation.")
            }
        }
    }

    private func createConversation() {
        guard !selectedAgentIds.isEmpty else {
            showNoAgentsAlert = true
            return
        }

        isCreating = true
        errorMessage = nil

        // Get the selected agents
        let selectedAgents = agentStorage.agents.filter { selectedAgentIds.contains($0.id) }

        Task {
            let conversation = await conversationService.createConversation(
                topic: topic,
                goal: goal.isEmpty ? nil : goal,
                agents: selectedAgents
            )

            isCreating = false

            if conversation != nil {
                dismiss()
            } else {
                // Show error from service
                errorMessage = conversationService.error ?? "Failed to create conversation"
            }
        }
    }
}

// MARK: - Agent Selection Row

struct AgentSelectionRow: View {
    let agent: LocalAgent
    let isSelected: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 12) {
                // Selection indicator
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? .blue : .secondary)
                    .font(.title2)

                // Agent icon
                Image(agent.provider.iconName)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 32, height: 32)

                // Agent info
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(agent.name)
                            .font(.headline)
                            .foregroundStyle(.primary)

                        if agent.isDefault {
                            Text("DEFAULT")
                                .font(.caption2)
                                .fontWeight(.semibold)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(.blue.opacity(0.1))
                                .foregroundStyle(.blue)
                                .clipShape(Capsule())
                        }
                    }

                    Text(agent.provider.displayName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    NewConversationView()
        .environmentObject(ConversationService.shared)
        .environmentObject(AgentStorageService.shared)
}
