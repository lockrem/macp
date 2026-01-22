import SwiftUI

struct AgentEditorView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var memoryService: MemoryService

    let existingAgent: LocalAgent?

    @State private var name: String = ""
    @State private var description: String = ""
    @State private var provider: AgentProvider = .anthropic
    @State private var isDefault: Bool = false
    @State private var isSaving = false
    @State private var showDeleteConfirm = false
    @State private var showProviderWarning = false

    var isEditing: Bool { existingAgent != nil }

    var canSelectProvider: Bool {
        apiKeyService.hasKey(for: provider)
    }

    var body: some View {
        NavigationStack {
            Form {
                // Basic Info
                Section {
                    TextField("Name", text: $name)
                        .textInputAutocapitalization(.words)

                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(2...4)
                } header: {
                    Text("Agent Identity")
                } footer: {
                    Text("Give your agent a memorable name and describe its purpose")
                }

                // Provider Selection
                Section {
                    ForEach(AgentProvider.allCases, id: \.self) { p in
                        ProviderSelectionRow(
                            provider: p,
                            isSelected: provider == p,
                            isAvailable: apiKeyService.hasKey(for: p),
                            onSelect: {
                                if apiKeyService.hasKey(for: p) {
                                    provider = p
                                } else {
                                    showProviderWarning = true
                                }
                            }
                        )
                    }
                } header: {
                    Text("AI Provider")
                } footer: {
                    if !apiKeyService.hasAnyKey {
                        Text("Configure API keys in Settings to enable providers")
                            .foregroundStyle(.orange)
                    } else {
                        Text("Select which AI service powers this agent")
                    }
                }

                // Default Agent Toggle
                Section {
                    Toggle("Default Agent", isOn: $isDefault)
                } footer: {
                    Text("The default agent is used when joining new conversations")
                }

                // Memory Stores (for existing agents)
                if let agent = existingAgent {
                    Section {
                        NavigationLink {
                            AgentMemoryStoresView(agent: agent)
                                .environmentObject(memoryService)
                        } label: {
                            HStack {
                                Label("Memory Stores", systemImage: "brain.head.profile")
                                Spacer()
                                Text("\(agent.memoryStores.count)")
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Button("Clear All Memory", role: .destructive) {
                            Task {
                                await memoryService.clearMemory(for: agent)
                            }
                        }
                    } header: {
                        Text("Agent Memory")
                    } footer: {
                        Text("Organize memories into separate stores for different topics")
                    }
                }

                // Delete Button (for existing agents)
                if existingAgent != nil {
                    Section {
                        Button("Delete Agent", role: .destructive) {
                            showDeleteConfirm = true
                        }
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit Agent" : "New Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Save" : "Create") {
                        saveAgent()
                    }
                    .disabled(name.isEmpty || isSaving || !canSelectProvider)
                }
            }
            .onAppear {
                if let agent = existingAgent {
                    name = agent.name
                    description = agent.description
                    provider = agent.provider
                    isDefault = agent.isDefault
                }
            }
            .confirmationDialog("Delete Agent", isPresented: $showDeleteConfirm) {
                Button("Delete", role: .destructive) {
                    if let agent = existingAgent {
                        agentStorage.deleteAgent(agent)
                        dismiss()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Are you sure you want to delete this agent? This cannot be undone.")
            }
            .alert("API Key Required", isPresented: $showProviderWarning) {
                Button("OK") {}
            } message: {
                Text("Please configure an API key for this provider in Settings first.")
            }
        }
    }

    private func saveAgent() {
        isSaving = true

        if var agent = existingAgent {
            // Update existing
            agent.name = name
            agent.description = description
            agent.provider = provider
            agent.isDefault = isDefault
            agentStorage.updateAgent(agent)
        } else {
            // Create new
            let newAgent = LocalAgent(
                name: name,
                description: description,
                provider: provider,
                isDefault: isDefault
            )
            agentStorage.addAgent(newAgent)
        }

        // Sync to server
        Task { await SettingsSyncService.shared.syncAgents() }

        isSaving = false
        dismiss()
    }
}

struct ProviderSelectionRow: View {
    let provider: AgentProvider
    let isSelected: Bool
    let isAvailable: Bool
    let onSelect: () -> Void

    var providerColor: Color {
        switch provider.accentColor {
        case "orange": return .orange
        case "green": return .green
        case "blue": return .blue
        case "purple": return .purple
        default: return .gray
        }
    }

    var body: some View {
        Button(action: onSelect) {
            HStack {
                Image(provider.iconName)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 24, height: 24)

                VStack(alignment: .leading) {
                    Text(provider.displayName)
                        .foregroundStyle(isAvailable ? .primary : .secondary)

                    if !isAvailable {
                        Text("API key not configured")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.blue)
                } else if isAvailable {
                    Image(systemName: "circle")
                        .foregroundStyle(.secondary)
                } else {
                    Image(systemName: "lock")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .disabled(!isAvailable && !isSelected)
    }
}

// MARK: - Memory Stores View

struct AgentMemoryStoresView: View {
    let agent: LocalAgent
    @EnvironmentObject var memoryService: MemoryService
    @State private var memory: AgentMemory?
    @State private var isLoading = true
    @State private var showAddStore = false

    var body: some View {
        List {
            if isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
            } else if let memory = memory, !memory.stores.isEmpty {
                ForEach(memory.stores) { store in
                    NavigationLink {
                        MemoryStoreDetailView(
                            agent: agent,
                            store: store
                        )
                        .environmentObject(memoryService)
                    } label: {
                        MemoryStoreRow(store: store)
                    }
                }
                .onDelete { indexSet in
                    deleteStores(at: indexSet)
                }
            } else {
                ContentUnavailableView(
                    "No Memory Stores",
                    systemImage: "brain.head.profile",
                    description: Text("Create memory stores to organize your agent's knowledge by topic")
                )
            }
        }
        .navigationTitle("Memory Stores")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showAddStore = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showAddStore) {
            AddMemoryStoreSheet(agent: agent) { newStore in
                Task {
                    await addStore(newStore)
                }
            }
            .environmentObject(memoryService)
        }
        .task {
            memory = await memoryService.loadMemory(for: agent)
            isLoading = false
        }
    }

    private func deleteStores(at offsets: IndexSet) {
        guard var updatedMemory = memory else { return }
        for index in offsets {
            let store = updatedMemory.stores[index]
            updatedMemory.removeStore(store)
        }
        memory = updatedMemory
        Task {
            await memoryService.saveMemory(updatedMemory, for: agent)
        }
    }

    private func addStore(_ store: MemoryStore) async {
        var updatedMemory = memory ?? AgentMemory()
        updatedMemory.addStore(store)
        memory = updatedMemory
        await memoryService.saveMemory(updatedMemory, for: agent)
    }
}

struct MemoryStoreRow: View {
    let store: MemoryStore

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(store.name)
                .font(.headline)

            if !store.description.isEmpty {
                Text(store.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            HStack {
                Label("\(store.entries.count)", systemImage: "doc.text")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                Spacer()

                Text(store.updatedAt, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

struct AddMemoryStoreSheet: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var memoryService: MemoryService
    let agent: LocalAgent
    let onAdd: (MemoryStore) -> Void

    @State private var name = ""
    @State private var description = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                        .textInputAutocapitalization(.words)

                    TextField("Description (optional)", text: $description, axis: .vertical)
                        .lineLimit(2...4)
                } footer: {
                    Text("Examples: Health Symptoms, Exercise Routine, Medications, Work Projects")
                }
            }
            .navigationTitle("New Memory Store")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let store = MemoryStore(name: name, description: description)
                        onAdd(store)
                        dismiss()
                    }
                    .disabled(name.isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

struct MemoryStoreDetailView: View {
    let agent: LocalAgent
    let store: MemoryStore
    @EnvironmentObject var memoryService: MemoryService
    @State private var memory: AgentMemory?
    @State private var currentStore: MemoryStore?
    @State private var showAddEntry = false

    var body: some View {
        List {
            if let currentStore = currentStore, !currentStore.entries.isEmpty {
                ForEach(currentStore.entries) { entry in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(entry.category.capitalized)
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(.blue.opacity(0.1))
                                .foregroundStyle(.blue)
                                .clipShape(Capsule())

                            Spacer()

                            Text(entry.timestamp, style: .relative)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }

                        Text(entry.content)
                            .font(.body)
                    }
                    .padding(.vertical, 4)
                }
                .onDelete { indexSet in
                    deleteEntries(at: indexSet)
                }
            } else {
                ContentUnavailableView(
                    "No Entries",
                    systemImage: "doc.text",
                    description: Text("Add memory entries to this store")
                )
            }
        }
        .navigationTitle(store.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showAddEntry = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showAddEntry) {
            AddMemoryEntrySheet { content, category in
                Task {
                    await addEntry(content: content, category: category)
                }
            }
        }
        .task {
            memory = await memoryService.loadMemory(for: agent)
            currentStore = memory?.stores.first { $0.id == store.id }
        }
    }

    private func deleteEntries(at offsets: IndexSet) {
        guard var updatedStore = currentStore,
              var updatedMemory = memory,
              let storeIndex = updatedMemory.stores.firstIndex(where: { $0.id == store.id }) else { return }

        for index in offsets {
            let entry = updatedStore.entries[index]
            updatedStore.removeEntry(entry)
        }

        updatedMemory.stores[storeIndex] = updatedStore
        memory = updatedMemory
        currentStore = updatedStore

        Task {
            await memoryService.saveMemory(updatedMemory, for: agent)
        }
    }

    private func addEntry(content: String, category: String) async {
        guard var updatedStore = currentStore,
              var updatedMemory = memory,
              let storeIndex = updatedMemory.stores.firstIndex(where: { $0.id == store.id }) else { return }

        updatedStore.addEntry(content, category: category)
        updatedMemory.stores[storeIndex] = updatedStore
        memory = updatedMemory
        currentStore = updatedStore

        await memoryService.saveMemory(updatedMemory, for: agent)
    }
}

struct AddMemoryEntrySheet: View {
    @Environment(\.dismiss) var dismiss
    let onAdd: (String, String) -> Void

    @State private var content = ""
    @State private var category = "general"

    let categories = ["general", "fact", "preference", "observation", "reminder"]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Memory content", text: $content, axis: .vertical)
                        .lineLimit(3...6)
                } header: {
                    Text("Content")
                }

                Section {
                    Picker("Category", selection: $category) {
                        ForEach(categories, id: \.self) { cat in
                            Text(cat.capitalized).tag(cat)
                        }
                    }
                } header: {
                    Text("Category")
                }
            }
            .navigationTitle("Add Memory")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        onAdd(content, category)
                        dismiss()
                    }
                    .disabled(content.isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

#Preview {
    AgentEditorView(existingAgent: nil)
        .environmentObject(AgentStorageService.shared)
        .environmentObject(APIKeyService.shared)
        .environmentObject(MemoryService.shared)
}
