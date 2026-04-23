import SwiftUI

// MARK: - Chat Greeting View

/// A reusable greeting view shown at the start of a chat
struct ChatGreetingView: View {
    let agentName: String
    let agentEmoji: String
    let greeting: String
    let accentColor: Color

    var suggestions: [String] = []
    var onSuggestionSelect: ((String) -> Void)?

    var body: some View {
        VStack(spacing: 20) {
            Spacer().frame(height: 40)

            // Avatar
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.15))
                    .frame(width: 100, height: 100)

                Text(agentEmoji)
                    .font(.system(size: 50))
            }

            // Greeting
            VStack(spacing: 8) {
                Text(agentName)
                    .font(.title2)
                    .fontWeight(.bold)

                Text(greeting)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
            }

            // Suggestion chips
            if !suggestions.isEmpty, let onSelect = onSuggestionSelect {
                SuggestionChips(
                    suggestions: suggestions,
                    accentColor: accentColor,
                    onSelect: onSelect
                )
            }

            Spacer()
        }
    }
}

// MARK: - Universal Chat Greeting

/// Greeting view for orchestrated universal chat (multiple agents)
struct UniversalChatGreetingView: View {
    let agentEmojis: [String]
    var greeting: String = "Your agents are ready to help"
    var suggestions: [String] = AgentSuggestions.universal
    var onSuggestionSelect: ((String) -> Void)?

    var body: some View {
        VStack(spacing: 24) {
            Spacer().frame(height: 40)

            // Agent avatars in overlapping row
            HStack(spacing: -15) {
                ForEach(agentEmojis, id: \.self) { emoji in
                    ZStack {
                        Circle()
                            .fill(Color(.systemBackground))
                            .frame(width: 50, height: 50)
                            .shadow(color: .black.opacity(0.1), radius: 2)

                        Text(emoji)
                            .font(.system(size: 24))
                    }
                }
            }

            VStack(spacing: 8) {
                Text(timeBasedGreeting)
                    .font(.title2)
                    .fontWeight(.medium)

                Text(greeting)
                    .font(.body)
                    .foregroundStyle(.secondary)
            }

            // Quick suggestions
            if !suggestions.isEmpty, let onSelect = onSuggestionSelect {
                SuggestionChips(
                    suggestions: suggestions,
                    accentColor: .blue,
                    onSelect: onSelect
                )
            }

            Spacer()
        }
    }

    private var timeBasedGreeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Good morning"
        case 12..<17: return "Good afternoon"
        case 17..<22: return "Good evening"
        default: return "Good night"
        }
    }
}

// MARK: - Preview

#Preview("Single Agent") {
    ChatGreetingView(
        agentName: "Health Buddy",
        agentEmoji: "",
        greeting: "Hi! How are you feeling today?",
        accentColor: .red,
        suggestions: AgentSuggestions.forAgent(named: "Health Buddy"),
        onSuggestionSelect: { print("Selected: \($0)") }
    )
}

#Preview("Universal") {
    UniversalChatGreetingView(
        agentEmojis: ["", "", "", "", "", ""],
        onSuggestionSelect: { print("Selected: \($0)") }
    )
}
