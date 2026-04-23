import SwiftUI

/// View for managing user's agents
struct ManageAgentsView: View {
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var rulesService: RulesService
    @State private var showCreateAgent = false

    var body: some View {
        List {
            // All agents in one section (user manually adds from Agent Store)
            Section {
                if agentStorage.agents.isEmpty {
                    ContentUnavailableView(
                        "No Agents Yet",
                        systemImage: "person.2.circle",
                        description: Text("Add agents from the Agent Store or create custom ones")
                    )
                } else {
                    ForEach(agentStorage.agents) { agent in
                        UserAgentRow(agent: agent)
                    }
                    .onDelete(perform: deleteAgents)
                }

                Button {
                    showCreateAgent = true
                } label: {
                    Label("Add Agent", systemImage: "plus.circle.fill")
                }
            } header: {
                Text("Your Agents")
            } footer: {
                Text("Add pre-built specialists or create custom agents")
            }
        }
        .navigationTitle("Manage Agents")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showCreateAgent = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showCreateAgent) {
            NavigationStack {
                AgentEditorView(existingAgent: nil)
                    .environmentObject(agentStorage)
                    .environmentObject(apiKeyService)
            }
        }
        .task {
            await rulesService.fetchIndex()
        }
    }

    private func deleteAgents(at offsets: IndexSet) {
        for index in offsets {
            agentStorage.deleteAgent(agentStorage.agents[index])
        }
    }
}

// MARK: - User Agent Row

struct UserAgentRow: View {
    let agent: LocalAgent
    @EnvironmentObject var rulesService: RulesService
    @State private var showRules = false

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

    var ruleCount: Int {
        rulesService.ruleCount(for: agent.id.uuidString)
    }

    var body: some View {
        NavigationLink {
            AgentEditorView(existingAgent: agent)
        } label: {
            HStack(spacing: 12) {
                // Avatar
                ZStack {
                    Circle()
                        .fill(accentColor.opacity(0.15))
                        .frame(width: 44, height: 44)
                    Text(agent.emoji)
                        .font(.system(size: 22))
                }

                // Info
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(agent.name)
                            .font(.headline)

                        if agent.isDefault {
                            Image(systemName: "star.fill")
                                .font(.caption)
                                .foregroundStyle(.yellow)
                        }
                    }

                    Text(agent.description.isEmpty ? agent.personality : agent.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)

                    // Provider badge and Rules button
                    HStack(spacing: 8) {
                        HStack(spacing: 4) {
                            Image(agent.provider.iconName)
                                .resizable()
                                .scaledToFit()
                                .frame(width: 12, height: 12)
                            Text(agent.provider.displayName)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        // Rules button
                        Button {
                            showRules = true
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "text.badge.plus")
                                    .font(.caption2)
                                Text(ruleCount > 0 ? "\(ruleCount) Rules" : "Rules")
                                    .font(.caption2)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(ruleCount > 0 ? accentColor.opacity(0.15) : Color(.systemGray5))
                            .foregroundStyle(ruleCount > 0 ? accentColor : .secondary)
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }

                Spacer()
            }
            .padding(.vertical, 4)
        }
        .sheet(isPresented: $showRules) {
            AgentRulesView(agentId: agent.id.uuidString, agentName: agent.name, agentEmoji: agent.emoji)
                .environmentObject(rulesService)
        }
    }
}

#Preview {
    NavigationStack {
        ManageAgentsView()
            .environmentObject(AgentStorageService.shared)
            .environmentObject(APIKeyService.shared)
            .environmentObject(RulesService.shared)
    }
}
