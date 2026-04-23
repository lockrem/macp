import SwiftUI

// MARK: - Chat Message Bubble

/// A reusable chat bubble component that handles both user and agent messages
struct ChatMessageBubble: View {
    let message: ChatMessage
    let accentColor: Color
    var showAgentName: Bool = true
    var showAvatar: Bool = true

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.isFromUser {
                Spacer(minLength: 60)
            } else if showAvatar {
                agentAvatar
            }

            VStack(alignment: message.isFromUser ? .trailing : .leading, spacing: 4) {
                // Agent name (for non-user messages)
                if !message.isFromUser, showAgentName, let name = message.agentName {
                    HStack(spacing: 4) {
                        if let emoji = message.agentEmoji, !showAvatar {
                            Text(emoji)
                                .font(.caption)
                        }
                        Text(name)
                            .font(.caption)
                            .fontWeight(.medium)
                            .foregroundStyle(accentColor)
                    }
                    .padding(.leading, showAvatar ? 0 : 4)
                }

                // Message content
                Text(message.content)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(message.isFromUser ? accentColor : Color(.systemBackground))
                    .foregroundStyle(message.isFromUser ? .white : .primary)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                    .shadow(color: .black.opacity(0.05), radius: 2)
            }

            if !message.isFromUser {
                Spacer(minLength: 60)
            }
        }
    }

    @ViewBuilder
    private var agentAvatar: some View {
        ZStack {
            Circle()
                .fill(accentColor.opacity(0.15))
                .frame(width: 32, height: 32)
            Text(message.agentEmoji ?? "")
                .font(.system(size: 16))
        }
    }
}

// MARK: - Simple Chat Bubble (minimal version)

/// Simplified bubble for cases where you just need basic user/agent differentiation
struct SimpleChatBubble: View {
    let content: String
    let isFromUser: Bool
    let accentColor: Color

    var body: some View {
        HStack {
            if isFromUser {
                Spacer(minLength: 60)
            }

            Text(content)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(isFromUser ? accentColor : Color(.systemBackground))
                .foregroundStyle(isFromUser ? .white : .primary)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .shadow(color: .black.opacity(0.05), radius: 2)

            if !isFromUser {
                Spacer(minLength: 60)
            }
        }
    }
}

// MARK: - Preview

#Preview("User Message") {
    ChatMessageBubble(
        message: ChatMessage(
            content: "Hello, how are you today?",
            isFromUser: true
        ),
        accentColor: .blue
    )
    .padding()
}

#Preview("Agent Message") {
    ChatMessageBubble(
        message: ChatMessage(
            content: "I'm doing great! How can I help you?",
            isFromUser: false,
            agentName: "Health Buddy",
            agentEmoji: ""
        ),
        accentColor: .red
    )
    .padding()
}
