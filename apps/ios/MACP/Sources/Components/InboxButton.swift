import SwiftUI

/// Toolbar button for accessing the inbox from navigation bars.
/// Shows unread count badge when there are unread items.
///
/// Note: The main app uses a floating inbox button (FloatingInboxButton in ContentView)
/// visible on all tabs. This toolbar button is available for full-screen covers or
/// modal views where the floating button isn't visible.
struct InboxToolbarButton: View {
    @EnvironmentObject var inboxService: InboxService
    @EnvironmentObject var contactService: ContactService
    @State private var showInbox = false

    var body: some View {
        Button {
            showInbox = true
        } label: {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "tray.fill")
                    .font(.title3)

                // Badge for unread count
                if inboxService.unreadCount > 0 {
                    Text(badgeText)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(Color.red)
                        .clipShape(Capsule())
                        .offset(x: 8, y: -8)
                }
            }
        }
        .accessibilityLabel("Inbox")
        .accessibilityHint(inboxService.unreadCount > 0 ? "\(inboxService.unreadCount) unread items" : "No unread items")
        .sheet(isPresented: $showInbox) {
            InboxSheet()
                .environmentObject(inboxService)
                .environmentObject(contactService)
        }
        .task {
            // Fetch inbox items when button appears
            if inboxService.items.isEmpty {
                await inboxService.fetchInboxItems()
            }
        }
    }

    private var badgeText: String {
        let count = inboxService.unreadCount
        if count > 99 {
            return "99+"
        }
        return "\(count)"
    }
}

#Preview {
    NavigationStack {
        Text("Content")
            .navigationTitle("Test")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    InboxToolbarButton()
                }
            }
    }
    .environmentObject(InboxService.shared)
    .environmentObject(ContactService.shared)
}
