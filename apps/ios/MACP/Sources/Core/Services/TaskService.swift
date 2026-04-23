import Foundation

/// Service for syncing tasks with the server
/// Tasks created locally are also persisted to the server for:
/// - Cross-device access
/// - Contact association
/// - Completion tracking during orchestrated conversations
@MainActor
class TaskService: ObservableObject {
    static let shared = TaskService()

    private let apiClient = APIClient.shared

    @Published var tasks: [ServerTask] = []
    @Published var isLoading = false
    @Published var error: String?

    private init() {}

    // MARK: - Create Task

    /// Creates a task on the server, optionally linking to a contact by person name
    /// Returns the server-generated task ID for use in orchestrated sessions
    func createTask(
        title: String,
        description: String? = nil,
        priority: TaskPriority = .medium,
        targetPersonName: String? = nil,
        source: TaskSource = .manual
    ) async throws -> ServerTask {
        let request = CreateTaskRequest(
            title: title,
            description: description,
            priority: priority.rawValue,
            targetPersonName: targetPersonName,
            source: source.rawValue
        )

        let task: ServerTask = try await apiClient.post("/api/tasks", body: request)

        // Add to local cache
        tasks.insert(task, at: 0)

        print("[TaskService] Created task: \(task.title) (id: \(task.id), contactId: \(task.contactId ?? "none"))")

        return task
    }

    // MARK: - List Tasks

    /// Fetches tasks from the server
    func fetchTasks(
        status: [TaskStatus]? = nil,
        contactId: String? = nil
    ) async throws {
        isLoading = true
        defer { isLoading = false }

        var path = "/api/tasks?"
        if let status = status {
            path += "status=\(status.map { $0.rawValue }.joined(separator: ","))&"
        }
        if let contactId = contactId {
            path += "contactId=\(contactId)&"
        }
        path += "limit=50"

        let response: TaskListResponse = try await apiClient.get(path)
        tasks = response.tasks

        print("[TaskService] Fetched \(tasks.count) tasks")
    }

    /// Gets tasks for a specific contact
    func tasksForContact(_ contactId: String) async throws -> [ServerTask] {
        let response: TaskListResponse = try await apiClient.get("/api/tasks?contactId=\(contactId)&limit=50")
        return response.tasks
    }

    // MARK: - Update Task

    /// Updates a task's status
    func updateTaskStatus(_ taskId: String, status: TaskStatus) async throws -> ServerTask {
        let request = UpdateTaskRequest(status: status.rawValue)
        let task: ServerTask = try await apiClient.patch("/api/tasks/\(taskId)", body: request)

        // Update local cache
        if let index = tasks.firstIndex(where: { $0.id == taskId }) {
            tasks[index] = task
        }

        return task
    }

    /// Completes a task with a resolution
    func completeTask(_ taskId: String, resolution: String) async throws -> ServerTask {
        let request = CompleteTaskRequest(resolution: resolution)
        let task: ServerTask = try await apiClient.post("/api/tasks/\(taskId)/complete", body: request)

        // Update local cache
        if let index = tasks.firstIndex(where: { $0.id == taskId }) {
            tasks[index] = task
        }

        print("[TaskService] Completed task: \(task.title)")

        return task
    }

    // MARK: - Delete Task

    func deleteTask(_ taskId: String) async throws {
        try await apiClient.delete("/api/tasks/\(taskId)")

        // Remove from local cache
        tasks.removeAll { $0.id == taskId }
    }

    // MARK: - Sync Agent Tasks

    /// Creates a server task from a local task description and returns the server ID
    /// This should be called when a task is detected in chat
    func syncTask(
        description: String,
        targetPersonName: String?
    ) async throws -> String {
        let task = try await createTask(
            title: description,
            description: nil,
            priority: .medium,
            targetPersonName: targetPersonName,
            source: .chatDetected
        )

        return task.id
    }
}

// MARK: - API Types

struct CreateTaskRequest: Encodable {
    let title: String
    let description: String?
    let priority: String
    let targetPersonName: String?
    let source: String
}

struct UpdateTaskRequest: Encodable {
    let status: String?
    let title: String?
    let description: String?

    init(status: String? = nil, title: String? = nil, description: String? = nil) {
        self.status = status
        self.title = title
        self.description = description
    }
}

struct CompleteTaskRequest: Encodable {
    let resolution: String
}

struct TaskListResponse: Decodable {
    let tasks: [ServerTask]
    let total: Int
    let hasMore: Bool
}

struct ServerTask: Codable, Identifiable {
    let id: String
    let userId: String
    let title: String
    let description: String?
    let status: String
    let priority: String
    let contactId: String?
    let targetPersonName: String?
    let assignedAgentId: String?
    let assignedAgentName: String?
    let source: String
    let resolution: String?
    let resolvedAt: Date?
    let dueDate: Date?
    let createdAt: Date
    let updatedAt: Date
    let contact: TaskContact?

    var statusEnum: TaskStatus {
        TaskStatus(rawValue: status) ?? .pending
    }

    var priorityEnum: TaskPriority {
        TaskPriority(rawValue: priority) ?? .medium
    }
}

struct TaskContact: Codable {
    let id: String
    let name: String
    let relationship: String?
}

enum TaskStatus: String, Codable, CaseIterable {
    case pending
    case inProgress = "in_progress"
    case waiting
    case completed
    case cancelled
    case failed

    var displayName: String {
        switch self {
        case .pending: return "Pending"
        case .inProgress: return "In Progress"
        case .waiting: return "Waiting"
        case .completed: return "Completed"
        case .cancelled: return "Cancelled"
        case .failed: return "Failed"
        }
    }

    var icon: String {
        switch self {
        case .pending: return "circle"
        case .inProgress: return "arrow.triangle.2.circlepath"
        case .waiting: return "clock"
        case .completed: return "checkmark.circle.fill"
        case .cancelled: return "xmark.circle"
        case .failed: return "exclamationmark.triangle"
        }
    }
}

enum TaskPriority: String, Codable, CaseIterable {
    case low
    case medium
    case high
    case urgent

    var displayName: String {
        switch self {
        case .low: return "Low"
        case .medium: return "Medium"
        case .high: return "High"
        case .urgent: return "Urgent"
        }
    }
}

enum TaskSource: String, Codable {
    case manual
    case chatDetected = "chat_detected"
    case recurring
}
