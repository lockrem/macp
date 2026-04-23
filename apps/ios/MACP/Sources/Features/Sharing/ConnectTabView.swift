import SwiftUI
import UIKit
import AVFoundation

// MARK: - Connect Tab View

/// Main connection hub - scan other agents or share your own
/// Wrapper to make String identifiable for sheet presentation
struct ScannedAgentID: Identifiable {
    let id: String
}

struct ConnectTabView: View {
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var publicAgentService: PublicAgentService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var contactService: ContactService
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var inputModeService: InputModeService

    @State private var showScanner = false
    @State private var showShareSheet: LocalAgent?
    @State private var scannedAgent: ScannedAgentID?
    @State private var pendingAgentAssociation: PendingAgentAssociation?

    struct PendingAgentAssociation: Identifiable {
        let id = UUID()
        let agentId: String
        let agentName: String
        let agentEmoji: String
        let matchingContact: Contact
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    myAgentsSection
                }
                .padding(.vertical)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Connect")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showScanner = true
                    } label: {
                        Image(systemName: "qrcode.viewfinder")
                            .font(.title2)
                    }
                }
            }
            .sheet(isPresented: $showScanner) {
                QRScannerView { scannedValue in
                    handleScannedCode(scannedValue)
                }
            }
            .sheet(item: $showShareSheet) { agent in
                AgentShareSheet(agent: agent)
                    .environmentObject(publicAgentService)
            }
            .fullScreenCover(item: $scannedAgent) { scanned in
                OrchestratedChatView(hostAgentId: scanned.id)
                    .environmentObject(publicAgentService)
                    .environmentObject(apiKeyService)
                    .environmentObject(agentStorage)
                    .environmentObject(contactService)
                    .environmentObject(authService)
                    .environmentObject(inputModeService)
            }
            .alert(
                "Link to Contact?",
                isPresented: Binding(
                    get: { pendingAgentAssociation != nil },
                    set: { if !$0 { pendingAgentAssociation = nil } }
                )
            ) {
                Button("Link to \(pendingAgentAssociation?.matchingContact.name ?? "Contact")") {
                    associateAgentWithContact()
                }
                Button("Skip", role: .cancel) {
                    skipAssociationAndChat()
                }
            } message: {
                if let pending = pendingAgentAssociation {
                    Text("\(pending.agentEmoji) \(pending.agentName) appears to belong to \(pending.matchingContact.name). Would you like to link them?")
                }
            }
        }
    }

    // MARK: - My Agents Section

    private var myAgentsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("My Agents")
                    .font(.headline)

                Spacer()

                Text("\(agentStorage.agents.count) agents")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal)

            if agentStorage.agents.isEmpty {
                emptyAgentsView
            } else {
                LazyVStack(spacing: 12) {
                    ForEach(agentStorage.agents) { agent in
                        ShareableAgentRow(agent: agent) {
                            showShareSheet = agent
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
    }

    private var emptyAgentsView: some View {
        VStack(spacing: 12) {
            Image(systemName: "person.crop.circle.badge.plus")
                .font(.largeTitle)
                .foregroundStyle(.secondary)

            Text("No agents yet")
                .font(.headline)

            Text("Create an agent in the Agents tab to share")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal)
    }

    // MARK: - Actions

    private func handleScannedCode(_ value: String) {
        showScanner = false

        // Extract agent ID from URL or direct ID
        // Formats: "macp://agent/AGENT_ID" or "https://macp.io/AGENT_ID" or just "AGENT_ID"
        var agentId = value

        if value.contains("macp://agent/") {
            agentId = value.replacingOccurrences(of: "macp://agent/", with: "")
        } else if value.contains("macp.io/") {
            if let range = value.range(of: "macp.io/") {
                agentId = String(value[range.upperBound...])
            }
        }

        print("[Connect] Scanned agent ID: \(agentId)")

        // Check if this agent can be associated with a contact
        Task {
            await checkForContactAssociation(agentId: agentId)
        }
    }

    private func checkForContactAssociation(agentId: String) async {
        // First, check if agent is already associated with a contact
        let contacts = contactService.contacts
        let alreadyAssociated = contacts.first { contact in
            contact.agents?.contains { $0.publicAgentId == agentId } ?? false
        }

        if alreadyAssociated != nil {
            // Already associated, just start the conversation
            print("[Connect] Agent already associated with contact, starting conversation")
            scannedAgent = ScannedAgentID(id: agentId)
            return
        }

        // Fetch agent details to get the name
        do {
            let agent = try await publicAgentService.fetchPublicAgent(agentId: agentId)
            print("[Connect] Fetched agent: \(agent.name)")

            // Extract potential contact name from agent name
            // Patterns: "Jane's Assistant", "Assistant for Jane", "Jane - Personal AI"
            let potentialName = extractContactName(from: agent.name)

            if let name = potentialName {
                print("[Connect] Extracted potential contact name: \(name)")

                // Search contacts for this name
                if let matchingContact = findMatchingContact(name: name) {
                    print("[Connect] Found matching contact: \(matchingContact.name)")

                    // Show association prompt
                    pendingAgentAssociation = PendingAgentAssociation(
                        agentId: agentId,
                        agentName: agent.name,
                        agentEmoji: agent.emoji,
                        matchingContact: matchingContact
                    )
                    return
                }
            }

            // No match found, just start the conversation
            scannedAgent = ScannedAgentID(id: agentId)
        } catch {
            print("[Connect] Failed to fetch agent, starting conversation anyway: \(error)")
            scannedAgent = ScannedAgentID(id: agentId)
        }
    }

    private func extractContactName(from agentName: String) -> String? {
        let lowercased = agentName.lowercased()

        // Pattern: "Jane's Assistant" or "Jane's AI"
        if let apostropheRange = lowercased.range(of: "'s ") {
            let name = String(agentName[..<apostropheRange.lowerBound])
            return name.isEmpty ? nil : name
        }

        // Pattern: "Assistant for Jane"
        if let forRange = lowercased.range(of: " for ") {
            let name = String(agentName[forRange.upperBound...])
            return name.isEmpty ? nil : name
        }

        // Pattern: "Jane - Personal AI" or "Jane: Assistant"
        for separator in [" - ", ": ", " | "] {
            if let separatorRange = agentName.range(of: separator) {
                let name = String(agentName[..<separatorRange.lowerBound])
                return name.isEmpty ? nil : name
            }
        }

        return nil
    }

    private func findMatchingContact(name: String) -> Contact? {
        let searchName = name.lowercased()

        return contactService.contacts.first { contact in
            // Check main name
            if contact.name.lowercased().contains(searchName) ||
               searchName.contains(contact.name.lowercased().split(separator: " ").first?.description ?? "") {
                return true
            }

            // Check aliases
            for alias in contact.aliases {
                if alias.lowercased() == searchName || searchName.contains(alias.lowercased()) {
                    return true
                }
            }

            return false
        }
    }

    private func associateAgentWithContact() {
        guard let pending = pendingAgentAssociation else { return }

        Task {
            _ = await contactService.associateAgent(
                contactId: pending.matchingContact.id,
                publicAgentId: pending.agentId,
                agentName: pending.agentName,
                agentEmoji: pending.agentEmoji,
                role: nil,
                discoveredVia: "qr_scan"
            )
            print("[Connect] Associated agent with contact")

            // Now start the conversation
            scannedAgent = ScannedAgentID(id: pending.agentId)
            pendingAgentAssociation = nil
        }
    }

    private func skipAssociationAndChat() {
        guard let pending = pendingAgentAssociation else { return }
        scannedAgent = ScannedAgentID(id: pending.agentId)
        pendingAgentAssociation = nil
    }
}

// MARK: - Shareable Agent Row

private struct ShareableAgentRow: View {
    let agent: LocalAgent
    let onShare: () -> Void

    var accentColor: Color {
        colorFromName(agent.accentColorName)
    }

    private func colorFromName(_ name: String) -> Color {
        switch name.lowercased() {
        case "red": return .red
        case "orange": return .orange
        case "green": return .green
        case "purple": return .purple
        case "cyan": return .cyan
        case "pink": return .pink
        case "yellow": return .yellow
        default: return .blue
        }
    }

    var body: some View {
        HStack(spacing: 16) {
            // Agent avatar
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.15))
                    .frame(width: 50, height: 50)

                Text(agent.emoji)
                    .font(.title2)
            }

            // Agent info
            VStack(alignment: .leading, spacing: 2) {
                Text(agent.name)
                    .font(.headline)

                Text(agent.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            // Share button
            Button {
                onShare()
            } label: {
                Label("Share", systemImage: "qrcode")
                    .font(.subheadline.weight(.medium))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(accentColor)
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemBackground))
        )
    }
}

// MARK: - Agent Share Sheet

private struct AgentShareSheet: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var publicAgentService: PublicAgentService

    let agent: LocalAgent

    @State private var isPublishing = false
    @State private var isUnpublishing = false
    @State private var publishedURL: String?
    @State private var error: String?
    @State private var showUnpublishConfirm = false

    var accentColor: Color {
        colorFromName(agent.accentColorName)
    }

    private func colorFromName(_ name: String) -> Color {
        switch name.lowercased() {
        case "red": return .red
        case "orange": return .orange
        case "green": return .green
        case "purple": return .purple
        case "cyan": return .cyan
        case "pink": return .pink
        case "yellow": return .yellow
        default: return .blue
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                // Agent header
                VStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(accentColor.opacity(0.15))
                            .frame(width: 80, height: 80)

                        Text(agent.emoji)
                            .font(.system(size: 40))
                    }

                    Text(agent.name)
                        .font(.title2.weight(.bold))

                    Text(agent.description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top)

                // QR Code
                if let url = publishedURL ?? publicAgentService.getPublishedInfo(for: agent.id.uuidString)?.url {
                    QRCodeCard(
                        content: url,
                        title: "Scan to Connect",
                        subtitle: "Others can scan this to send their agents",
                        accentColor: accentColor
                    ) {
                        shareURL(url)
                    }

                    // Make Private button
                    Button(role: .destructive) {
                        showUnpublishConfirm = true
                    } label: {
                        HStack {
                            if isUnpublishing {
                                ProgressView()
                                    .tint(.red)
                            } else {
                                Image(systemName: "eye.slash")
                            }
                            Text("Make Private")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(isUnpublishing)
                } else if isPublishing {
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Preparing share link...")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .frame(height: 250)
                } else {
                    // Not published yet
                    VStack(spacing: 16) {
                        Text("Publish to Share")
                            .font(.headline)

                        Text("Make this agent available for others to connect with")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)

                        Button {
                            publishAgent()
                        } label: {
                            Label("Publish Agent", systemImage: "globe")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(accentColor)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }
                    .padding()
                }

                if let error = error {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }

                Spacer()
            }
            .padding()
            .navigationTitle("Share Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                await checkPublishStatus()
            }
            .confirmationDialog(
                "Make Agent Private?",
                isPresented: $showUnpublishConfirm,
                titleVisibility: .visible
            ) {
                Button("Make Private", role: .destructive) {
                    unpublishAgent()
                }
                Button("Cancel", role: .cancel) { }
            } message: {
                Text("This will remove your agent from public access. Anyone with the link will no longer be able to connect.")
            }
        }
    }

    private func checkPublishStatus() async {
        do {
            let status = try await publicAgentService.getPublishStatus(agentId: agent.id.uuidString)
            if status.isPublished, let url = status.url {
                publishedURL = url
            }
        } catch {
            // Not published yet, that's fine
        }
    }

    private func publishAgent() {
        isPublishing = true
        error = nil

        Task {
            do {
                let response = try await publicAgentService.publishAgent(
                    agent: agent,
                    allowDirectChat: true,
                    allowAgentToAgent: true,
                    allowAccompaniedChat: true
                )
                publishedURL = response.url
            } catch {
                self.error = error.localizedDescription
            }
            isPublishing = false
        }
    }

    private func unpublishAgent() {
        isUnpublishing = true
        error = nil

        Task {
            do {
                try await publicAgentService.unpublishAgent(agentId: agent.id.uuidString)
                publishedURL = nil
            } catch {
                self.error = error.localizedDescription
            }
            isUnpublishing = false
        }
    }

    private func shareURL(_ url: String) {
        let activityVC = UIActivityViewController(
            activityItems: [URL(string: url)!],
            applicationActivities: nil
        )

        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let window = windowScene.windows.first,
           let rootVC = window.rootViewController {
            rootVC.present(activityVC, animated: true)
        }
    }
}

// MARK: - Post-Scan Agent Selector

struct PostScanAgentSelector: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var publicAgentService: PublicAgentService
    @EnvironmentObject var apiKeyService: APIKeyService

    let hostAgentId: String
    let onDismiss: () -> Void

    @State private var hostAgent: PublishedAgent?
    @State private var selectedAgentIds: Set<UUID> = []
    @State private var context = ""
    @State private var isLoading = true
    @State private var isStarting = false
    @State private var error: String?
    @State private var showAutonomousChat = false

    var selectedAgents: [LocalAgent] {
        agentStorage.agents.filter { selectedAgentIds.contains($0.id) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading agent...")
                } else if let host = hostAgent {
                    selectionContent(host: host)
                } else {
                    errorView
                }
            }
            .navigationTitle("Connect Agents")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onDismiss()
                        dismiss()
                    }
                }
            }
            .task {
                await loadHostAgent()
            }
            .fullScreenCover(isPresented: $showAutonomousChat) {
                if let host = hostAgent, let firstAgent = selectedAgents.first {
                    AutonomousAgentChatView(
                        hostAgent: host,
                        visitorAgent: firstAgent,
                        visitorContext: context.isEmpty ? nil : context
                    )
                    .environmentObject(publicAgentService)
                    .environmentObject(apiKeyService)
                }
            }
        }
    }

    private func selectionContent(host: PublishedAgent) -> some View {
        ScrollView {
            VStack(spacing: 24) {
                // Host agent card
                hostAgentCard(host)

                // Agent selection
                agentSelectionSection

                // Context input
                contextSection

                // Start button
                startButton

                if let error = error {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
    }

    private func hostAgentCard(_ host: PublishedAgent) -> some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(host.accentColorValue.opacity(0.15))
                    .frame(width: 60, height: 60)

                Text(host.emoji)
                    .font(.system(size: 30))
            }

            Text(host.name)
                .font(.headline)

            if !host.description.isEmpty {
                Text(host.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            if let owner = host.ownerName {
                Text("by \(owner)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemBackground))
        )
    }

    private var agentSelectionSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Select your agent(s)")
                .font(.headline)

            if agentStorage.agents.isEmpty {
                Text("No agents available. Create one first.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding()
            } else {
                VStack(spacing: 8) {
                    ForEach(agentStorage.agents) { agent in
                        ScanAgentSelectionRow(
                            agent: agent,
                            isSelected: selectedAgentIds.contains(agent.id)
                        ) {
                            toggleAgent(agent)
                        }
                    }
                }
            }
        }
    }

    private var contextSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Add context (optional)")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            TextField("e.g., Ask about appointment availability", text: $context, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(2...4)
                .padding(12)
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var startButton: some View {
        Button {
            startConversation()
        } label: {
            HStack {
                if isStarting {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: "arrow.left.arrow.right")
                }
                Text(selectedAgentIds.count > 1 ? "Start Conversations" : "Start Conversation")
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(selectedAgentIds.isEmpty ? Color.gray : Color.blue)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .disabled(selectedAgentIds.isEmpty || isStarting)
    }

    private var errorView: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(.orange)

            Text("Could not load agent")
                .font(.headline)

            Text(error ?? "Unknown error")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Button("Try Again") {
                Task { await loadHostAgent() }
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }

    // MARK: - Actions

    private func loadHostAgent() async {
        isLoading = true
        error = nil

        print("[PostScan] Loading host agent: \(hostAgentId)")

        do {
            hostAgent = try await publicAgentService.fetchPublicAgent(agentId: hostAgentId)
            print("[PostScan] Loaded host agent: \(hostAgent?.name ?? "nil")")
            // Auto-select first agent if only one
            if agentStorage.agents.count == 1, let first = agentStorage.agents.first {
                selectedAgentIds.insert(first.id)
            }
        } catch {
            print("[PostScan] Error loading host agent: \(error)")
            self.error = "Could not find agent: \(hostAgentId)"
        }

        isLoading = false
    }

    private func toggleAgent(_ agent: LocalAgent) {
        if selectedAgentIds.contains(agent.id) {
            selectedAgentIds.remove(agent.id)
        } else {
            selectedAgentIds.insert(agent.id)
        }
    }

    private func startConversation() {
        guard !selectedAgentIds.isEmpty else { return }

        // For now, start with first selected agent
        // TODO: Support multiple parallel conversations
        showAutonomousChat = true
    }
}

// MARK: - Scan Agent Selection Row

private struct ScanAgentSelectionRow: View {
    let agent: LocalAgent
    let isSelected: Bool
    let onTap: () -> Void

    var accentColor: Color {
        colorFromName(agent.accentColorName)
    }

    private func colorFromName(_ name: String) -> Color {
        switch name.lowercased() {
        case "red": return .red
        case "orange": return .orange
        case "green": return .green
        case "purple": return .purple
        case "cyan": return .cyan
        case "pink": return .pink
        case "yellow": return .yellow
        default: return .blue
        }
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Checkbox
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(isSelected ? .blue : .secondary)

                // Avatar
                ZStack {
                    Circle()
                        .fill(accentColor.opacity(0.15))
                        .frame(width: 40, height: 40)

                    Text(agent.emoji)
                        .font(.title3)
                }

                // Info
                VStack(alignment: .leading, spacing: 2) {
                    Text(agent.name)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)

                    Text(agent.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemBackground))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(isSelected ? Color.blue : Color.clear, lineWidth: 2)
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Preview

#Preview {
    ConnectTabView()
        .environmentObject(AgentStorageService.shared)
        .environmentObject(PublicAgentService.shared)
        .environmentObject(APIKeyService.shared)
}
