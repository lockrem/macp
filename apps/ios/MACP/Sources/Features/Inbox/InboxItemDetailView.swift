import SwiftUI

/// Detail view showing full resolution and metadata for an inbox item
struct InboxItemDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var inboxService: InboxService
    @EnvironmentObject var contactService: ContactService

    let item: InboxItem

    @State private var showContactDetail = false
    @State private var linkedContact: Contact?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header with category
                    HStack {
                        Label(item.category.displayName, systemImage: item.category.icon)
                            .font(.subheadline)
                            .foregroundColor(categoryColor)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(categoryColor.opacity(0.1))
                            .clipShape(Capsule())

                        Spacer()

                        Text(item.timeAgo)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }

                    // Title
                    Text(item.title)
                        .font(.title3)
                        .fontWeight(.semibold)

                    Divider()

                    // Resolution content
                    if let resolution = item.resolution {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Result")
                                .font(.headline)
                                .foregroundColor(.secondary)

                            Text(resolution)
                                .font(.body)
                                .textSelection(.enabled)
                        }
                    }

                    Divider()

                    // Metadata section
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Details")
                            .font(.headline)
                            .foregroundColor(.secondary)

                        if let agentName = item.assignedAgentName {
                            MetadataRow(icon: "cpu", label: "Agent", value: agentName)
                        }

                        if let contact = item.contact {
                            Button {
                                loadAndShowContact(contact.id)
                            } label: {
                                MetadataRow(icon: "person", label: "Contact", value: contact.name, isLink: true)
                            }
                        }

                        MetadataRow(
                            icon: "calendar",
                            label: "Created",
                            value: item.createdAt.formatted(date: .abbreviated, time: .shortened)
                        )

                        if let resolvedAt = item.resolvedAt {
                            MetadataRow(
                                icon: "checkmark.circle",
                                label: "Completed",
                                value: resolvedAt.formatted(date: .abbreviated, time: .shortened)
                            )
                        }
                    }

                    Spacer(minLength: 40)
                }
                .padding()
            }
            .navigationTitle("Result Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        if let resolution = item.resolution {
                            Button {
                                UIPasteboard.general.string = resolution
                            } label: {
                                Label("Copy Result", systemImage: "doc.on.doc")
                            }
                        }

                        if item.isRead {
                            Button {
                                inboxService.markAsUnread(item.id)
                            } label: {
                                Label("Mark as Unread", systemImage: "envelope.badge")
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(isPresented: $showContactDetail) {
                if let contact = linkedContact {
                    ContactDetailView(contact: contact)
                        .environmentObject(contactService)
                }
            }
            .onAppear {
                // Mark as read when viewing
                if !item.isRead {
                    inboxService.markAsRead(item.id)
                }
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

    private func loadAndShowContact(_ contactId: String) {
        Task {
            if let contact = await contactService.getContact(id: contactId) {
                linkedContact = contact
                showContactDetail = true
            }
        }
    }
}

// MARK: - Metadata Row

struct MetadataRow: View {
    let icon: String
    let label: String
    let value: String
    var isLink: Bool = false

    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(.secondary)
                .frame(width: 24)

            Text(label)
                .foregroundColor(.secondary)

            Spacer()

            Text(value)
                .foregroundColor(isLink ? .accentColor : .primary)
                .fontWeight(isLink ? .medium : .regular)

            if isLink {
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .font(.subheadline)
    }
}

// MARK: - Make InboxItem Identifiable for sheet

extension InboxItem: Hashable {
    static func == (lhs: InboxItem, rhs: InboxItem) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

#Preview {
    InboxItemDetailView(
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
                resolution: """
                Based on Jane's interests and our previous conversations, here are some birthday gift ideas:

                1. **Vintage Vinyl Records** - She mentioned loving classic rock, especially The Beatles and Led Zeppelin. Check out local record stores for first pressings.

                2. **Photography Equipment** - Since she's into landscape photography, consider:
                   - A quality camera strap
                   - Lens filters for golden hour shots
                   - A portable tripod

                3. **Experience Gifts** - She mentioned wanting to try:
                   - A hot air balloon ride
                   - A cooking class focusing on Italian cuisine

                4. **Books** - Recent interests include:
                   - Nature photography collections
                   - Travel memoirs about Japan
                """,
                resolvedAt: Date(),
                dueDate: nil,
                createdAt: Date().addingTimeInterval(-7200),
                updatedAt: Date(),
                contact: TaskContact(id: "contact1", name: "Jane", relationship: "friend")
            ),
            isRead: false
        )
    )
    .environmentObject(InboxService.shared)
    .environmentObject(ContactService.shared)
}
