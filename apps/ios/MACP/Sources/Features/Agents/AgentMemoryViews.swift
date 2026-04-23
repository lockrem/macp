import SwiftUI

// MARK: - Memory Stores View

/// List view for managing an agent's memory stores
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
                        MemoryStoreDetailView(agent: agent, store: store)
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
                Task { await addStore(newStore) }
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

// MARK: - Memory Store Row

/// Single row displaying a memory store
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

// MARK: - Add Memory Store Sheet

/// Sheet for creating a new memory store
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
                    Button("Cancel") { dismiss() }
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

// MARK: - Memory Store Detail View

/// Detail view showing entries in a memory store
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
                    MemoryEntryRow(entry: entry)
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
                Task { await addEntry(content: content, category: category) }
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

// MARK: - Memory Entry Row

/// Single row displaying a memory entry
struct MemoryEntryRow: View {
    let entry: MemoryEntry

    var body: some View {
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
}

// MARK: - Add Memory Entry Sheet

/// Sheet for adding a new memory entry
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
                    Button("Cancel") { dismiss() }
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
