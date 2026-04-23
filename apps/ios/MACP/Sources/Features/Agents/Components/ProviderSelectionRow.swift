import SwiftUI

/// Reusable row for selecting an AI provider
/// Used in AgentEditorView and AgentDetailView
struct ProviderSelectionRow: View {
    let provider: AgentProvider
    let isSelected: Bool
    let isAvailable: Bool
    let onSelect: () -> Void

    var providerColor: Color {
        switch provider.accentColor {
        case "orange": return .orange
        case "green": return .green
        case "blue": return .blue
        case "purple": return .purple
        default: return .gray
        }
    }

    var body: some View {
        Button(action: onSelect) {
            HStack {
                Image(provider.iconName)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 24, height: 24)

                VStack(alignment: .leading) {
                    Text(provider.displayName)
                        .foregroundStyle(isAvailable ? .primary : .secondary)

                    if !isAvailable {
                        Text("API key not configured")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.blue)
                } else if isAvailable {
                    Image(systemName: "circle")
                        .foregroundStyle(.secondary)
                } else {
                    Image(systemName: "lock")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .disabled(!isAvailable && !isSelected)
    }
}
