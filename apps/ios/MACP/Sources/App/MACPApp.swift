import SwiftUI

@main
struct MACPApp: App {
    @StateObject private var authService = AuthService.shared
    @StateObject private var conversationService = ConversationService.shared
    @StateObject private var apiKeyService = APIKeyService.shared
    @StateObject private var agentStorage = AgentStorageService.shared
    @StateObject private var memoryService = MemoryService.shared
    @StateObject private var rulesService = RulesService.shared
    @StateObject private var archiveService = ArchiveService.shared
    @StateObject private var introductionService = IntroductionService.shared
    @StateObject private var publicAgentService = PublicAgentService.shared
    @StateObject private var deepLinkHandler = DeepLinkHandler.shared
    @StateObject private var inputModeService = InputModeService.shared
    @StateObject private var contactService = ContactService.shared
    @StateObject private var inboxService = InboxService.shared
    @StateObject private var formService = FormService.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authService)
                .environmentObject(conversationService)
                .environmentObject(apiKeyService)
                .environmentObject(agentStorage)
                .environmentObject(memoryService)
                .environmentObject(rulesService)
                .environmentObject(archiveService)
                .environmentObject(introductionService)
                .environmentObject(publicAgentService)
                .environmentObject(deepLinkHandler)
                .environmentObject(inputModeService)
                .environmentObject(contactService)
                .environmentObject(inboxService)
                .environmentObject(formService)
                .onOpenURL { url in
                    deepLinkHandler.handle(url: url)
                }
                .sheet(isPresented: $deepLinkHandler.showPublicAgentSheet) {
                    if let agentId = deepLinkHandler.pendingPublicAgentId {
                        PublicAgentLandingView(agentId: agentId)
                            .environmentObject(publicAgentService)
                            .environmentObject(apiKeyService)
                            .environmentObject(agentStorage)
                            .environmentObject(authService)
                    }
                }
                .sheet(isPresented: $deepLinkHandler.showFormSheet) {
                    if let formId = deepLinkHandler.pendingFormId {
                        FormFillingView(formId: formId)
                            .environmentObject(apiKeyService)
                            .environmentObject(formService)
                    }
                }
        }
    }
}

// MARK: - Deep Link Handler

@MainActor
class DeepLinkHandler: ObservableObject {
    static let shared = DeepLinkHandler()

    // Conversation join handling
    @Published var pendingConversationId: String?
    @Published var showJoinSheet = false

    // Public agent handling
    @Published var pendingPublicAgentId: String?
    @Published var showPublicAgentSheet = false

    // Form handling
    @Published var pendingFormId: String?
    @Published var showFormSheet = false

    // Track if app is ready to handle deep links
    @Published var isReady = false

    private init() {}

    /// Call this when the app's main UI is ready to present sheets
    func markReady() {
        guard !isReady else { return }
        isReady = true
        processPendingDeepLinks()
    }

    /// Process any deep links that arrived before the app was ready
    private func processPendingDeepLinks() {
        if pendingPublicAgentId != nil {
            showPublicAgentSheet = true
        }
        if pendingFormId != nil {
            showFormSheet = true
        }
        if pendingConversationId != nil {
            showJoinSheet = true
        }
    }

    /// Handles incoming deep links and Universal Links
    /// Supported formats:
    /// - macp://join/{conversationId}
    /// - macp://agent/{agentId}
    /// - macp://form/{formId}
    /// - https://macp.io/{id} (Universal Link - could be agent or form)
    func handle(url: URL) {
        let pathComponents = url.pathComponents.filter { $0 != "/" }

        // Handle Universal Links (https://macp.io/{id})
        // Could be an agent or a form - we'll try to detect
        if url.scheme == "https" && (url.host == "macp.io" || url.host == "www.macp.io") {
            if let id = pathComponents.first, !id.isEmpty {
                // Try to determine if it's a form or agent by checking the server
                // For now, we'll check if the ID starts with a form prefix or use a heuristic
                // The server will tell us what type it is when we load it
                Task {
                    await resolveUniversalLink(id: id)
                }
            }
            return
        }

        // Handle custom URL scheme (macp://)
        guard url.scheme == "macp" else { return }

        switch url.host {
        case "join":
            if let conversationId = pathComponents.first {
                pendingConversationId = conversationId
                if isReady { showJoinSheet = true }
            }

        case "agent":
            if let agentId = pathComponents.first {
                pendingPublicAgentId = agentId
                if isReady { showPublicAgentSheet = true }
            }

        case "form":
            if let formId = pathComponents.first {
                pendingFormId = formId
                if isReady { showFormSheet = true }
            }

        default:
            // Handle path-based formats
            if pathComponents.first == "join", pathComponents.count > 1 {
                pendingConversationId = pathComponents[1]
                if isReady { showJoinSheet = true }
            } else if pathComponents.first == "agent", pathComponents.count > 1 {
                pendingPublicAgentId = pathComponents[1]
                if isReady { showPublicAgentSheet = true }
            } else if pathComponents.first == "form", pathComponents.count > 1 {
                pendingFormId = pathComponents[1]
                if isReady { showFormSheet = true }
            }
        }
    }

    /// Resolves a universal link ID to either an agent or form
    private func resolveUniversalLink(id: String) async {
        // Try loading as a form first
        do {
            _ = try await FormService.shared.getPublicForm(formId: id)
            // It's a form
            pendingFormId = id
            if isReady { showFormSheet = true }
            return
        } catch {
            // Not a form, try as agent
        }

        // Assume it's an agent
        pendingPublicAgentId = id
        if isReady { showPublicAgentSheet = true }
    }

    func clearPending() {
        pendingConversationId = nil
        showJoinSheet = false
    }

    func clearPublicAgentPending() {
        pendingPublicAgentId = nil
        showPublicAgentSheet = false
    }

    func clearFormPending() {
        pendingFormId = nil
        showFormSheet = false
    }
}
