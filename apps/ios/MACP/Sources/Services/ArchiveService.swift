import Foundation

@MainActor
class ArchiveService: ObservableObject {
    static let shared = ArchiveService()

    @Published var archives: [Archive] = []
    @Published var isLoading = false
    @Published var error: String?

    private init() {}

    // MARK: - Archive a Conversation

    func archiveConversation(_ conversationId: String) async -> ArchiveResponse? {
        isLoading = true
        error = nil

        do {
            let response: ArchiveResponse = try await APIClient.shared.post(
                "/conversations/\(conversationId)/archive",
                body: EmptyBody()
            )
            // Refresh the archives list
            await fetchArchives()
            isLoading = false
            return response
        } catch {
            self.error = error.localizedDescription
            isLoading = false
            return nil
        }
    }

    // MARK: - Fetch All Archives

    func fetchArchives() async {
        isLoading = true
        error = nil

        do {
            let response: ArchivesResponse = try await APIClient.shared.get("/archives")
            self.archives = response.archives
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Get Archive Details

    func getArchive(_ archiveId: String) async -> Archive? {
        do {
            let archive: Archive = try await APIClient.shared.get("/archives/\(archiveId)")
            return archive
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    // MARK: - Get Full Transcript

    func getTranscript(_ archiveId: String) async -> ArchiveTranscript? {
        do {
            let transcript: ArchiveTranscript = try await APIClient.shared.get("/archives/\(archiveId)/transcript")
            return transcript
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    // MARK: - Delete Archive

    func deleteArchive(_ archiveId: String) async -> Bool {
        do {
            try await APIClient.shared.delete("/archives/\(archiveId)")
            // Remove from local list
            archives.removeAll { $0.archiveId == archiveId }
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }
}

// MARK: - Models

struct Archive: Codable, Identifiable {
    let archiveId: String
    let conversationId: String
    let topic: String
    let goal: String?
    let status: String
    let totalTurns: Int
    let messageCount: Int
    let participants: [ArchiveParticipant]
    let archivedAt: String

    var id: String { archiveId }

    var archivedDate: Date? {
        ISO8601DateFormatter().date(from: archivedAt)
    }
}

struct ArchiveParticipant: Codable {
    let agentName: String
    let provider: String
}

struct ArchiveResponse: Codable {
    let archiveId: String
    let conversationId: String
    let topic: String
    let messageCount: Int
    let archivedAt: String
}

struct ArchivesResponse: Codable {
    let archives: [Archive]
}

struct ArchiveTranscript: Codable {
    let version: String
    let metadata: TranscriptMetadata
    let messages: [TranscriptMessage]
}

struct TranscriptMetadata: Codable {
    let archiveId: String
    let conversationId: String
    let topic: String
    let goal: String?
    let participants: [ArchiveParticipant]
    let status: String
    let totalTurns: Int
    let startedAt: String?
    let completedAt: String
    let archivedAt: String
}

struct TranscriptMessage: Codable, Identifiable {
    let turnNumber: Int
    let agentName: String
    let provider: String
    let content: String
    let timestamp: String

    var id: String { "\(turnNumber)-\(agentName)" }

    var timestampDate: Date? {
        ISO8601DateFormatter().date(from: timestamp)
    }
}
