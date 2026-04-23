import SwiftUI

/// Displays a single agent rule with timestamp
struct RuleRowView: View {
    let rule: AgentRule

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(rule.content)
                .font(.subheadline)

            Text(formatDate(rule.createdAt))
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 2)
    }

    private func formatDate(_ isoString: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: isoString) else { return "" }
        let displayFormatter = RelativeDateTimeFormatter()
        return displayFormatter.localizedString(for: date, relativeTo: Date())
    }
}
