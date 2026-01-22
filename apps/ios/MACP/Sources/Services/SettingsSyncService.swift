import Foundation

/// Syncs API keys and agents with the server for cross-device access
@MainActor
class SettingsSyncService: ObservableObject {
    static let shared = SettingsSyncService()

    @Published var isSyncing = false
    @Published var lastSyncDate: Date?
    @Published var error: String?

    private init() {}

    // MARK: - Sync from Server (on login)

    func syncFromServer() async {
        isSyncing = true
        error = nil

        do {
            let response: SettingsResponse = try await APIClient.shared.get("/settings")

            if let settings = response.settings {
                // Import API keys
                if let apiKeys = settings.apiKeys {
                    if let key = apiKeys.anthropic, !key.isEmpty {
                        APIKeyService.shared.saveKey(key, for: "anthropic")
                    }
                    if let key = apiKeys.openai, !key.isEmpty {
                        APIKeyService.shared.saveKey(key, for: "openai")
                    }
                    if let key = apiKeys.gemini, !key.isEmpty {
                        APIKeyService.shared.saveKey(key, for: "gemini")
                    }
                    if let key = apiKeys.groq, !key.isEmpty {
                        APIKeyService.shared.saveKey(key, for: "groq")
                    }
                }

                // Import agents (merge with local, server wins for conflicts)
                if let serverAgents = settings.agents {
                    let localAgents = AgentStorageService.shared.agents
                    var mergedAgents: [LocalAgent] = []

                    // Add all server agents
                    for serverAgent in serverAgents {
                        mergedAgents.append(serverAgent)
                    }

                    // Add local agents that aren't on server (by ID)
                    let serverIds = Set(serverAgents.map { $0.id })
                    for localAgent in localAgents {
                        if !serverIds.contains(localAgent.id) {
                            mergedAgents.append(localAgent)
                        }
                    }

                    AgentStorageService.shared.replaceAllAgents(mergedAgents)
                }

                lastSyncDate = Date()
                print("[Sync] Settings synced from server")
            }
        } catch APIError.unauthorized {
            // Token refresh failed and user was signed out by APIClient
            // Don't show error - user will see sign-in screen
            print("[Sync] Authentication failed, user signed out")
        } catch {
            self.error = "Failed to sync: \(error.localizedDescription)"
            print("[Sync] Failed to sync from server: \(error)")
        }

        isSyncing = false
    }

    // MARK: - Sync to Server

    func syncToServer() async {
        isSyncing = true
        error = nil

        let settings = SettingsPayload(
            apiKeys: APIKeysPayload(
                anthropic: APIKeyService.shared.getKey(for: "anthropic"),
                openai: APIKeyService.shared.getKey(for: "openai"),
                gemini: APIKeyService.shared.getKey(for: "gemini"),
                groq: APIKeyService.shared.getKey(for: "groq")
            ),
            agents: AgentStorageService.shared.agents
        )

        do {
            let _: SyncResponse = try await APIClient.shared.put("/settings", body: settings)
            lastSyncDate = Date()
            print("[Sync] Settings synced to server")
        } catch {
            self.error = "Failed to save: \(error.localizedDescription)"
            print("[Sync] Failed to sync to server: \(error)")
        }

        isSyncing = false
    }

    // MARK: - Sync API Keys Only

    func syncAPIKeys() async {
        let payload = SettingsPayload(
            apiKeys: APIKeysPayload(
                anthropic: APIKeyService.shared.getKey(for: "anthropic"),
                openai: APIKeyService.shared.getKey(for: "openai"),
                gemini: APIKeyService.shared.getKey(for: "gemini"),
                groq: APIKeyService.shared.getKey(for: "groq")
            ),
            agents: nil
        )

        do {
            let _: SyncResponse = try await APIClient.shared.request("/settings", method: "PATCH", body: payload)
            print("[Sync] API keys synced")
        } catch {
            print("[Sync] Failed to sync API keys: \(error)")
        }
    }

    // MARK: - Sync Agents Only

    func syncAgents() async {
        let payload = SettingsPayload(
            apiKeys: nil,
            agents: AgentStorageService.shared.agents
        )

        do {
            let _: SyncResponse = try await APIClient.shared.request("/settings", method: "PATCH", body: payload)
            print("[Sync] Agents synced")
        } catch {
            print("[Sync] Failed to sync agents: \(error)")
        }
    }
}

// MARK: - Models

struct SettingsResponse: Codable {
    let settings: ServerSettings?
}

struct ServerSettings: Codable {
    let apiKeys: APIKeysPayload?
    let agents: [LocalAgent]?
    let updatedAt: String?
}

struct SettingsPayload: Codable {
    let apiKeys: APIKeysPayload?
    let agents: [LocalAgent]?
}

struct APIKeysPayload: Codable {
    let anthropic: String?
    let openai: String?
    let gemini: String?
    let groq: String?
}

struct SyncResponse: Codable {
    let success: Bool?
    let updatedAt: String?
    let error: String?
}

