import Foundation
import Combine

/// Service for managing user grounding preferences (AI behavior settings)
@MainActor
class GroundingService: ObservableObject {
    static let shared = GroundingService()

    @Published var preferences: GroundingPreferences?
    @Published var presets: [GroundingPreset] = []
    @Published var guardrails: GroundingGuardrails?
    @Published var isLoading = false
    @Published var error: String?

    private let api = APIClient.shared

    private init() {}

    // MARK: - Fetch Presets

    func fetchPresets() async {
        do {
            let response: PresetsResponse = try await api.get("/api/grounding/presets")
            self.presets = response.presets
            self.guardrails = response.guardrails
        } catch {
            print("[GroundingService] Failed to fetch presets: \(error)")
        }
    }

    // MARK: - Fetch Preferences

    func fetchPreferences() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let response: PreferencesResponse = try await api.get("/api/grounding/preferences")
            self.preferences = GroundingPreferences(
                preset: response.preset,
                presetName: response.presetName,
                isCustomized: response.isCustomized,
                agentResponseWords: response.preferences.agentResponseWords,
                hostResponseWords: response.preferences.hostResponseWords,
                participationStyle: response.preferences.participationStyle,
                responseStyle: response.preferences.responseStyle,
                formality: response.preferences.formality,
                memorySharing: response.preferences.memorySharing,
                customSystemPromptSuffix: response.preferences.customSystemPromptSuffix
            )
            self.error = nil
        } catch {
            print("[GroundingService] Failed to fetch preferences: \(error)")
            self.error = "Failed to load preferences"
        }
    }

    // MARK: - Update Preferences

    func updatePreferences(_ updates: GroundingPreferencesUpdate) async -> Bool {
        do {
            let _: UpdateResponse = try await api.put("/api/grounding/preferences", body: updates)
            await fetchPreferences()
            return true
        } catch {
            print("[GroundingService] Failed to update preferences: \(error)")
            return false
        }
    }

    // MARK: - Apply Preset

    func applyPreset(_ preset: String) async -> Bool {
        do {
            let body = PresetRequest(preset: preset)
            let _: UpdateResponse = try await api.post("/api/grounding/preferences/preset", body: body)
            await fetchPreferences()
            return true
        } catch {
            print("[GroundingService] Failed to apply preset: \(error)")
            return false
        }
    }

    // MARK: - Reset to Defaults

    func resetToDefaults() async -> Bool {
        do {
            let _: UpdateResponse = try await api.post("/api/grounding/preferences/reset", body: GroundingEmptyBody())
            await fetchPreferences()
            return true
        } catch {
            print("[GroundingService] Failed to reset preferences: \(error)")
            return false
        }
    }

    // MARK: - Agent Overrides

    func fetchAgentOverrides(agentId: String) async -> AgentGroundingOverrides? {
        do {
            let response: AgentOverridesResponse = try await api.get("/api/grounding/agents/\(agentId)")
            return AgentGroundingOverrides(
                agentId: response.agentId,
                hasOverrides: response.hasOverrides,
                wordLimit: response.overrides.wordLimit,
                responseStyle: response.overrides.responseStyle,
                formality: response.overrides.formality,
                memorySharing: response.overrides.memorySharing
            )
        } catch {
            print("[GroundingService] Failed to fetch agent overrides: \(error)")
            return nil
        }
    }

    func updateAgentOverrides(agentId: String, overrides: AgentGroundingOverridesUpdate) async -> Bool {
        do {
            let _: UpdateResponse = try await api.put("/api/grounding/agents/\(agentId)", body: overrides)
            return true
        } catch {
            print("[GroundingService] Failed to update agent overrides: \(error)")
            return false
        }
    }

    func deleteAgentOverrides(agentId: String) async -> Bool {
        do {
            try await api.delete("/api/grounding/agents/\(agentId)")
            return true
        } catch {
            print("[GroundingService] Failed to delete agent overrides: \(error)")
            return false
        }
    }
}

// MARK: - Models

struct GroundingPreferences {
    var preset: String
    var presetName: String
    var isCustomized: Bool
    var agentResponseWords: Int
    var hostResponseWords: Int
    var participationStyle: String
    var responseStyle: String
    var formality: String
    var memorySharing: String
    var customSystemPromptSuffix: String?
}

struct GroundingPreferencesUpdate: Codable {
    var preset: String?
    var agentResponseWords: Int?
    var hostResponseWords: Int?
    var participationStyle: String?
    var responseStyle: String?
    var formality: String?
    var memorySharing: String?
    var customSystemPromptSuffix: String?
}

struct GroundingPreset: Codable, Identifiable {
    let id: String
    let name: String
    let description: String
    let settings: PresetSettings

    struct PresetSettings: Codable {
        let agentResponseWords: Int
        let hostResponseWords: Int
        let participationStyle: String
        let responseStyle: String
        let formality: String
        let memorySharing: String
    }
}

struct GroundingGuardrails: Codable {
    let minResponseWords: Int
    let maxResponseWords: Int
    let minAgentsPerTurn: Int
    let maxAgentsPerTurn: Int
}

struct AgentGroundingOverrides {
    let agentId: String
    let hasOverrides: Bool
    var wordLimit: Int?
    var responseStyle: String?
    var formality: String?
    var memorySharing: String?
}

struct AgentGroundingOverridesUpdate: Codable {
    var wordLimit: Int?
    var responseStyle: String?
    var formality: String?
    var memorySharing: String?
}

// MARK: - API Response Models

private struct PresetsResponse: Codable {
    let presets: [GroundingPreset]
    let guardrails: GroundingGuardrails
}

private struct PreferencesResponse: Codable {
    let preset: String
    let presetName: String
    let isCustomized: Bool
    let preferences: PreferencesData

    struct PreferencesData: Codable {
        let agentResponseWords: Int
        let hostResponseWords: Int
        let participationStyle: String
        let responseStyle: String
        let formality: String
        let memorySharing: String
        let customSystemPromptSuffix: String?
    }
}

private struct AgentOverridesResponse: Codable {
    let agentId: String
    let hasOverrides: Bool
    let overrides: OverridesData

    struct OverridesData: Codable {
        let wordLimit: Int?
        let responseStyle: String?
        let formality: String?
        let memorySharing: String?
    }
}

private struct PresetRequest: Codable {
    let preset: String
}

private struct GroundingEmptyBody: Codable {}

private struct UpdateResponse: Codable {
    let success: Bool
}
