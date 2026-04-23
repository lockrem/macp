import SwiftUI

/// Sheet for adding or editing a form field
struct FieldEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var formService: FormService

    let formId: String
    let field: FormField?
    let onSave: (FormField) -> Void

    @State private var label: String
    @State private var fieldType: FormFieldType
    @State private var required: Bool
    @State private var placeholder: String
    @State private var options: [String]
    @State private var newOption: String = ""

    @State private var isSaving = false
    @State private var error: String?

    init(formId: String, field: FormField? = nil, onSave: @escaping (FormField) -> Void) {
        self.formId = formId
        self.field = field
        self.onSave = onSave

        _label = State(initialValue: field?.label ?? "")
        _fieldType = State(initialValue: field?.fieldType ?? .text)
        _required = State(initialValue: field?.required ?? false)
        _placeholder = State(initialValue: field?.placeholder ?? "")
        _options = State(initialValue: field?.options ?? [])
    }

    var isEditing: Bool {
        field != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                // Basic info
                Section {
                    TextField("Field Label", text: $label)

                    Picker("Field Type", selection: $fieldType) {
                        ForEach(FormFieldType.allCases, id: \.self) { type in
                            Label(type.displayName, systemImage: type.icon)
                                .tag(type)
                        }
                    }

                    Toggle("Required", isOn: $required)
                } header: {
                    Text("Field Settings")
                }

                // Placeholder (for text fields)
                if fieldType == .text || fieldType == .multiline || fieldType == .email || fieldType == .phone {
                    Section {
                        TextField("Placeholder text", text: $placeholder)
                    } header: {
                        Text("Placeholder")
                    } footer: {
                        Text("Shown when the field is empty")
                    }
                }

                // Options (for select fields)
                if fieldType == .select {
                    Section {
                        ForEach(options, id: \.self) { option in
                            Text(option)
                        }
                        .onDelete(perform: deleteOption)

                        HStack {
                            TextField("Add option", text: $newOption)

                            Button {
                                addOption()
                            } label: {
                                Image(systemName: "plus.circle.fill")
                            }
                            .disabled(newOption.isEmpty)
                        }
                    } header: {
                        Text("Options")
                    } footer: {
                        Text("Add at least 2 options for the dropdown")
                    }
                }

                if let error = error {
                    Section {
                        Text(error)
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit Field" : "Add Field")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Save" : "Add") {
                        saveField()
                    }
                    .disabled(!isValid || isSaving)
                }
            }
        }
    }

    private var isValid: Bool {
        !label.isEmpty && (fieldType != .select || options.count >= 2)
    }

    private func addOption() {
        let trimmed = newOption.trimmingCharacters(in: .whitespaces)
        if !trimmed.isEmpty && !options.contains(trimmed) {
            options.append(trimmed)
            newOption = ""
        }
    }

    private func deleteOption(at offsets: IndexSet) {
        options.remove(atOffsets: offsets)
    }

    private func saveField() {
        isSaving = true
        error = nil

        Task {
            do {
                let savedField: FormField

                if let existingField = field {
                    // Update
                    savedField = try await formService.updateField(
                        formId: formId,
                        fieldId: existingField.id,
                        label: label.trimmingCharacters(in: .whitespaces),
                        fieldType: fieldType,
                        required: required,
                        placeholder: placeholder.isEmpty ? nil : placeholder,
                        options: fieldType == .select ? options : nil
                    )
                } else {
                    // Create
                    savedField = try await formService.addField(
                        formId: formId,
                        label: label.trimmingCharacters(in: .whitespaces),
                        fieldType: fieldType,
                        required: required,
                        placeholder: placeholder.isEmpty ? nil : placeholder,
                        options: fieldType == .select ? options : nil
                    )
                }

                onSave(savedField)
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            isSaving = false
        }
    }
}

// MARK: - Preview

#Preview {
    FieldEditorSheet(formId: "test") { field in
        print("Saved: \(field.label)")
    }
    .environmentObject(FormService.shared)
}
