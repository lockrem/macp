import SwiftUI

/// Full profile detail view showing all learned facts grouped by category
struct MyProfileView: View {
    @EnvironmentObject var profileService: ProfileService
    @Environment(\.dismiss) private var dismiss

    @State private var editingSection: ProfileSection?
    @State private var editKey = ""
    @State private var editValue = ""

    var body: some View {
        NavigationStack {
            Group {
                if profileService.isLoading && profileService.profile == nil {
                    ProgressView("Loading profile...")
                } else if let profile = profileService.profile, profile.totalFacts > 0 {
                    profileContent(profile)
                } else {
                    emptyState
                }
            }
            .navigationTitle("My Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(item: $editingSection) { section in
                EditSectionSheet(
                    section: section,
                    onSave: { facts in
                        Task {
                            await profileService.updateFacts(
                                category: section.category,
                                facts: facts
                            )
                            editingSection = nil
                        }
                    }
                )
            }
            .refreshable {
                await profileService.fetchProfile()
            }
            .task {
                await profileService.fetchProfile()
            }
        }
    }

    // MARK: - Content

    private func profileContent(_ profile: UserProfile) -> some View {
        List {
            ForEach(profile.sections) { section in
                Section {
                    ForEach(section.facts) { fact in
                        factRow(fact)
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    Task {
                                        await profileService.deleteFact(factId: fact.id)
                                    }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                    }
                } header: {
                    HStack {
                        Label(section.displayName, systemImage: section.icon)
                        Spacer()
                        Button {
                            editingSection = section
                        } label: {
                            Text("Edit")
                                .font(.caption)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func factRow(_ fact: ProfileFact) -> some View {
        HStack(alignment: .top) {
            Text(formatKey(fact.key))
                .font(.subheadline)
                .foregroundColor(.secondary)
                .frame(width: 100, alignment: .leading)

            VStack(alignment: .leading, spacing: 2) {
                Text(fact.displayValue)
                    .font(.body)

                if let source = fact.sourceCaption {
                    Text(source)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()
        }
        .padding(.vertical, 2)
    }

    /// Converts a key like "favorite_color" to "Favorite Color"
    private func formatKey(_ key: String) -> String {
        key.replacingOccurrences(of: "_", with: " ")
            .capitalized
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Profile Data", systemImage: "person.crop.circle")
        } description: {
            Text("Information about you will appear here as your agents learn from conversations.")
        }
    }
}

// MARK: - Edit Section Sheet

struct EditSectionSheet: View {
    let section: ProfileSection
    let onSave: ([(key: String, value: String)]) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var facts: [(key: String, value: String)] = []
    @State private var newKey = ""
    @State private var newValue = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Existing Facts") {
                    ForEach(Array(facts.enumerated()), id: \.offset) { index, fact in
                        HStack {
                            TextField("Key", text: Binding(
                                get: { facts[index].key },
                                set: { facts[index].key = $0 }
                            ))
                            .textInputAutocapitalization(.never)
                            .frame(maxWidth: 120)

                            TextField("Value", text: Binding(
                                get: { facts[index].value },
                                set: { facts[index].value = $0 }
                            ))
                        }
                    }
                    .onDelete { indexSet in
                        facts.remove(atOffsets: indexSet)
                    }
                }

                Section("Add New") {
                    HStack {
                        TextField("Key", text: $newKey)
                            .textInputAutocapitalization(.never)
                            .frame(maxWidth: 120)
                        TextField("Value", text: $newValue)
                        Button {
                            guard !newKey.isEmpty, !newValue.isEmpty else { return }
                            facts.append((key: newKey.lowercased().replacingOccurrences(of: " ", with: "_"), value: newValue))
                            newKey = ""
                            newValue = ""
                        } label: {
                            Image(systemName: "plus.circle.fill")
                        }
                        .disabled(newKey.isEmpty || newValue.isEmpty)
                    }
                }
            }
            .navigationTitle("Edit \(section.displayName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(facts)
                        dismiss()
                    }
                }
            }
            .onAppear {
                facts = section.facts.map { (key: $0.key, value: $0.displayValue) }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    MyProfileView()
        .environmentObject(ProfileService.shared)
}
