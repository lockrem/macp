import Foundation

// MARK: - User Profile Model

struct UserProfile: Codable {
    let userId: String
    let sections: [ProfileSection]
    let totalFacts: Int
}

struct ProfileSection: Codable, Identifiable {
    var id: String { category }

    let category: String
    let displayName: String
    let facts: [ProfileFact]
}

struct ProfileFact: Codable, Identifiable {
    let id: String
    let userId: String
    let category: String
    let key: String
    let value: ProfileFactValue
    let confidence: String?
    let learnedFrom: String?
    let learnedAt: Date
    let supersedes: String?
    let createdAt: Date

    var displayValue: String {
        switch value {
        case .string(let s): return s
        case .number(let n): return String(format: "%.0f", n)
        case .array(let arr): return arr.joined(separator: ", ")
        case .object(let dict):
            return dict.map { "\($0.key): \($0.value)" }.joined(separator: ", ")
        }
    }

    var displayKey: String {
        key.replacingOccurrences(of: "_", with: " ").capitalized
    }

    var sourceCaption: String? {
        guard let from = learnedFrom, !from.isEmpty else { return nil }
        return "Learned from \(from)"
    }
}

// MARK: - Profile Fact Value (handles polymorphic JSON value)

enum ProfileFactValue: Codable {
    case string(String)
    case number(Double)
    case array([String])
    case object([String: String])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let str = try? container.decode(String.self) {
            self = .string(str)
        } else if let num = try? container.decode(Double.self) {
            self = .number(num)
        } else if let arr = try? container.decode([String].self) {
            self = .array(arr)
        } else if let dict = try? container.decode([String: String].self) {
            self = .object(dict)
        } else {
            // Fallback: try to decode as string representation
            self = .string("(unknown)")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let s): try container.encode(s)
        case .number(let n): try container.encode(n)
        case .array(let a): try container.encode(a)
        case .object(let d): try container.encode(d)
        }
    }
}

// MARK: - API Types

struct UpdateProfileRequest: Encodable {
    let facts: [UpdateProfileFact]
}

struct UpdateProfileFact: Encodable {
    let key: String
    let value: String
}

struct UpdateProfileResponse: Decodable {
    let saved: Int
    let profile: UserProfile
}

struct DeleteFactResponse: Decodable {
    let success: Bool
    let profile: UserProfile
}

// MARK: - Category Icons & Colors

extension ProfileSection {
    var icon: String {
        switch category {
        case "identity": return "person.fill"
        case "dietary": return "leaf.fill"
        case "health": return "heart.fill"
        case "preferences": return "star.fill"
        case "wishlist": return "gift.fill"
        case "financial": return "dollarsign.circle.fill"
        case "schedule": return "calendar"
        case "family": return "figure.2.and.child.holdinghands"
        case "work": return "briefcase.fill"
        default: return "info.circle.fill"
        }
    }

    var accentColor: String {
        switch category {
        case "identity": return "blue"
        case "dietary": return "green"
        case "health": return "red"
        case "preferences": return "orange"
        case "wishlist": return "purple"
        case "financial": return "mint"
        case "schedule": return "cyan"
        case "family": return "pink"
        case "work": return "indigo"
        default: return "gray"
        }
    }
}
