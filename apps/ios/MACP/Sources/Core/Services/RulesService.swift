import Foundation

/// Manages user rules/preferences per agent
/// Rules are explicit instructions that modify agent behavior
/// Stored in S3, encrypted, and synced across devices
@MainActor
class RulesService: ObservableObject {
    static let shared = RulesService()

    @Published var isLoading = false
    @Published var error: String?

    // Rules state
    @Published var rulesIndex: RulesIndex?
    @Published var loadedAgentRules: [String: AgentRules] = [:]

    private let baseURL: String

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    private init() {
        self.baseURL = "\(APIClient.shared.baseURL)/api/rules"
    }

    // MARK: - Index Operations

    /// Fetches the rules index (list of all agents with rules)
    func fetchIndex() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let index: RulesIndex = try await APIClient.shared.get("/api/rules")
            self.rulesIndex = index
            print("[Rules] Loaded index: \(index.agents.count) agents, \(index.totalRules) rules")
        } catch {
            self.error = "Failed to load rules index: \(error.localizedDescription)"
            print("[Rules] Failed to fetch index: \(error)")
        }
    }

    // MARK: - Agent Rules Operations

    /// Fetches rules for a specific agent
    func fetchAgentRules(_ agentId: String) async -> AgentRules? {
        isLoading = true
        defer { isLoading = false }

        do {
            let rules: AgentRules = try await APIClient.shared.get("/api/rules/\(agentId)")
            loadedAgentRules[agentId] = rules
            return rules
        } catch {
            print("[Rules] Failed to fetch rules for \(agentId): \(error)")
            return nil
        }
    }

    /// Fetches rules for multiple agents at once
    func fetchBulkRules(_ agentIds: [String]) async -> BulkRulesResponse? {
        isLoading = true
        defer { isLoading = false }

        do {
            let response: BulkRulesResponse = try await APIClient.shared.post(
                "/api/rules/bulk",
                body: ["agentIds": agentIds]
            )

            // Cache loaded rules
            for (agentId, rules) in response.rules {
                if let rules = rules {
                    loadedAgentRules[agentId] = rules
                }
            }

            return response
        } catch {
            print("[Rules] Failed to fetch bulk rules: \(error)")
            return nil
        }
    }

    // MARK: - Rule CRUD Operations

    /// Adds a new rule for an agent
    func addRule(agentId: String, content: String, agentName: String? = nil) async -> AgentRule? {
        isLoading = true
        defer { isLoading = false }

        do {
            var body: [String: String] = ["content": content]
            if let name = agentName {
                body["agentName"] = name
            }

            let response: AddRuleResponse = try await APIClient.shared.post(
                "/api/rules/\(agentId)",
                body: body
            )

            // Update local cache
            loadedAgentRules[agentId] = response.agentRules
            rulesIndex = response.index

            print("[Rules] Added rule for \(agentId): \(response.rule.id)")
            return response.rule
        } catch {
            self.error = "Failed to add rule: \(error.localizedDescription)"
            print("[Rules] Failed to add rule: \(error)")
            return nil
        }
    }

    /// Updates an existing rule
    func updateRule(agentId: String, ruleId: String, content: String) async -> Bool {
        isLoading = true
        defer { isLoading = false }

        do {
            let _: [String: String] = try await APIClient.shared.put(
                "/api/rules/\(agentId)/\(ruleId)",
                body: ["content": content]
            )

            // Update local cache
            if var rules = loadedAgentRules[agentId],
               let index = rules.rules.firstIndex(where: { $0.id == ruleId }) {
                rules.rules[index].content = content
                rules.rules[index].updatedAt = ISO8601DateFormatter().string(from: Date())
                loadedAgentRules[agentId] = rules
            }

            print("[Rules] Updated rule \(ruleId) for \(agentId)")
            return true
        } catch {
            self.error = "Failed to update rule: \(error.localizedDescription)"
            print("[Rules] Failed to update rule: \(error)")
            return false
        }
    }

    /// Deletes a rule
    func deleteRule(agentId: String, ruleId: String) async -> Bool {
        isLoading = true
        defer { isLoading = false }

        do {
            try await APIClient.shared.delete("/api/rules/\(agentId)/\(ruleId)")

            // Update local cache
            if var rules = loadedAgentRules[agentId] {
                rules.rules.removeAll { $0.id == ruleId }
                if rules.rules.isEmpty {
                    loadedAgentRules.removeValue(forKey: agentId)
                } else {
                    loadedAgentRules[agentId] = rules
                }
            }

            // Update index
            if var index = rulesIndex {
                if let agentIndex = index.agents.firstIndex(where: { $0.agentId == agentId }) {
                    index.agents[agentIndex].ruleCount -= 1
                    if index.agents[agentIndex].ruleCount <= 0 {
                        index.agents.remove(at: agentIndex)
                    }
                }
                index.totalRules -= 1
                rulesIndex = index
            }

            print("[Rules] Deleted rule \(ruleId) for \(agentId)")
            return true
        } catch {
            self.error = "Failed to delete rule: \(error.localizedDescription)"
            print("[Rules] Failed to delete rule: \(error)")
            return false
        }
    }

    /// Deletes all rules for an agent
    func deleteAllRules(agentId: String) async -> Bool {
        isLoading = true
        defer { isLoading = false }

        do {
            try await APIClient.shared.delete("/api/rules/\(agentId)")

            // Update local cache
            loadedAgentRules.removeValue(forKey: agentId)

            // Update index
            if var index = rulesIndex {
                index.agents.removeAll { $0.agentId == agentId }
                index.totalRules = index.agents.reduce(0) { $0 + $1.ruleCount }
                rulesIndex = index
            }

            print("[Rules] Deleted all rules for \(agentId)")
            return true
        } catch {
            self.error = "Failed to delete rules: \(error.localizedDescription)"
            print("[Rules] Failed to delete rules: \(error)")
            return false
        }
    }

    // MARK: - Helpers

    /// Gets rules for an agent from cache, or fetches if not loaded
    func getRules(for agentId: String) async -> [AgentRule] {
        if let cached = loadedAgentRules[agentId] {
            return cached.rules
        }

        if let fetched = await fetchAgentRules(agentId) {
            return fetched.rules
        }

        return []
    }

    /// Gets the rule count for an agent
    func ruleCount(for agentId: String) -> Int {
        if let cached = loadedAgentRules[agentId] {
            return cached.rules.count
        }
        return rulesIndex?.agents.first { $0.agentId == agentId }?.ruleCount ?? 0
    }

    /// Checks if an agent has any rules
    func hasRules(for agentId: String) -> Bool {
        ruleCount(for: agentId) > 0
    }

    /// Clears all caches
    func invalidateAllCaches() {
        rulesIndex = nil
        loadedAgentRules.removeAll()
    }
}
