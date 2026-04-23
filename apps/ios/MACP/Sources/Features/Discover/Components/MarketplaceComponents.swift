import SwiftUI

// MARK: - Category Pill

struct CategoryPill: View {
    let category: MarketplaceCategory
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Image(systemName: category.icon)
                    .font(.caption)

                Text(category.rawValue)
                    .font(.subheadline)
                    .fontWeight(isSelected ? .semibold : .regular)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(isSelected ? category.color : Color(.systemGray5))
            )
            .foregroundStyle(isSelected ? .white : .primary)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Marketplace Agent Card

struct MarketplaceAgentCard: View {
    let agent: MarketplaceAgent
    let isAdded: Bool
    let onTap: () -> Void

    init(agent: MarketplaceAgent, isAdded: Bool = false, onTap: @escaping () -> Void) {
        self.agent = agent
        self.isAdded = isAdded
        self.onTap = onTap
    }

    var accentColor: Color {
        switch agent.accentColor {
        case "red": return .red
        case "orange": return .orange
        case "green": return .green
        case "purple": return .purple
        case "cyan": return .cyan
        case "pink": return .pink
        case "yellow": return .yellow
        default: return .blue
        }
    }

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(accentColor.opacity(0.15))
                        .frame(width: 60, height: 60)

                    Text(agent.emoji)
                        .font(.system(size: 32))
                }

                VStack(spacing: 4) {
                    Text(agent.name)
                        .font(.headline)
                        .fontWeight(.semibold)
                        .lineLimit(1)

                    Text(agent.shortDescription)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                }

                HStack(spacing: 8) {
                    if isAdded {
                        Label("Added", systemImage: "checkmark.circle.fill")
                            .font(.caption2)
                            .fontWeight(.medium)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.blue.opacity(0.15))
                            .foregroundStyle(.blue)
                            .clipShape(Capsule())
                    } else if agent.isMACPOriginal {
                        Label("Official", systemImage: "checkmark.seal.fill")
                            .font(.caption2)
                            .foregroundStyle(.yellow)
                    }

                    if agent.isFree && !isAdded {
                        Text("Free")
                            .font(.caption2)
                            .fontWeight(.medium)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.green.opacity(0.15))
                            .foregroundStyle(.green)
                            .clipShape(Capsule())
                    }
                }

                HStack(spacing: 4) {
                    Image(systemName: "star.fill")
                        .font(.caption2)
                        .foregroundStyle(.yellow)

                    Text(String(format: "%.1f", agent.rating))
                        .font(.caption)
                        .fontWeight(.medium)

                    Text("(\(agent.reviewCount))")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(.systemBackground))
                    .shadow(color: accentColor.opacity(0.1), radius: 8, y: 4)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(accentColor.opacity(0.2), lineWidth: 1)
            )
        }
        .buttonStyle(AgentCardButtonStyle())
    }
}

