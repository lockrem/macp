import SwiftUI

struct AddContactView: View {
    @EnvironmentObject var contactService: ContactService
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var aliases = ""
    @State private var relationship: RelationshipType = .friend
    @State private var birthday = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var notes = ""
    @State private var tagsInput = ""
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                // Basic Info
                Section("Basic Info") {
                    TextField("Name", text: $name)
                        .textContentType(.name)
                        .autocorrectionDisabled()

                    TextField("Aliases (comma-separated)", text: $aliases)
                        .textContentType(.nickname)
                        .autocorrectionDisabled()

                    Picker("Relationship", selection: $relationship) {
                        ForEach(RelationshipType.allCases, id: \.self) { type in
                            Label(type.displayName, systemImage: type.icon)
                                .tag(type)
                        }
                    }
                    .pickerStyle(.navigationLink)
                }

                // Contact Details
                Section("Contact Details") {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)

                    TextField("Phone", text: $phone)
                        .textContentType(.telephoneNumber)
                        .keyboardType(.phonePad)

                    TextField("Birthday (MM-DD or YYYY-MM-DD)", text: $birthday)
                        .keyboardType(.numbersAndPunctuation)
                }

                // Organization
                Section("Organization") {
                    TextField("Tags (comma-separated)", text: $tagsInput)
                        .autocorrectionDisabled()
                }

                // Notes
                Section("Notes") {
                    TextEditor(text: $notes)
                        .frame(minHeight: 100)
                }
            }
            .navigationTitle("Add Contact")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saveContact()
                    }
                    .disabled(name.isEmpty || isSaving)
                }
            }
            .interactiveDismissDisabled(isSaving)
        }
    }

    private func saveContact() {
        isSaving = true

        let aliasArray = aliases
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        let tagArray = tagsInput
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
            .filter { !$0.isEmpty }

        Task {
            let _ = await contactService.createContact(
                name: name.trimmingCharacters(in: .whitespaces),
                aliases: aliasArray,
                relationship: relationship.rawValue,
                birthday: birthday.isEmpty ? nil : birthday,
                email: email.isEmpty ? nil : email,
                phone: phone.isEmpty ? nil : phone,
                notes: notes.isEmpty ? nil : notes,
                tags: tagArray
            )

            isSaving = false
            dismiss()
        }
    }
}

// MARK: - Preview

#Preview {
    AddContactView()
        .environmentObject(ContactService.shared)
}
