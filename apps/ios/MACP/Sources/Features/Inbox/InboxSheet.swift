import SwiftUI

/// Main inbox sheet showing completed task results
struct InboxSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var inboxService: InboxService

    @State private var selectedItem: InboxItem?

    var body: some View {
        NavigationStack {
            Group {
                if inboxService.isLoading && inboxService.items.isEmpty {
                    loadingView
                } else if inboxService.items.isEmpty {
                    emptyView
                } else {
                    listView
                }
            }
            .navigationTitle("Inbox")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    if !inboxService.items.isEmpty && inboxService.unreadCount > 0 {
                        Button("Mark All Read") {
                            inboxService.markAllAsRead()
                        }
                    }
                }
            }
            .refreshable {
                await inboxService.fetchInboxItems()
            }
            .task {
                if inboxService.items.isEmpty {
                    await inboxService.fetchInboxItems()
                }
            }
            .sheet(item: $selectedItem) { item in
                InboxItemDetailView(item: item)
                    .environmentObject(inboxService)
            }
        }
    }

    // MARK: - Subviews

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text("Loading inbox...")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var emptyView: some View {
        VStack(spacing: 16) {
            Image(systemName: "tray")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("No Results Yet")
                .font(.headline)

            Text("When your agents complete tasks, the results will appear here.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var listView: some View {
        List {
            ForEach(inboxService.items) { item in
                Button {
                    // Mark as read when tapped
                    if !item.isRead {
                        inboxService.markAsRead(item.id)
                    }
                    selectedItem = item
                } label: {
                    InboxItemRow(item: item) {
                        inboxService.markAsRead(item.id)
                    }
                }
                .buttonStyle(.plain)
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        // Could add delete functionality
                    } label: {
                        Label("Dismiss", systemImage: "trash")
                    }
                }
                .swipeActions(edge: .leading) {
                    if item.isRead {
                        Button {
                            inboxService.markAsUnread(item.id)
                        } label: {
                            Label("Unread", systemImage: "envelope.badge")
                        }
                        .tint(.blue)
                    } else {
                        Button {
                            inboxService.markAsRead(item.id)
                        } label: {
                            Label("Read", systemImage: "envelope.open")
                        }
                        .tint(.green)
                    }
                }
            }
        }
        .listStyle(.plain)
    }
}

#Preview {
    InboxSheet()
        .environmentObject(InboxService.shared)
}
