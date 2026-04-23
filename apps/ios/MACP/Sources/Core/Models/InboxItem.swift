import Foundation

/// View model wrapping ServerTask for inbox display
/// Tracks read/unread state locally via UserDefaults
struct InboxItem: Identifiable {
    let task: ServerTask
    var isRead: Bool

    var id: String { task.id }
    var title: String { task.title }
    var resolution: String? { task.resolution }
    var contactId: String? { task.contactId }
    var contact: TaskContact? { task.contact }
    var assignedAgentName: String? { task.assignedAgentName }
    var resolvedAt: Date? { task.resolvedAt }
    var createdAt: Date { task.createdAt }

    /// Category of the inbox item based on task source/type
    var category: InboxCategory {
        if task.contactId != nil {
            return .research
        } else if task.source == "chat_detected" {
            return .taskResult
        } else {
            return .general
        }
    }

    /// Relative time string for display
    var timeAgo: String {
        let date = resolvedAt ?? createdAt
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    /// Preview text for the resolution (truncated)
    var resolutionPreview: String? {
        guard let resolution = resolution else { return nil }
        if resolution.count > 150 {
            return String(resolution.prefix(150)) + "..."
        }
        return resolution
    }

    init(task: ServerTask, isRead: Bool = false) {
        self.task = task
        self.isRead = isRead
    }
}

// MARK: - Inbox Category

enum InboxCategory: String, CaseIterable {
    case research
    case taskResult
    case general

    var displayName: String {
        switch self {
        case .research: return "Research"
        case .taskResult: return "Task Result"
        case .general: return "General"
        }
    }

    var icon: String {
        switch self {
        case .research: return "magnifyingglass.circle.fill"
        case .taskResult: return "checkmark.circle.fill"
        case .general: return "tray.fill"
        }
    }

    var color: String {
        switch self {
        case .research: return "purple"
        case .taskResult: return "green"
        case .general: return "blue"
        }
    }
}
