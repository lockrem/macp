import Foundation

// MARK: - SmartForm (named to avoid conflict with SwiftUI Form)

struct SmartForm: Codable, Identifiable {
    let id: String
    var title: String
    var description: String?
    var isPublic: Bool
    var url: String?
    var fields: [FormField]?
    var fieldCount: Int?
    var viewCount: Int?
    var submissionCount: Int?
    let createdAt: Date
    var updatedAt: Date?

    init(
        id: String = "",
        title: String,
        description: String? = nil,
        isPublic: Bool = true,
        url: String? = nil,
        fields: [FormField]? = nil,
        fieldCount: Int? = nil,
        viewCount: Int? = nil,
        submissionCount: Int? = nil,
        createdAt: Date = Date(),
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.isPublic = isPublic
        self.url = url
        self.fields = fields
        self.fieldCount = fieldCount
        self.viewCount = viewCount
        self.submissionCount = submissionCount
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - Form Field

struct FormField: Codable, Identifiable {
    let id: String
    var label: String
    var fieldType: FormFieldType
    var required: Bool
    var placeholder: String?
    var options: [String]?
    var displayOrder: Int

    init(
        id: String = "",
        label: String,
        fieldType: FormFieldType = .text,
        required: Bool = false,
        placeholder: String? = nil,
        options: [String]? = nil,
        displayOrder: Int = 0
    ) {
        self.id = id
        self.label = label
        self.fieldType = fieldType
        self.required = required
        self.placeholder = placeholder
        self.options = options
        self.displayOrder = displayOrder
    }
}

// MARK: - Form Field Type

enum FormFieldType: String, Codable, CaseIterable {
    case text
    case multiline
    case date
    case email
    case phone
    case select

    var displayName: String {
        switch self {
        case .text: return "Text"
        case .multiline: return "Long Text"
        case .date: return "Date"
        case .email: return "Email"
        case .phone: return "Phone"
        case .select: return "Dropdown"
        }
    }

    var icon: String {
        switch self {
        case .text: return "textformat"
        case .multiline: return "text.alignleft"
        case .date: return "calendar"
        case .email: return "envelope"
        case .phone: return "phone"
        case .select: return "list.bullet"
        }
    }
}

// MARK: - Form Submission

struct FormSubmission: Codable, Identifiable {
    let id: String
    let formId: String
    var respondentName: String?
    var respondentEmail: String?
    var status: FormSubmissionStatus
    var responses: [FormResponseDetail]?
    let createdAt: Date
    var submittedAt: Date?
}

enum FormSubmissionStatus: String, Codable {
    case inProgress = "in_progress"
    case completed
}

struct FormResponseDetail: Codable, Identifiable {
    var id: String { fieldId }
    let fieldId: String
    let fieldLabel: String
    let fieldType: FormFieldType
    let value: String
    let source: FormResponseSource
}

enum FormResponseSource: String, Codable {
    case agent
    case user
}

// MARK: - API Request/Response Types

struct CreateFormRequest: Encodable {
    let title: String
    let description: String?
}

struct UpdateFormRequest: Encodable {
    let title: String?
    let description: String?
    let isPublic: Bool?
}

struct CreateFieldRequest: Encodable {
    let label: String
    let fieldType: String
    let required: Bool
    let placeholder: String?
    let options: [String]?
    let displayOrder: Int?
}

struct UpdateFieldRequest: Encodable {
    let label: String?
    let fieldType: String?
    let required: Bool?
    let placeholder: String?
    let options: [String]?
    let displayOrder: Int?
}

struct SubmitFormRequest: Encodable {
    let responses: [FormResponseInput]
    let respondentName: String?
    let respondentEmail: String?
}

struct FormResponseInput: Encodable {
    let fieldId: String
    let value: String
    let source: String
}

struct AutoFillRequest: Encodable {
    let apiKey: String
}

struct FormListResponse: Decodable {
    let forms: [SmartForm]
    let total: Int
}

struct FormResponse: Decodable {
    let success: Bool
    let form: SmartForm?
}

struct FieldResponse: Decodable {
    let success: Bool
    let field: FormField?
}

struct SubmissionListResponse: Decodable {
    let submissions: [FormSubmission]
    let total: Int
}

struct SubmitFormResponse: Decodable {
    let success: Bool
    let submissionId: String
    let status: String
    let submittedAt: Date?
}

struct AutoFillResponse: Decodable {
    let suggestions: [String: AutoFillSuggestion]
}

struct AutoFillSuggestion: Decodable {
    let value: String
    let confidence: String
}
