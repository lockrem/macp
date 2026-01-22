import SwiftUI

@main
struct MACPApp: App {
    @StateObject private var authService = AuthService.shared
    @StateObject private var conversationService = ConversationService.shared
    @StateObject private var apiKeyService = APIKeyService.shared
    @StateObject private var agentStorage = AgentStorageService.shared
    @StateObject private var memoryService = MemoryService.shared
    @StateObject private var archiveService = ArchiveService.shared
    @StateObject private var deepLinkHandler = DeepLinkHandler.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authService)
                .environmentObject(conversationService)
                .environmentObject(apiKeyService)
                .environmentObject(agentStorage)
                .environmentObject(memoryService)
                .environmentObject(archiveService)
                .environmentObject(deepLinkHandler)
                .onOpenURL { url in
                    deepLinkHandler.handle(url: url)
                }
        }
    }
}

// MARK: - Deep Link Handler

@MainActor
class DeepLinkHandler: ObservableObject {
    static let shared = DeepLinkHandler()

    @Published var pendingConversationId: String?
    @Published var showJoinSheet = false

    private init() {}

    /// Handles incoming deep links
    /// Supported formats:
    /// - macp://join/{conversationId}
    func handle(url: URL) {
        guard url.scheme == "macp" else { return }

        let pathComponents = url.pathComponents.filter { $0 != "/" }

        switch url.host {
        case "join":
            // macp://join/{conversationId}
            if let conversationId = pathComponents.first {
                pendingConversationId = conversationId
                showJoinSheet = true
            }
        default:
            // Also handle macp://join/{id} format where join is first path component
            if pathComponents.first == "join", pathComponents.count > 1 {
                pendingConversationId = pathComponents[1]
                showJoinSheet = true
            }
        }
    }

    func clearPending() {
        pendingConversationId = nil
        showJoinSheet = false
    }
}
