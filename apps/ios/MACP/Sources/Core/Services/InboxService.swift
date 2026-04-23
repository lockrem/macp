import Foundation
import Combine

/// Service for managing the inbox of completed task results
/// Fetches completed tasks with resolutions and tracks read/unread state locally
@MainActor
class InboxService: ObservableObject {
    static let shared = InboxService()

    private let apiClient = APIClient.shared
    private let readStateKey = "inbox_read_items"

    @Published var items: [InboxItem] = []
    @Published var unreadCount: Int = 0
    @Published var isLoading = false
    @Published var error: String?

    private var readItemIds: Set<String> {
        get {
            let array = UserDefaults.standard.stringArray(forKey: readStateKey) ?? []
            return Set(array)
        }
        set {
            UserDefaults.standard.set(Array(newValue), forKey: readStateKey)
        }
    }

    private init() {}

    // MARK: - Fetch Items

    /// Fetches all completed tasks with resolutions for the inbox
    func fetchInboxItems() async {
        isLoading = true
        error = nil

        do {
            let response: TaskListResponse = try await apiClient.get("/api/tasks?status=completed&limit=100")

            // Filter to tasks with resolutions and map to InboxItems
            let readIds = readItemIds
            items = response.tasks
                .filter { $0.resolution != nil && !$0.resolution!.isEmpty }
                .map { task in
                    InboxItem(task: task, isRead: readIds.contains(task.id))
                }
                .sorted { ($0.resolvedAt ?? $0.createdAt) > ($1.resolvedAt ?? $1.createdAt) }

            updateUnreadCount()
            print("[InboxService] Fetched \(items.count) inbox items, \(unreadCount) unread")
        } catch {
            self.error = "Failed to fetch inbox: \(error.localizedDescription)"
            print("[InboxService] Error: \(error)")
        }

        isLoading = false
    }

    /// Fetches inbox items for a specific contact
    func fetchItemsForContact(_ contactId: String) async -> [InboxItem] {
        do {
            let response: TaskListResponse = try await apiClient.get("/api/tasks?contactId=\(contactId)&status=completed&limit=50")

            let readIds = readItemIds
            return response.tasks
                .filter { $0.resolution != nil && !$0.resolution!.isEmpty }
                .map { task in
                    InboxItem(task: task, isRead: readIds.contains(task.id))
                }
                .sorted { ($0.resolvedAt ?? $0.createdAt) > ($1.resolvedAt ?? $1.createdAt) }
        } catch {
            print("[InboxService] Error fetching contact items: \(error)")
            return []
        }
    }

    // MARK: - Read State

    /// Marks a single item as read
    func markAsRead(_ itemId: String) {
        var ids = readItemIds
        ids.insert(itemId)
        readItemIds = ids

        // Update local state
        if let index = items.firstIndex(where: { $0.id == itemId }) {
            items[index].isRead = true
        }
        updateUnreadCount()
    }

    /// Marks all items as read
    func markAllAsRead() {
        var ids = readItemIds
        for item in items {
            ids.insert(item.id)
        }
        readItemIds = ids

        // Update local state
        for index in items.indices {
            items[index].isRead = true
        }
        updateUnreadCount()
    }

    /// Marks an item as unread
    func markAsUnread(_ itemId: String) {
        var ids = readItemIds
        ids.remove(itemId)
        readItemIds = ids

        // Update local state
        if let index = items.firstIndex(where: { $0.id == itemId }) {
            items[index].isRead = false
        }
        updateUnreadCount()
    }

    // MARK: - Helpers

    private func updateUnreadCount() {
        unreadCount = items.filter { !$0.isRead }.count
    }

    /// Clears read state for items that no longer exist
    func cleanupReadState() {
        let currentIds = Set(items.map { $0.id })
        var ids = readItemIds
        ids = ids.intersection(currentIds)
        readItemIds = ids
    }
}
