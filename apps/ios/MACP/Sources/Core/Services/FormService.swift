import Foundation
import Combine

/// Service for managing forms - creation, editing, sharing, and submissions
@MainActor
class FormService: ObservableObject {
    static let shared = FormService()

    private let apiClient = APIClient.shared

    @Published var forms: [SmartForm] = []
    @Published var isLoading = false
    @Published var error: String?

    private init() {}

    // MARK: - Form CRUD

    /// Creates a new form
    func createForm(title: String, description: String? = nil) async throws -> SmartForm {
        isLoading = true
        defer { isLoading = false }

        let request = CreateFormRequest(title: title, description: description)
        let response: FormResponse = try await apiClient.post("/api/forms", body: request)

        if let form = response.form {
            forms.insert(form, at: 0)
            print("[FormService] Created form: \(form.title) (id: \(form.id))")
            return form
        }

        throw FormServiceError.createFailed
    }

    /// Fetches user's forms
    func fetchForms() async {
        isLoading = true
        error = nil

        do {
            let response: FormListResponse = try await apiClient.get("/api/forms")
            forms = response.forms
            print("[FormService] Fetched \(forms.count) forms")
        } catch {
            self.error = "Failed to fetch forms: \(error.localizedDescription)"
            print("[FormService] Error: \(error)")
        }

        isLoading = false
    }

    /// Gets a form by ID
    func getForm(id: String) async throws -> SmartForm {
        let form: SmartForm = try await apiClient.get("/api/forms/\(id)")
        return form
    }

    /// Updates a form
    func updateForm(_ formId: String, title: String? = nil, description: String? = nil, isPublic: Bool? = nil) async throws -> SmartForm {
        let request = UpdateFormRequest(title: title, description: description, isPublic: isPublic)
        let response: FormResponse = try await apiClient.put("/api/forms/\(formId)", body: request)

        if let form = response.form {
            if let index = forms.firstIndex(where: { $0.id == formId }) {
                forms[index] = form
            }
            return form
        }

        throw FormServiceError.updateFailed
    }

    /// Deletes a form
    func deleteForm(_ formId: String) async throws {
        try await apiClient.delete("/api/forms/\(formId)")
        forms.removeAll { $0.id == formId }
        print("[FormService] Deleted form: \(formId)")
    }

    // MARK: - Field Management

    /// Adds a field to a form
    func addField(
        formId: String,
        label: String,
        fieldType: FormFieldType,
        required: Bool = false,
        placeholder: String? = nil,
        options: [String]? = nil
    ) async throws -> FormField {
        let request = CreateFieldRequest(
            label: label,
            fieldType: fieldType.rawValue,
            required: required,
            placeholder: placeholder,
            options: options,
            displayOrder: nil
        )

        let response: FieldResponse = try await apiClient.post("/api/forms/\(formId)/fields", body: request)

        if let field = response.field {
            // Update local form
            if let index = forms.firstIndex(where: { $0.id == formId }) {
                if forms[index].fields == nil {
                    forms[index].fields = []
                }
                forms[index].fields?.append(field)
            }
            print("[FormService] Added field: \(field.label)")
            return field
        }

        throw FormServiceError.addFieldFailed
    }

    /// Updates a field
    func updateField(
        formId: String,
        fieldId: String,
        label: String? = nil,
        fieldType: FormFieldType? = nil,
        required: Bool? = nil,
        placeholder: String? = nil,
        options: [String]? = nil
    ) async throws -> FormField {
        let request = UpdateFieldRequest(
            label: label,
            fieldType: fieldType?.rawValue,
            required: required,
            placeholder: placeholder,
            options: options,
            displayOrder: nil
        )

        let response: FieldResponse = try await apiClient.put("/api/forms/\(formId)/fields/\(fieldId)", body: request)

        if let field = response.field {
            // Update local form
            if let formIndex = forms.firstIndex(where: { $0.id == formId }),
               let fieldIndex = forms[formIndex].fields?.firstIndex(where: { $0.id == fieldId }) {
                forms[formIndex].fields?[fieldIndex] = field
            }
            return field
        }

        throw FormServiceError.updateFieldFailed
    }

    /// Deletes a field
    func deleteField(formId: String, fieldId: String) async throws {
        try await apiClient.delete("/api/forms/\(formId)/fields/\(fieldId)")

        // Update local form
        if let index = forms.firstIndex(where: { $0.id == formId }) {
            forms[index].fields?.removeAll { $0.id == fieldId }
        }
        print("[FormService] Deleted field: \(fieldId)")
    }

    /// Reorders fields
    func reorderFields(formId: String, fieldIds: [String]) async throws {
        struct ReorderRequest: Encodable {
            let fieldIds: [String]
        }

        let _: FieldResponse = try await apiClient.put(
            "/api/forms/\(formId)/fields/reorder",
            body: ReorderRequest(fieldIds: fieldIds)
        )

        // Refresh form to get updated order
        if let form = try? await getForm(id: formId),
           let index = forms.firstIndex(where: { $0.id == formId }) {
            forms[index] = form
        }
    }

    // MARK: - Submissions

    /// Lists submissions for a form
    func listSubmissions(formId: String) async throws -> [FormSubmission] {
        let response: SubmissionListResponse = try await apiClient.get("/api/forms/\(formId)/submissions")
        return response.submissions
    }

    /// Gets a specific submission
    func getSubmission(formId: String, submissionId: String) async throws -> FormSubmission {
        let submission: FormSubmission = try await apiClient.get("/api/forms/\(formId)/submissions/\(submissionId)")
        return submission
    }

    // MARK: - Public Form (for filling)

    /// Gets a public form for filling
    func getPublicForm(formId: String) async throws -> SmartForm {
        let form: SmartForm = try await apiClient.get("/public/form/\(formId)")
        return form
    }

    /// Submits a form
    func submitForm(
        formId: String,
        responses: [(fieldId: String, value: String, source: FormResponseSource)],
        respondentName: String? = nil,
        respondentEmail: String? = nil
    ) async throws -> String {
        let request = SubmitFormRequest(
            responses: responses.map { FormResponseInput(fieldId: $0.fieldId, value: $0.value, source: $0.source.rawValue) },
            respondentName: respondentName,
            respondentEmail: respondentEmail
        )

        let response: SubmitFormResponse = try await apiClient.post("/public/form/\(formId)/submit", body: request)
        print("[FormService] Submitted form: \(formId)")
        return response.submissionId
    }

    /// Gets auto-fill suggestions
    func getAutoFillSuggestions(formId: String, apiKey: String) async throws -> [String: AutoFillSuggestion] {
        let request = AutoFillRequest(apiKey: apiKey)
        let response: AutoFillResponse = try await apiClient.post("/public/form/\(formId)/autofill", body: request)
        return response.suggestions
    }
}

// MARK: - Errors

enum FormServiceError: LocalizedError {
    case createFailed
    case updateFailed
    case addFieldFailed
    case updateFieldFailed

    var errorDescription: String? {
        switch self {
        case .createFailed: return "Failed to create form"
        case .updateFailed: return "Failed to update form"
        case .addFieldFailed: return "Failed to add field"
        case .updateFieldFailed: return "Failed to update field"
        }
    }
}
