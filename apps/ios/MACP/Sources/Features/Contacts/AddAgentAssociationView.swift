import SwiftUI

struct AddAgentAssociationView: View {
    @EnvironmentObject var contactService: ContactService
    @Environment(\.dismiss) private var dismiss

    let contactId: String
    var onAgentAdded: ((ContactAgent) -> Void)?

    @State private var searchText = ""
    @State private var publicAgentId = ""
    @State private var agentName = ""
    @State private var agentEmoji = "🤖"
    @State private var role = ""
    @State private var isManualEntry = false
    @State private var isSaving = false
    @State private var showScanner = false
    @State private var isLoadingAgent = false
    @State private var loadError: String?

    // Common emojis for agents
    private let commonEmojis = ["🤖", "🎀", "💼", "💪", "🎓", "🏥", "🍽️", "🎨", "📊", "🔧", "✈️", "🏠"]

    var body: some View {
        NavigationStack {
            Form {
                // Entry mode selector
                Section {
                    Picker("Entry Mode", selection: $isManualEntry) {
                        Text("Enter Agent ID").tag(true)
                        Text("Scan QR Code").tag(false)
                    }
                    .pickerStyle(.segmented)
                }

                if isManualEntry {
                    // Manual entry section
                    Section("Agent Details") {
                        TextField("Public Agent ID", text: $publicAgentId)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()

                        TextField("Agent Name", text: $agentName)

                        // Emoji picker
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Emoji")
                                .font(.caption)
                                .foregroundColor(.secondary)

                            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 8) {
                                ForEach(commonEmojis, id: \.self) { emoji in
                                    Button {
                                        agentEmoji = emoji
                                    } label: {
                                        Text(emoji)
                                            .font(.title2)
                                            .frame(width: 40, height: 40)
                                            .background(
                                                RoundedRectangle(cornerRadius: 8)
                                                    .fill(agentEmoji == emoji ? Color.accentColor.opacity(0.2) : Color.clear)
                                            )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }

                        TextField("Role (optional)", text: $role)
                            .textInputAutocapitalization(.words)
                    }
                } else {
                    // QR Code scanning
                    Section {
                        VStack(spacing: 16) {
                            if isLoadingAgent {
                                ProgressView()
                                    .scaleEffect(1.5)
                                    .frame(height: 60)
                                Text("Loading agent details...")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            } else {
                                Image(systemName: "qrcode.viewfinder")
                                    .font(.system(size: 60))
                                    .foregroundColor(.secondary)

                                Text("Scan a public agent's QR code to link it to this contact")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                    .multilineTextAlignment(.center)

                                if let error = loadError {
                                    Text(error)
                                        .font(.caption)
                                        .foregroundColor(.red)
                                        .multilineTextAlignment(.center)
                                }

                                Button("Open Camera") {
                                    showScanner = true
                                }
                                .buttonStyle(.borderedProminent)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 20)
                    }
                }

                // Role suggestions
                if isManualEntry {
                    Section("Suggested Roles") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(suggestedRoles, id: \.self) { suggestedRole in
                                    Button(suggestedRole) {
                                        role = suggestedRole
                                    }
                                    .buttonStyle(.bordered)
                                    .tint(role == suggestedRole ? .accentColor : .secondary)
                                }
                            }
                        }
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    }
                }
            }
            .navigationTitle("Add Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        addAgent()
                    }
                    .disabled(!canSave || isSaving)
                }
            }
            .interactiveDismissDisabled(isSaving)
            .fullScreenCover(isPresented: $showScanner) {
                QRScannerView { scannedCode in
                    showScanner = false
                    handleScannedCode(scannedCode)
                }
            }
        }
    }

    // MARK: - Computed Properties

    private var canSave: Bool {
        !publicAgentId.isEmpty && !agentName.isEmpty
    }

    private var suggestedRoles: [String] {
        ["Assistant", "Health Coach", "Financial Advisor", "Scheduler", "Support", "Personal", "Work"]
    }

    // MARK: - Actions

    private func handleScannedCode(_ code: String) {
        loadError = nil
        isLoadingAgent = true

        // Parse the scanned code - it could be:
        // 1. A URL like macp://agent/AGENT_ID or https://macp.io/agent/AGENT_ID
        // 2. Just the agent ID directly
        var agentId = code

        if let url = URL(string: code) {
            // Extract agent ID from URL path
            let pathComponents = url.pathComponents
            if let agentIndex = pathComponents.firstIndex(of: "agent"),
               agentIndex + 1 < pathComponents.count {
                agentId = pathComponents[agentIndex + 1]
            } else if pathComponents.count > 1 {
                // Last path component might be the agent ID
                agentId = pathComponents.last ?? code
            }
        }

        // Fetch agent details from API
        Task {
            do {
                if let agentDetails = await fetchPublicAgent(agentId: agentId) {
                    publicAgentId = agentDetails.agentId
                    agentName = agentDetails.name
                    agentEmoji = agentDetails.emoji ?? "🤖"
                    // Switch to manual entry to show/confirm details
                    isManualEntry = true
                    isLoadingAgent = false
                } else {
                    loadError = "Could not find agent with ID: \(agentId)"
                    isLoadingAgent = false
                }
            }
        }
    }

    private func fetchPublicAgent(agentId: String) async -> (agentId: String, name: String, emoji: String?)? {
        guard let baseURL = URL(string: APIClient.shared.baseURL),
              let url = URL(string: "\(baseURL)/public/agent/\(agentId)") else {
            return nil
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                return nil
            }

            struct PublicAgentResponse: Decodable {
                let agentId: String
                let name: String
                let emoji: String?
            }

            let agent = try JSONDecoder().decode(PublicAgentResponse.self, from: data)
            return (agent.agentId, agent.name, agent.emoji)
        } catch {
            print("Failed to fetch public agent: \(error)")
            return nil
        }
    }

    private func addAgent() {
        guard canSave else { return }

        isSaving = true

        Task {
            if let newAgent = await contactService.associateAgent(
                contactId: contactId,
                publicAgentId: publicAgentId.trimmingCharacters(in: .whitespaces),
                agentName: agentName.trimmingCharacters(in: .whitespaces),
                agentEmoji: agentEmoji,
                role: role.isEmpty ? nil : role.trimmingCharacters(in: .whitespaces),
                discoveredVia: "manual"
            ) {
                onAgentAdded?(newAgent)
            }

            isSaving = false
            dismiss()
        }
    }
}

// MARK: - Preview

#Preview {
    AddAgentAssociationView(contactId: "test-contact-id")
        .environmentObject(ContactService.shared)
}
