import SwiftUI

struct ContactDetailView: View {
    @EnvironmentObject var contactService: ContactService
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var publicAgentService: PublicAgentService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var inputModeService: InputModeService
    @Environment(\.dismiss) private var dismiss

    @State var contact: Contact
    @State private var isEditing = false
    @State private var showAddAgent = false
    @State private var isLoading = false

    // Agent interaction state
    @State private var selectedAgent: ContactAgent?
    @State private var showAgentActions = false
    @State private var showAgentChat = false
    @State private var editingAgent: ContactAgent?

    // Research results state
    @State private var contactResearch: [InboxItem] = []
    @State private var selectedResearchItem: InboxItem?

    // Edit state
    @State private var editName = ""
    @State private var editAliases = ""
    @State private var editRelationship: RelationshipType = .friend
    @State private var editBirthday = ""
    @State private var editEmail = ""
    @State private var editPhone = ""
    @State private var editNotes = ""
    @State private var editTags = ""

    var body: some View {
        NavigationStack {
            List {
                // Header section with avatar
                Section {
                    VStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(avatarColor.opacity(0.2))
                                .frame(width: 80, height: 80)

                            Text(initials)
                                .font(.system(size: 28, weight: .semibold))
                                .foregroundColor(avatarColor)
                        }

                        Text(contact.name)
                            .font(.title2)
                            .fontWeight(.semibold)

                        if let relationship = contact.relationship {
                            HStack(spacing: 4) {
                                if let type = RelationshipType(rawValue: relationship) {
                                    Image(systemName: type.icon)
                                }
                                Text(RelationshipType(rawValue: relationship)?.displayName ?? relationship.capitalized)
                            }
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
                .listRowBackground(Color.clear)

                // Contact details
                Section("Details") {
                    if !contact.aliases.isEmpty {
                        DetailRow(label: "Aliases", value: contact.aliases.joined(separator: ", "))
                    }

                    if let birthday = contact.birthday, !birthday.isEmpty {
                        DetailRow(label: "Birthday", value: formatBirthday(birthday), icon: "gift")
                    }

                    if let email = contact.email, !email.isEmpty {
                        DetailRow(label: "Email", value: email, icon: "envelope")
                    }

                    if let phone = contact.phone, !phone.isEmpty {
                        DetailRow(label: "Phone", value: phone, icon: "phone")
                    }
                }

                // Tags
                if !contact.tags.isEmpty {
                    Section("Tags") {
                        FlowLayout(spacing: 8) {
                            ForEach(contact.tags, id: \.self) { tag in
                                Text(tag)
                                    .font(.caption)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(Color.secondary.opacity(0.15))
                                    .cornerRadius(12)
                            }
                        }
                    }
                }

                // Notes
                if let notes = contact.notes, !notes.isEmpty {
                    Section("Notes") {
                        Text(notes)
                            .font(.body)
                    }
                }

                // Associated agents
                Section {
                    if let agents = contact.agents, !agents.isEmpty {
                        ForEach(agents) { agent in
                            Button {
                                selectedAgent = agent
                                showAgentActions = true
                            } label: {
                                AgentAssociationRow(agent: agent)
                            }
                            .buttonStyle(.plain)
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    Task {
                                        await contactService.removeAgentAssociation(
                                            contactId: contact.id,
                                            agentId: agent.publicAgentId
                                        )
                                        await refreshContact()
                                    }
                                } label: {
                                    Label("Remove", systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .leading) {
                                Button {
                                    selectedAgent = agent
                                    showAgentChat = true
                                } label: {
                                    Label("Chat", systemImage: "message")
                                }
                                .tint(.blue)
                            }
                        }
                    }

                    Button {
                        showAddAgent = true
                    } label: {
                        Label("Add Agent", systemImage: "plus.circle")
                    }
                } header: {
                    Text("Associated Agents")
                } footer: {
                    Text("Tap an agent to chat or edit. Swipe for quick actions.")
                }

                // Research results section
                if !contactResearch.isEmpty {
                    Section {
                        ForEach(contactResearch) { item in
                            ResearchResultRow(item: item) {
                                selectedResearchItem = item
                            }
                        }
                    } header: {
                        Text("Research Results")
                    } footer: {
                        Text("Completed research tasks related to this contact.")
                    }
                }
            }
            .navigationTitle("Contact")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    Button("Edit") {
                        prepareEditState()
                        isEditing = true
                    }
                }
            }
            .sheet(isPresented: $isEditing) {
                editSheet
            }
            .sheet(isPresented: $showAddAgent) {
                AddAgentAssociationView(contactId: contact.id) { newAgent in
                    if contact.agents == nil {
                        contact.agents = []
                    }
                    contact.agents?.append(newAgent)
                }
                .environmentObject(contactService)
            }
            .sheet(item: $editingAgent) { agent in
                EditAgentAssociationView(
                    contactId: contact.id,
                    agent: agent
                ) {
                    Task { await refreshContact() }
                }
                .environmentObject(contactService)
            }
            .fullScreenCover(isPresented: $showAgentChat) {
                if let agent = selectedAgent {
                    OrchestratedChatView(hostAgentId: agent.publicAgentId)
                        .environmentObject(publicAgentService)
                        .environmentObject(apiKeyService)
                        .environmentObject(agentStorage)
                        .environmentObject(contactService)
                        .environmentObject(authService)
                        .environmentObject(inputModeService)
                }
            }
            .confirmationDialog(
                selectedAgent?.agentName ?? "Agent",
                isPresented: $showAgentActions,
                titleVisibility: .visible
            ) {
                Button("Start Conversation") {
                    showAgentChat = true
                }

                Button("Edit Association") {
                    editingAgent = selectedAgent
                }

                Button("Remove from Contact", role: .destructive) {
                    if let agent = selectedAgent {
                        Task {
                            await contactService.removeAgentAssociation(
                                contactId: contact.id,
                                agentId: agent.publicAgentId
                            )
                            await refreshContact()
                        }
                    }
                }

                Button("Cancel", role: .cancel) { }
            } message: {
                if let agent = selectedAgent {
                    Text("\(agent.agentEmoji ?? "🤖") \(agent.agentName)")
                }
            }
            .task {
                await refreshContact()
                await loadContactResearch()
            }
            .sheet(item: $selectedResearchItem) { item in
                InboxItemDetailView(item: item)
                    .environmentObject(InboxService.shared)
                    .environmentObject(contactService)
            }
        }
    }

    private func loadContactResearch() async {
        contactResearch = await InboxService.shared.fetchItemsForContact(contact.id)
    }

    // MARK: - Edit Sheet

    private var editSheet: some View {
        NavigationStack {
            Form {
                Section("Basic Info") {
                    TextField("Name", text: $editName)
                        .textContentType(.name)

                    TextField("Aliases (comma-separated)", text: $editAliases)

                    Picker("Relationship", selection: $editRelationship) {
                        ForEach(RelationshipType.allCases, id: \.self) { type in
                            Label(type.displayName, systemImage: type.icon)
                                .tag(type)
                        }
                    }
                    .pickerStyle(.navigationLink)
                }

                Section("Contact Details") {
                    TextField("Email", text: $editEmail)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)

                    TextField("Phone", text: $editPhone)
                        .textContentType(.telephoneNumber)
                        .keyboardType(.phonePad)

                    TextField("Birthday (MM-DD or YYYY-MM-DD)", text: $editBirthday)
                }

                Section("Organization") {
                    TextField("Tags (comma-separated)", text: $editTags)
                }

                Section("Notes") {
                    TextEditor(text: $editNotes)
                        .frame(minHeight: 100)
                }
            }
            .navigationTitle("Edit Contact")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        isEditing = false
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saveChanges()
                    }
                    .disabled(editName.isEmpty)
                }
            }
        }
    }

    // MARK: - Helper Methods

    private func prepareEditState() {
        editName = contact.name
        editAliases = contact.aliases.joined(separator: ", ")
        editRelationship = RelationshipType(rawValue: contact.relationship ?? "") ?? .friend
        editBirthday = contact.birthday ?? ""
        editEmail = contact.email ?? ""
        editPhone = contact.phone ?? ""
        editNotes = contact.notes ?? ""
        editTags = contact.tags.joined(separator: ", ")
    }

    private func saveChanges() {
        var updatedContact = contact
        updatedContact.name = editName.trimmingCharacters(in: .whitespaces)
        updatedContact.aliases = editAliases.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        updatedContact.relationship = editRelationship.rawValue
        updatedContact.birthday = editBirthday.isEmpty ? nil : editBirthday
        updatedContact.email = editEmail.isEmpty ? nil : editEmail
        updatedContact.phone = editPhone.isEmpty ? nil : editPhone
        updatedContact.notes = editNotes.isEmpty ? nil : editNotes
        updatedContact.tags = editTags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
        updatedContact.updatedAt = Date()

        Task {
            let success = await contactService.updateContact(updatedContact)
            if success {
                contact = updatedContact
            }
            isEditing = false
        }
    }

    private func refreshContact() async {
        if let updated = await contactService.getContact(id: contact.id) {
            contact = updated
        }
    }

    private func formatBirthday(_ birthday: String) -> String {
        // Convert MM-DD or YYYY-MM-DD to readable format
        let components = birthday.split(separator: "-")
        if components.count == 2 {
            // MM-DD format
            let formatter = DateFormatter()
            formatter.dateFormat = "MM-dd"
            if let date = formatter.date(from: birthday) {
                formatter.dateFormat = "MMMM d"
                return formatter.string(from: date)
            }
        } else if components.count == 3 {
            // YYYY-MM-DD format
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            if let date = formatter.date(from: birthday) {
                formatter.dateFormat = "MMMM d, yyyy"
                return formatter.string(from: date)
            }
        }
        return birthday
    }

    // MARK: - Computed Properties

    private var initials: String {
        let components = contact.name.split(separator: " ")
        if components.count >= 2 {
            return String(components[0].prefix(1) + components[1].prefix(1)).uppercased()
        }
        return String(contact.name.prefix(2)).uppercased()
    }

    private var avatarColor: Color {
        let hash = contact.name.hashValue
        let colors: [Color] = [.blue, .purple, .pink, .orange, .green, .teal, .indigo, .mint]
        return colors[abs(hash) % colors.count]
    }
}

// MARK: - Detail Row

struct DetailRow: View {
    let label: String
    let value: String
    var icon: String? = nil

    var body: some View {
        HStack {
            if let icon = icon {
                Image(systemName: icon)
                    .foregroundColor(.secondary)
                    .frame(width: 24)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(value)
                    .font(.body)
            }
        }
    }
}

// MARK: - Agent Association Row

struct AgentAssociationRow: View {
    let agent: ContactAgent

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.accentColor.opacity(0.15))
                    .frame(width: 40, height: 40)

                Text(agent.agentEmoji ?? "🤖")
                    .font(.title3)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(agent.agentName)
                    .font(.headline)

                if let role = agent.role, !role.isEmpty {
                    Text(role)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()
        }
    }
}

// MARK: - Edit Agent Association View

struct EditAgentAssociationView: View {
    @EnvironmentObject var contactService: ContactService
    @Environment(\.dismiss) private var dismiss

    let contactId: String
    let agent: ContactAgent
    var onSave: (() -> Void)?

    @State private var role: String
    @State private var isSaving = false

    private let suggestedRoles = ["Assistant", "Health Coach", "Financial Advisor", "Scheduler", "Support", "Personal", "Work"]

    init(contactId: String, agent: ContactAgent, onSave: (() -> Void)? = nil) {
        self.contactId = contactId
        self.agent = agent
        self.onSave = onSave
        self._role = State(initialValue: agent.role ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(Color.accentColor.opacity(0.15))
                                .frame(width: 50, height: 50)

                            Text(agent.agentEmoji ?? "🤖")
                                .font(.title2)
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(agent.agentName)
                                .font(.headline)

                            Text("ID: \(agent.publicAgentId)")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                Section("Role") {
                    TextField("Role (e.g., Personal Assistant)", text: $role)

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

                Section {
                    Text("Added: \(agent.addedAt.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption)
                        .foregroundColor(.secondary)

                    if let discoveredVia = agent.discoveredVia {
                        Text("Discovered via: \(discoveredVia)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("Edit Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saveChanges()
                    }
                    .disabled(isSaving)
                }
            }
        }
    }

    private func saveChanges() {
        isSaving = true

        Task {
            // For now, we'd need to add an update endpoint
            // This is a placeholder that just dismisses
            // TODO: Implement updateAgentAssociation in ContactService
            onSave?()
            isSaving = false
            dismiss()
        }
    }
}

// MARK: - Preview

#Preview {
    ContactDetailView(
        contact: Contact(
            name: "Jane Smith",
            aliases: ["Janie", "JS"],
            relationship: "partner",
            birthday: "03-15",
            email: "jane@example.com",
            phone: "+1 555-123-4567",
            notes: "Met at the coffee shop downtown. Loves hiking and photography.",
            tags: ["close", "local"],
            agents: [
                ContactAgent(
                    contactId: "1",
                    publicAgentId: "agent-1",
                    agentName: "Jane's Assistant",
                    agentEmoji: "🎀",
                    role: "Personal assistant"
                )
            ]
        )
    )
    .environmentObject(ContactService.shared)
    .environmentObject(AgentStorageService.shared)
    .environmentObject(PublicAgentService.shared)
    .environmentObject(APIKeyService.shared)
    .environmentObject(AuthService.shared)
    .environmentObject(InputModeService.shared)
}
