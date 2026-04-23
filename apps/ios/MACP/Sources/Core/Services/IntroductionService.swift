import Foundation
import SwiftUI

/// Service for managing agent introduction flows
@MainActor
class IntroductionService: ObservableObject {
    static let shared = IntroductionService()

    @Published var statusByAgent: [String: AgentIntroductionStatus] = [:]
    @Published var isLoading = false
    @Published var error: String?

    private let apiClient = APIClient.shared

    private init() {}

    // MARK: - Status Management

    /// Fetches introduction status for all agents
    func fetchStatus() async {
        isLoading = true
        error = nil

        do {
            let response: IntroductionStatusResponse = try await apiClient.get("/api/introductions")

            // Update status dictionary
            var newStatus: [String: AgentIntroductionStatus] = [:]
            for agent in response.agents {
                newStatus[agent.agentId] = agent
            }
            statusByAgent = newStatus

        } catch {
            // API might not be available yet - this is not a fatal error
            // Just leave statusByAgent empty which means needsIntroduction will return true
            #if DEBUG
            print("[IntroductionService] Could not fetch status (API may not be deployed): \(error)")
            #endif
        }

        isLoading = false
    }

    /// Checks if a specific agent needs introduction
    func needsIntroduction(_ agentId: String) -> Bool {
        guard let status = statusByAgent[agentId] else {
            // No status means not started
            return true
        }
        return status.needsIntroduction
    }

    /// Gets the introduction status for a specific agent
    func getStatus(for agentId: String) -> AgentIntroductionStatus? {
        return statusByAgent[agentId]
    }

    /// Gets the progress for a specific agent
    func getProgress(for agentId: String) -> IntroductionProgress? {
        return statusByAgent[agentId]?.progress
    }

    // MARK: - Introduction Flow

    /// Gets information needed to start an introduction
    func getStartInfo(for agentId: String) async throws -> IntroductionStartInfo {
        return try await apiClient.get("/api/introductions/\(agentId)/start-info")
    }

    /// Creates a new introduction conversation
    /// - Parameters:
    ///   - responderType: Whether a human or agent is responding (default: human)
    ///   - respondingAgent: If agent-to-agent, the agent that will respond to questions
    func createIntroductionConversation(
        agentId: String,
        apiKey: String,
        provider: String,
        agentName: String? = nil,
        agentEmoji: String? = nil,
        introductionGreeting: String? = nil,
        introductionQuestions: [IntroductionQuestion]? = nil,
        responderType: IntroductionResponderType = .human,
        respondingAgent: LocalAgent? = nil
    ) async throws -> CreateIntroductionResponse {
        let request = CreateIntroductionRequest(
            agentId: agentId,
            apiKey: apiKey,
            provider: provider,
            agentName: agentName,
            agentEmoji: agentEmoji,
            introductionGreeting: introductionGreeting,
            introductionQuestions: introductionQuestions,
            responderType: responderType,
            respondingAgentId: respondingAgent?.id.uuidString,
            respondingAgentName: respondingAgent?.name
        )
        return try await apiClient.post("/conversations/introduction", body: request)
    }

    /// Sends a message in an introduction conversation
    func sendMessage(
        conversationId: String,
        content: String
    ) async throws -> IntroductionMessageResponse {
        let request = IntroductionMessageRequest(content: content)
        return try await apiClient.post(
            "/conversations/\(conversationId)/introduction-message",
            body: request
        )
    }

    /// Completes an introduction conversation
    func completeIntroduction(conversationId: String) async throws -> IntroductionCompleteResponse {
        struct EmptyBody: Codable {}
        return try await apiClient.post(
            "/conversations/\(conversationId)/introduction-complete",
            body: EmptyBody()
        )
    }

    /// Skips an introduction for an agent
    func skipIntroduction(for agentId: String) async throws {
        struct SkipResponse: Codable {
            let agentId: String
            let status: String
            let message: String
        }

        struct EmptyBody: Codable {}
        let _: SkipResponse = try await apiClient.post(
            "/api/introductions/\(agentId)/skip",
            body: EmptyBody()
        )

        // Update local status
        if let status = statusByAgent[agentId] {
            statusByAgent[agentId] = AgentIntroductionStatus(
                agentId: status.agentId,
                agentName: status.agentName,
                agentEmoji: status.agentEmoji,
                introductionStatus: .skipped,
                progress: status.progress,
                factsLearned: status.factsLearned,
                rulesLearned: status.rulesLearned,
                completedAt: ISO8601DateFormatter().string(from: Date()),
                needsIntroduction: false
            )
        }
    }

    /// Resets an introduction for an agent (for testing)
    func resetIntroduction(for agentId: String) async throws {
        struct ResetResponse: Codable {
            let agentId: String
            let status: String
            let message: String
        }

        struct EmptyBody: Codable {}
        let _: ResetResponse = try await apiClient.post(
            "/api/introductions/\(agentId)/reset",
            body: EmptyBody()
        )

        // Refresh status
        await fetchStatus()
    }

    // MARK: - Helpers

    /// Updates local status after completing an introduction
    func markCompleted(agentId: String, factsLearned: Int, rulesLearned: Int) {
        if let status = statusByAgent[agentId] {
            statusByAgent[agentId] = AgentIntroductionStatus(
                agentId: status.agentId,
                agentName: status.agentName,
                agentEmoji: status.agentEmoji,
                introductionStatus: .completed,
                progress: IntroductionProgress(
                    questionsAsked: status.progress.totalQuestions,
                    totalQuestions: status.progress.totalQuestions
                ),
                factsLearned: factsLearned,
                rulesLearned: rulesLearned,
                completedAt: ISO8601DateFormatter().string(from: Date()),
                needsIntroduction: false
            )
        }
    }
}
