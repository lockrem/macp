import SwiftUI

// MARK: - Suggestion Chips

/// A view that displays tappable suggestion chips in a flowing layout
struct SuggestionChips: View {
    let suggestions: [String]
    let accentColor: Color
    let onSelect: (String) -> Void

    var showHeader: Bool = true

    var body: some View {
        VStack(spacing: 8) {
            if showHeader {
                Text("Try saying...")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .padding(.top, 20)
            }

            FlowLayout(spacing: 8) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        onSelect(suggestion)
                    } label: {
                        Text(suggestion)
                            .font(.subheadline)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(accentColor.opacity(0.1))
                            .foregroundStyle(accentColor)
                            .clipShape(Capsule())
                    }
                }
            }
            .padding(.horizontal)
        }
    }
}

// MARK: - Agent Suggestions Helper

/// Generates contextual suggestions based on agent type
struct AgentSuggestions {
    static func forAgent(named name: String) -> [String] {
        let lowercasedName = name.lowercased()

        if lowercasedName.contains("health") {
            return [
                "I've been feeling tired lately",
                "Update my medications",
                "Log today's symptoms"
            ]
        } else if lowercasedName.contains("fitness") {
            return [
                "I worked out today",
                "What should I eat?",
                "I hit my step goal!"
            ]
        } else if lowercasedName.contains("work") {
            return [
                "What's on my calendar?",
                "I finished a big project",
                "Help me prioritize"
            ]
        } else if lowercasedName.contains("money") || lowercasedName.contains("finance") {
            return [
                "I made a purchase today",
                "How's my budget?",
                "I got paid today"
            ]
        } else if lowercasedName.contains("journal") {
            return [
                "How was my day?",
                "I'm grateful for...",
                "Something's on my mind"
            ]
        } else if lowercasedName.contains("study") || lowercasedName.contains("learn") {
            return [
                "Help me understand this",
                "Quiz me on the topic",
                "Explain it simply"
            ]
        } else {
            return [
                "Tell me about yourself",
                "What can you help with?",
                "Let's chat!"
            ]
        }
    }

    /// Universal suggestions for orchestrated chat
    static let universal: [String] = [
        "I need to refill my medication",
        "What meetings do I have?",
        "Track my workout",
        "Check my budget",
        "How was my day?",
        "Help me study"
    ]
}

// MARK: - Preview

#Preview {
    VStack {
        SuggestionChips(
            suggestions: AgentSuggestions.forAgent(named: "Health Buddy"),
            accentColor: .red,
            onSelect: { print("Selected: \($0)") }
        )

        Divider()

        SuggestionChips(
            suggestions: AgentSuggestions.universal,
            accentColor: .blue,
            onSelect: { print("Selected: \($0)") }
        )
    }
    .padding()
}
