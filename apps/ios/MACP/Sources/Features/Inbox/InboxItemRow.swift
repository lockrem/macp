import SwiftUI

/// Row component for displaying an inbox item in the list
struct InboxItemRow: View {
    let item: InboxItem
    let onMarkRead: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Unread indicator and category icon
            ZStack {
                Circle()
                    .fill(categoryColor.opacity(0.15))
                    .frame(width: 44, height: 44)

                Image(systemName: item.category.icon)
                    .font(.system(size: 18))
                    .foregroundColor(categoryColor)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    // Unread dot
                    if !item.isRead {
                        Circle()
                            .fill(Color.blue)
                            .frame(width: 8, height: 8)
                    }

                    Text(item.category.displayName)
                        .font(.caption)
                        .foregroundColor(categoryColor)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(categoryColor.opacity(0.1))
                        .clipShape(Capsule())

                    Spacer()

                    Text(item.timeAgo)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Text(item.title)
                    .font(.subheadline)
                    .fontWeight(item.isRead ? .regular : .semibold)
                    .foregroundColor(.primary)
                    .lineLimit(2)

                if let preview = item.resolutionPreview {
                    Text(preview)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }

                // Agent and contact info
                HStack(spacing: 8) {
                    if let agentName = item.assignedAgentName {
                        Label(agentName, systemImage: "cpu")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }

                    if let contact = item.contact {
                        Label(contact.name, systemImage: "person")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .swipeActions(edge: .leading) {
            if item.isRead {
                Button {
                    // Mark as unread handled by parent
                } label: {
                    Label("Unread", systemImage: "envelope.badge")
                }
                .tint(.blue)
            } else {
                Button {
                    onMarkRead()
                } label: {
                    Label("Read", systemImage: "envelope.open")
                }
                .tint(.green)
            }
        }
    }

    private var categoryColor: Color {
        switch item.category {
        case .research:
            return .purple
        case .taskResult:
            return .green
        case .general:
            return .blue
        }
    }
}

#Preview {
    List {
        InboxItemRow(
            item: InboxItem(
                task: ServerTask(
                    id: "1",
                    userId: "user1",
                    title: "Research birthday gift ideas for Jane",
                    description: nil,
                    status: "completed",
                    priority: "medium",
                    contactId: "contact1",
                    targetPersonName: "Jane",
                    assignedAgentId: "agent1",
                    assignedAgentName: "My Assistant",
                    source: "chat_detected",
                    resolution: "Based on Jane's interests, here are some birthday gift ideas: 1. Vintage vinyl records - she mentioned loving classic rock. 2. Photography equipment since she's into landscape photography.",
                    resolvedAt: Date(),
                    dueDate: nil,
                    createdAt: Date().addingTimeInterval(-7200),
                    updatedAt: Date(),
                    contact: TaskContact(id: "contact1", name: "Jane", relationship: "friend")
                ),
                isRead: false
            ),
            onMarkRead: {}
        )

        InboxItemRow(
            item: InboxItem(
                task: ServerTask(
                    id: "2",
                    userId: "user1",
                    title: "Book restaurant reservation",
                    description: nil,
                    status: "completed",
                    priority: "medium",
                    contactId: nil,
                    targetPersonName: nil,
                    assignedAgentId: "agent1",
                    assignedAgentName: "Concierge",
                    source: "manual",
                    resolution: "Reservation confirmed at The Italian Place for 7pm, party of 4.",
                    resolvedAt: Date().addingTimeInterval(-86400),
                    dueDate: nil,
                    createdAt: Date().addingTimeInterval(-90000),
                    updatedAt: Date().addingTimeInterval(-86400),
                    contact: nil
                ),
                isRead: true
            ),
            onMarkRead: {}
        )
    }
}
