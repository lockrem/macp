import Foundation

/// Manages local storage of configured agents
@MainActor
class AgentStorageService: ObservableObject {
    static let shared = AgentStorageService()

    @Published var agents: [LocalAgent] = []
    @Published var isLoading = false

    private let storageKey = "configured_agents"

    private init() {
        loadAgents()
    }

    // MARK: - CRUD Operations

    func loadAgents() {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode([LocalAgent].self, from: data) else {
            // Create a default agent if none exist
            if agents.isEmpty {
                let defaultAgent = LocalAgent(
                    name: "My Assistant",
                    description: "A helpful AI assistant",
                    provider: .anthropic,
                    isDefault: true
                )
                agents = [defaultAgent]
                saveAgents()
            }
            return
        }
        agents = decoded
    }

    func saveAgents() {
        guard let encoded = try? JSONEncoder().encode(agents) else { return }
        UserDefaults.standard.set(encoded, forKey: storageKey)
    }

    func addAgent(_ agent: LocalAgent) {
        var newAgent = agent
        // If this is the first agent or marked as default, ensure it's the only default
        if agents.isEmpty || newAgent.isDefault {
            for i in agents.indices {
                agents[i].isDefault = false
            }
            newAgent.isDefault = true
        }
        agents.append(newAgent)
        saveAgents()
    }

    func updateAgent(_ agent: LocalAgent) {
        guard let index = agents.firstIndex(where: { $0.id == agent.id }) else { return }

        var updatedAgent = agent
        updatedAgent.updatedAt = Date()

        // Handle default status
        if updatedAgent.isDefault {
            for i in agents.indices {
                agents[i].isDefault = false
            }
        }

        agents[index] = updatedAgent
        saveAgents()
    }

    func deleteAgent(_ agent: LocalAgent) {
        agents.removeAll { $0.id == agent.id }

        // Ensure at least one default if agents remain
        if !agents.isEmpty && !agents.contains(where: { $0.isDefault }) {
            agents[0].isDefault = true
        }

        saveAgents()
    }

    func setDefault(_ agent: LocalAgent) {
        for i in agents.indices {
            agents[i].isDefault = (agents[i].id == agent.id)
        }
        saveAgents()
    }

    /// Replace all agents (used for sync from server)
    func replaceAllAgents(_ newAgents: [LocalAgent]) {
        agents = newAgents

        // Ensure at least one default
        if !agents.isEmpty && !agents.contains(where: { $0.isDefault }) {
            agents[0].isDefault = true
        }

        saveAgents()
    }

    // MARK: - Helpers

    var defaultAgent: LocalAgent? {
        agents.first { $0.isDefault } ?? agents.first
    }

    func agent(for id: UUID) -> LocalAgent? {
        agents.first { $0.id == id }
    }

    func agents(for provider: AgentProvider) -> [LocalAgent] {
        agents.filter { $0.provider == provider }
    }
}
