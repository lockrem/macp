import SwiftUI

/// View for customers to fill out a form (opened via QR code or link)
struct FormFillingView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var apiKeyService: APIKeyService

    let formId: String

    @State private var form: SmartForm?
    @State private var responses: [String: String] = [:] // fieldId -> value
    @State private var autoFilledFields: Set<String> = []
    @State private var isLoading = true
    @State private var isSubmitting = false
    @State private var isAutoFilling = false
    @State private var error: String?
    @State private var showSuccess = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    loadingView
                } else if let form = form {
                    formView(form)
                } else {
                    errorView
                }
            }
            .navigationTitle(form?.title ?? "Form")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .task {
                await loadForm()
            }
            .alert("Form Submitted", isPresented: $showSuccess) {
                Button("Done") {
                    dismiss()
                }
            } message: {
                Text("Your responses have been submitted successfully.")
            }
        }
    }

    // MARK: - Subviews

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text("Loading form...")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var errorView: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundColor(.orange)

            Text("Form Not Found")
                .font(.headline)

            if let error = error {
                Text(error)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Button("Try Again") {
                Task {
                    await loadForm()
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func formView(_ form: SmartForm) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header
                VStack(alignment: .leading, spacing: 8) {
                    if let description = form.description {
                        Text(description)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }

                    // Auto-fill status
                    if isAutoFilling {
                        HStack(spacing: 8) {
                            ProgressView()
                                .scaleEffect(0.8)
                            Text("Auto-filling from your profile...")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .padding(.top, 4)
                    } else if !autoFilledFields.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("\(autoFilledFields.count) fields auto-filled")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        .padding(.top, 4)
                    }
                }

                // Fields
                VStack(spacing: 16) {
                    if let fields = form.fields {
                        ForEach(fields) { field in
                            FormFieldInput(
                                field: field,
                                value: Binding(
                                    get: { responses[field.id] ?? "" },
                                    set: { responses[field.id] = $0 }
                                ),
                                isAutoFilled: autoFilledFields.contains(field.id)
                            )
                        }
                    }
                }

                // Submit button
                Button {
                    submitForm()
                } label: {
                    HStack {
                        if isSubmitting {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(isSubmitting ? "Submitting..." : "Submit")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(isValid ? Color.accentColor : Color.gray)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(!isValid || isSubmitting)

                if let error = error {
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.red)
                }
            }
            .padding()
        }
    }

    // MARK: - Validation

    private var isValid: Bool {
        guard let fields = form?.fields else { return false }

        for field in fields {
            if field.required {
                let value = responses[field.id] ?? ""
                if value.trimmingCharacters(in: .whitespaces).isEmpty {
                    return false
                }
            }
        }
        return true
    }

    // MARK: - Actions

    private func loadForm() async {
        isLoading = true
        error = nil

        do {
            let formService = FormService.shared
            form = try await formService.getPublicForm(formId: formId)

            // Try auto-fill if we have an API key
            if let apiKey = apiKeyService.getKey(for: "anthropic") {
                await autoFill(apiKey: apiKey)
            }
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    private func autoFill(apiKey: String) async {
        isAutoFilling = true

        do {
            let formService = FormService.shared
            let suggestions = try await formService.getAutoFillSuggestions(formId: formId, apiKey: apiKey)

            // Apply suggestions
            for (fieldLabel, suggestion) in suggestions {
                // Find field by label
                if let field = form?.fields?.first(where: { $0.label == fieldLabel }) {
                    responses[field.id] = suggestion.value
                    autoFilledFields.insert(field.id)
                }
            }
        } catch {
            print("[FormFillingView] Auto-fill failed: \(error)")
        }

        isAutoFilling = false
    }

    private func submitForm() {
        guard let form = form else { return }

        isSubmitting = true
        error = nil

        Task {
            do {
                let formService = FormService.shared
                let responseInputs = responses.map { fieldId, value in
                    (
                        fieldId: fieldId,
                        value: value,
                        source: autoFilledFields.contains(fieldId) ? FormResponseSource.agent : FormResponseSource.user
                    )
                }

                _ = try await formService.submitForm(
                    formId: form.id,
                    responses: responseInputs
                )

                showSuccess = true
            } catch {
                self.error = error.localizedDescription
            }
            isSubmitting = false
        }
    }
}

// MARK: - Form Field Input

struct FormFieldInput: View {
    let field: FormField
    @Binding var value: String
    let isAutoFilled: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Label
            HStack {
                Text(field.label)
                    .font(.subheadline)
                    .fontWeight(.medium)

                if field.required {
                    Text("*")
                        .foregroundColor(.red)
                }

                Spacer()

                if isAutoFilled {
                    Label("Auto-filled", systemImage: "cpu")
                        .font(.caption2)
                        .foregroundColor(.purple)
                }
            }

            // Input
            Group {
                switch field.fieldType {
                case .text:
                    TextField(field.placeholder ?? "", text: $value)
                        .textFieldStyle(.roundedBorder)

                case .multiline:
                    TextEditor(text: $value)
                        .frame(minHeight: 80)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                        )

                case .date:
                    DatePickerField(value: $value)

                case .email:
                    TextField(field.placeholder ?? "email@example.com", text: $value)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)

                case .phone:
                    TextField(field.placeholder ?? "(555) 555-5555", text: $value)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.telephoneNumber)
                        .keyboardType(.phonePad)

                case .select:
                    Menu {
                        ForEach(field.options ?? [], id: \.self) { option in
                            Button(option) {
                                value = option
                            }
                        }
                    } label: {
                        HStack {
                            Text(value.isEmpty ? "Select..." : value)
                                .foregroundColor(value.isEmpty ? .secondary : .primary)
                            Spacer()
                            Image(systemName: "chevron.down")
                                .foregroundColor(.secondary)
                        }
                        .padding()
                        .background(Color(UIColor.secondarySystemBackground))
                        .cornerRadius(8)
                    }
                }
            }
        }
    }
}

// MARK: - Date Picker Field

struct DatePickerField: View {
    @Binding var value: String
    @State private var date = Date()
    @State private var hasValue = false

    var body: some View {
        HStack {
            if hasValue {
                Text(date.formatted(date: .abbreviated, time: .omitted))
                    .foregroundColor(.primary)
            } else {
                Text("Select date...")
                    .foregroundColor(.secondary)
            }

            Spacer()

            DatePicker(
                "",
                selection: $date,
                displayedComponents: .date
            )
            .labelsHidden()
            .onChange(of: date) { _, newDate in
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withFullDate]
                value = formatter.string(from: newDate)
                hasValue = true
            }
        }
        .padding()
        .background(Color(UIColor.secondarySystemBackground))
        .cornerRadius(8)
        .onAppear {
            if !value.isEmpty {
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withFullDate]
                if let parsed = formatter.date(from: value) {
                    date = parsed
                    hasValue = true
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    FormFillingView(formId: "test")
        .environmentObject(APIKeyService.shared)
}
