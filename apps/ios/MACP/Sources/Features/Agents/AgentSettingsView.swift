import SwiftUI

struct AgentSettingsView: View {
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var memoryService: MemoryService

    @State private var showingAddAgent = false
    @State private var selectedAgent: LocalAgent?

    var body: some View {
        NavigationStack {
            List {
                // Agents List
                Section {
                    if agentStorage.agents.isEmpty {
                        ContentUnavailableView(
                            "No Agents",
                            systemImage: "person.crop.circle.badge.plus",
                            description: Text("Create your first AI agent")
                        )
                    } else {
                        ForEach(agentStorage.agents) { agent in
                            AgentRow(agent: agent) {
                                selectedAgent = agent
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    agentStorage.deleteAgent(agent)
                                    // Sync to server
                                    Task { await SettingsSyncService.shared.syncAgents() }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .leading) {
                                if !agent.isDefault {
                                    Button {
                                        agentStorage.setDefault(agent)
                                    } label: {
                                        Label("Set Default", systemImage: "star.fill")
                                    }
                                    .tint(.yellow)
                                }
                            }
                        }
                    }
                } header: {
                    HStack {
                        Text("My Agents")
                        Spacer()
                        Button {
                            showingAddAgent = true
                        } label: {
                            Image(systemName: "plus.circle.fill")
                        }
                    }
                } footer: {
                    Text("Swipe left to delete, right to set as default")
                }
            }
            .navigationTitle("Agents")
            .sheet(isPresented: $showingAddAgent) {
                AgentEditorView(existingAgent: nil)
                    .environmentObject(agentStorage)
                    .environmentObject(apiKeyService)
                    .environmentObject(memoryService)
            }
            .sheet(item: $selectedAgent) { agent in
                AgentEditorView(existingAgent: agent)
                    .environmentObject(agentStorage)
                    .environmentObject(apiKeyService)
                    .environmentObject(memoryService)
            }
        }
    }
}

// MARK: - Agent Row

struct AgentRow: View {
    let agent: LocalAgent
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Provider Icon
                Image(agent.provider.iconName)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 36, height: 36)

                // Agent Info
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

                    if !agent.description.isEmpty {
                        Text(agent.description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }

                    Text(agent.provider.displayName)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
    }
}

// Make LocalAgent conform to Identifiable for sheet(item:)
extension LocalAgent: Equatable {
    static func == (lhs: LocalAgent, rhs: LocalAgent) -> Bool {
        lhs.id == rhs.id
    }
}

#Preview {
    AgentSettingsView()
        .environmentObject(AgentStorageService.shared)
        .environmentObject(APIKeyService.shared)
        .environmentObject(MemoryService.shared)
}
