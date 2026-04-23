import SwiftUI

/// Compact row for displaying research results in ContactDetailView
struct ResearchResultRow: View {
    let item: InboxItem
    var onTap: (() -> Void)?

    var body: some View {
        Button {
            onTap?()
        } label: {
            HStack(alignment: .top, spacing: 12) {
                // Category icon
                ZStack {
                    Circle()
                        .fill(Color.purple.opacity(0.15))
                        .frame(width: 36, height: 36)

                    Image(systemName: "magnifyingglass.circle.fill")
                        .font(.system(size: 16))
                        .foregroundColor(.purple)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                        .lineLimit(2)

                    if let preview = item.resolutionPreview {
                        Text(preview)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                    }

                    HStack(spacing: 8) {
                        if let agentName = item.assignedAgentName {
                            Label(agentName, systemImage: "cpu")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }

                        Text(item.timeAgo)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    List {
        Section("Research Results") {
            ResearchResultRow(
                item: InboxItem(
                    task: ServerTask(
                        id: "1",
                        userId: "user1",
                        title: "Birthday gift ideas for Jane",
                        description: nil,
                        status: "completed",
                        priority: "medium",
                        contactId: "contact1",
                        targetPersonName: "Jane",
                        assignedAgentId: "agent1",
                        assignedAgentName: "My Assistant",
                        source: "chat_detected",
                        resolution: "Based on Jane's interests, consider vintage vinyl records or photography equipment.",
                        resolvedAt: Date(),
                        dueDate: nil,
                        createdAt: Date().addingTimeInterval(-7200),
                        updatedAt: Date(),
                        contact: TaskContact(id: "contact1", name: "Jane", relationship: "friend")
                    ),
                    isRead: true
                )
            )

            ResearchResultRow(
                item: InboxItem(
                    task: ServerTask(
                        id: "2",
                        userId: "user1",
                        title: "Jane's favorite restaurants",
                        description: nil,
                        status: "completed",
                        priority: "medium",
                        contactId: "contact1",
                        targetPersonName: "Jane",
                        assignedAgentId: "agent1",
                        assignedAgentName: "My Assistant",
                        source: "chat_detected",
                        resolution: "Jane prefers Italian and Japanese cuisine. Her favorite spots are Trattoria Milano and Sushi Zen.",
                        resolvedAt: Date().addingTimeInterval(-86400),
                        dueDate: nil,
                        createdAt: Date().addingTimeInterval(-90000),
                        updatedAt: Date().addingTimeInterval(-86400),
                        contact: TaskContact(id: "contact1", name: "Jane", relationship: "friend")
                    ),
                    isRead: true
                )
            )
        }
    }
}
