import SwiftUI

/// Editor view for a form - manage fields, share, view submissions
struct FormEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var formService: FormService

    @State var form: SmartForm
    @State private var showAddField = false
    @State private var showShareSheet = false
    @State private var showSubmissions = false
    @State private var editingField: FormField?
    @State private var isEditingDetails = false
    @State private var isSaving = false

    // Edit state
    @State private var editTitle: String = ""
    @State private var editDescription: String = ""

    var body: some View {
        NavigationStack {
            List {
                // Form details section
                Section {
                    if isEditingDetails {
                        TextField("Title", text: $editTitle)
                        TextField("Description", text: $editDescription, axis: .vertical)
                            .lineLimit(2...4)
                    } else {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(form.title)
                                .font(.headline)

                            if let description = form.description, !description.isEmpty {
                                Text(description)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                        }

                        // Stats
                        HStack(spacing: 16) {
                            StatBadge(icon: "eye", value: "\(form.viewCount ?? 0)", label: "Views")
                            StatBadge(icon: "tray.full", value: "\(form.submissionCount ?? 0)", label: "Responses")
                        }
                    }
                } header: {
                    HStack {
                        Text("Form Details")
                        Spacer()
                        Button(isEditingDetails ? "Done" : "Edit") {
                            if isEditingDetails {
                                saveDetails()
                            } else {
                                editTitle = form.title
                                editDescription = form.description ?? ""
                                isEditingDetails = true
                            }
                        }
                        .font(.subheadline)
                    }
                }

                // Fields section
                Section {
                    if let fields = form.fields, !fields.isEmpty {
                        ForEach(fields) { field in
                            FieldRowView(field: field) {
                                editingField = field
                            }
                        }
                        .onDelete(perform: deleteFields)
                        .onMove(perform: moveFields)
                    }

                    Button {
                        showAddField = true
                    } label: {
                        Label("Add Field", systemImage: "plus.circle")
                    }
                } header: {
                    Text("Fields")
                } footer: {
                    if form.fields?.isEmpty ?? true {
                        Text("Add fields to your form. They will be shown in order.")
                    }
                }

                // Actions section
                Section {
                    Button {
                        showShareSheet = true
                    } label: {
                        Label("Share Form", systemImage: "square.and.arrow.up")
                    }

                    Button {
                        showSubmissions = true
                    } label: {
                        Label("View Responses", systemImage: "tray.full")
                    }
                }
            }
            .navigationTitle("Edit Form")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    EditButton()
                }
            }
            .sheet(isPresented: $showAddField) {
                FieldEditorSheet(formId: form.id) { newField in
                    if form.fields == nil {
                        form.fields = []
                    }
                    form.fields?.append(newField)
                }
                .environmentObject(formService)
            }
            .sheet(item: $editingField) { field in
                FieldEditorSheet(formId: form.id, field: field) { updatedField in
                    if let index = form.fields?.firstIndex(where: { $0.id == field.id }) {
                        form.fields?[index] = updatedField
                    }
                }
                .environmentObject(formService)
            }
            .sheet(isPresented: $showShareSheet) {
                FormShareSheet(form: form)
            }
            .sheet(isPresented: $showSubmissions) {
                FormSubmissionsView(form: form)
                    .environmentObject(formService)
            }
            .task {
                // Refresh form to get latest data
                if let updated = try? await formService.getForm(id: form.id) {
                    form = updated
                }
            }
        }
    }

    private func saveDetails() {
        isSaving = true

        Task {
            do {
                let updated = try await formService.updateForm(
                    form.id,
                    title: editTitle.trimmingCharacters(in: .whitespaces),
                    description: editDescription.isEmpty ? nil : editDescription.trimmingCharacters(in: .whitespaces)
                )
                form.title = updated.title
                form.description = updated.description
            } catch {
                // Revert on error
                editTitle = form.title
                editDescription = form.description ?? ""
            }
            isEditingDetails = false
            isSaving = false
        }
    }

    private func deleteFields(at offsets: IndexSet) {
        for index in offsets {
            if let field = form.fields?[index] {
                Task {
                    try? await formService.deleteField(formId: form.id, fieldId: field.id)
                }
            }
        }
        form.fields?.remove(atOffsets: offsets)
    }

    private func moveFields(from source: IndexSet, to destination: Int) {
        form.fields?.move(fromOffsets: source, toOffset: destination)

        // Save new order
        if let fieldIds = form.fields?.map({ $0.id }) {
            Task {
                try? await formService.reorderFields(formId: form.id, fieldIds: fieldIds)
            }
        }
    }
}

// MARK: - Stat Badge

struct StatBadge: View {
    let icon: String
    let value: String
    let label: String

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption)
            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

// MARK: - Field Row

struct FieldRowView: View {
    let field: FormField
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Type icon
                Image(systemName: field.fieldType.icon)
                    .font(.body)
                    .foregroundColor(.accentColor)
                    .frame(width: 24)

                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(field.label)
                            .font(.body)
                            .foregroundColor(.primary)

                        if field.required {
                            Text("*")
                                .foregroundColor(.red)
                        }
                    }

                    Text(field.fieldType.displayName)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Preview

#Preview {
    FormEditorView(
        form: SmartForm(
            id: "test",
            title: "Patient Intake Form",
            description: "Please fill out this form before your appointment",
            fields: [
                FormField(id: "1", label: "Full Name", fieldType: .text, required: true, displayOrder: 0),
                FormField(id: "2", label: "Date of Birth", fieldType: .date, required: true, displayOrder: 1),
                FormField(id: "3", label: "Email", fieldType: .email, required: false, displayOrder: 2),
            ]
        )
    )
    .environmentObject(FormService.shared)
}
