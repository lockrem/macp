import SwiftUI

struct ContactRow: View {
    let contact: Contact
    var onTap: (() -> Void)? = nil

    var body: some View {
        Button(action: { onTap?() }) {
            HStack(spacing: 12) {
                // Avatar with initials
                ZStack {
                    Circle()
                        .fill(avatarColor.opacity(0.2))
                        .frame(width: 44, height: 44)

                    Text(initials)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(avatarColor)
                }

                // Contact info
                VStack(alignment: .leading, spacing: 2) {
                    Text(contact.name)
                        .font(.headline)
                        .foregroundColor(.primary)

                    if let relationship = contact.relationship {
                        HStack(spacing: 4) {
                            if let type = RelationshipType(rawValue: relationship) {
                                Image(systemName: type.icon)
                                    .font(.caption)
                            }
                            Text(RelationshipType(rawValue: relationship)?.displayName ?? relationship.capitalized)
                                .font(.subheadline)
                        }
                        .foregroundColor(.secondary)
                    }

                    // Show agent count if any
                    if let agents = contact.agents, !agents.isEmpty {
                        HStack(spacing: 4) {
                            ForEach(agents.prefix(3)) { agent in
                                Text(agent.agentEmoji ?? "🤖")
                                    .font(.caption)
                            }
                            if agents.count > 3 {
                                Text("+\(agents.count - 3)")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Computed Properties

    private var initials: String {
        let components = contact.name.split(separator: " ")
        if components.count >= 2 {
            return String(components[0].prefix(1) + components[1].prefix(1)).uppercased()
        }
        return String(contact.name.prefix(2)).uppercased()
    }

    private var avatarColor: Color {
        // Generate consistent color based on name
        let hash = contact.name.hashValue
        let colors: [Color] = [.blue, .purple, .pink, .orange, .green, .teal, .indigo, .mint]
        return colors[abs(hash) % colors.count]
    }
}

// MARK: - Compact Row Variant

struct ContactCompactRow: View {
    let contact: Contact
    var showAgents: Bool = true

    var body: some View {
        HStack(spacing: 10) {
            // Mini avatar
            ZStack {
                Circle()
                    .fill(avatarColor.opacity(0.2))
                    .frame(width: 32, height: 32)

                Text(String(contact.name.prefix(1)).uppercased())
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(avatarColor)
            }

            Text(contact.name)
                .font(.subheadline)
                .lineLimit(1)

            if showAgents, let agents = contact.agents, !agents.isEmpty {
                Spacer()
                HStack(spacing: 2) {
                    ForEach(agents.prefix(2)) { agent in
                        Text(agent.agentEmoji ?? "🤖")
                            .font(.caption2)
                    }
                }
            }
        }
    }

    private var avatarColor: Color {
        let hash = contact.name.hashValue
        let colors: [Color] = [.blue, .purple, .pink, .orange, .green, .teal, .indigo, .mint]
        return colors[abs(hash) % colors.count]
    }
}

// MARK: - Preview

#Preview {
    List {
        ContactRow(
            contact: Contact(
                name: "Jane Smith",
                relationship: "partner",
                agents: [
                    ContactAgent(
                        contactId: "1",
                        publicAgentId: "agent-1",
                        agentName: "Jane's Assistant",
                        agentEmoji: "🎀"
                    ),
                    ContactAgent(
                        contactId: "1",
                        publicAgentId: "agent-2",
                        agentName: "Health Buddy",
                        agentEmoji: "💪"
                    )
                ]
            )
        )

        ContactRow(
            contact: Contact(
                name: "Mom",
                relationship: "family"
            )
        )

        ContactCompactRow(
            contact: Contact(
                name: "Bob",
                agents: [
                    ContactAgent(
                        contactId: "2",
                        publicAgentId: "agent-3",
                        agentName: "Work Agent",
                        agentEmoji: "💼"
                    )
                ]
            )
        )
    }
}
