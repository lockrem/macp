import SwiftUI

struct PeopleTabView: View {
    @EnvironmentObject var contactService: ContactService

    @State private var searchText = ""
    @State private var selectedContact: Contact?
    @State private var showAddContact = false
    @State private var showFilters = false
    @State private var selectedTags: Set<String> = []

    var body: some View {
        NavigationStack {
            Group {
                if contactService.isLoading && contactService.contacts.isEmpty {
                    loadingView
                } else {
                    mainList
                }
            }
            .navigationTitle("People")
            .searchable(text: $searchText, prompt: "Search people...")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    if !contactService.allTags.isEmpty {
                        Button {
                            showFilters.toggle()
                        } label: {
                            Image(systemName: selectedTags.isEmpty ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                        }
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showAddContact = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddContact) {
                AddContactView()
                    .environmentObject(contactService)
            }
            .sheet(item: $selectedContact) { contact in
                ContactDetailView(contact: contact)
                    .environmentObject(contactService)
            }
            .sheet(isPresented: $showFilters) {
                TagFilterSheet(
                    allTags: contactService.allTags,
                    selectedTags: $selectedTags
                )
                .presentationDetents([.medium])
            }
            .refreshable {
                await contactService.fetchContacts()
            }
            .task {
                if contactService.contacts.isEmpty {
                    await contactService.fetchContacts()
                }
            }
            .onChange(of: searchText) { _, newValue in
                Task {
                    if newValue.isEmpty {
                        await contactService.fetchContacts()
                    } else {
                        await contactService.searchContacts(query: newValue)
                    }
                }
            }
        }
    }

    // MARK: - Subviews

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Loading...")
                .foregroundColor(.secondary)
        }
    }

    private var mainList: some View {
        List {
            // Contacts
            if filteredContacts.isEmpty && searchText.isEmpty {
                Section {
                    ContentUnavailableView {
                        Label("No Contacts", systemImage: "person.crop.circle.badge.plus")
                    } description: {
                        Text("Add contacts to track people you know and their agents.")
                    } actions: {
                        Button("Add Contact") {
                            showAddContact = true
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
            } else {
                let contacts = searchText.isEmpty ? filteredContacts : contactService.searchResults

                if searchText.isEmpty && selectedTags.isEmpty {
                    let grouped = Dictionary(grouping: contacts) { $0.relationship ?? "other" }
                    let sortedKeys = grouped.keys.sorted { key1, key2 in
                        let order = ["partner", "family", "friend", "coworker", "professional", "acquaintance", "other"]
                        let idx1 = order.firstIndex(of: key1) ?? order.count
                        let idx2 = order.firstIndex(of: key2) ?? order.count
                        return idx1 < idx2
                    }

                    ForEach(sortedKeys, id: \.self) { key in
                        Section(header: Text(RelationshipType(rawValue: key)?.displayName ?? key.capitalized)) {
                            ForEach(grouped[key] ?? []) { contact in
                                ContactRow(contact: contact) {
                                    selectedContact = contact
                                }
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        Task {
                                            await contactService.deleteContact(id: contact.id)
                                        }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                            }
                        }
                    }
                } else {
                    ForEach(contacts) { contact in
                        ContactRow(contact: contact) {
                            selectedContact = contact
                        }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) {
                                Task {
                                    await contactService.deleteContact(id: contact.id)
                                }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Computed Properties

    private var filteredContacts: [Contact] {
        var contacts = contactService.contacts

        if !selectedTags.isEmpty {
            contacts = contacts.filter { contact in
                !Set(contact.tags).isDisjoint(with: selectedTags)
            }
        }

        return contacts.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

// Keep old name as typealias for any remaining references
typealias ContactsTabView = PeopleTabView

// MARK: - Tag Filter Sheet

struct TagFilterSheet: View {
    let allTags: [String]
    @Binding var selectedTags: Set<String>
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(allTags, id: \.self) { tag in
                        Button {
                            if selectedTags.contains(tag) {
                                selectedTags.remove(tag)
                            } else {
                                selectedTags.insert(tag)
                            }
                        } label: {
                            HStack {
                                Text(tag)
                                    .foregroundColor(.primary)
                                Spacer()
                                if selectedTags.contains(tag) {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.accentColor)
                                }
                            }
                        }
                    }
                } header: {
                    Text("Filter by tags")
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Clear") {
                        selectedTags.removeAll()
                    }
                    .disabled(selectedTags.isEmpty)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    PeopleTabView()
        .environmentObject(ContactService.shared)
}
