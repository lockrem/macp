import SwiftUI

/// Distinctive profile card shown above the search bar on the People tab.
/// Shows category icons with count badges for a quick overview of learned facts.
struct MyProfileCard: View {
    let profile: UserProfile?
    let onTap: () -> Void

    /// All memory categories in display order
    private static let categories: [(key: String, icon: String, color: Color)] = [
        ("identity", "person.fill", .blue),
        ("dietary", "leaf.fill", .green),
        ("health", "heart.fill", .red),
        ("preferences", "star.fill", .orange),
        ("wishlist", "gift.fill", .purple),
        ("financial", "dollarsign.circle.fill", .mint),
        ("schedule", "calendar", .cyan),
        ("family", "figure.2.and.child.holdinghands", .pink),
        ("work", "briefcase.fill", .indigo),
        ("general", "info.circle.fill", .gray),
    ]

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 14) {
                // Header
                HStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(.blue.gradient)
                            .frame(width: 38, height: 38)
                        Image(systemName: "person.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("My Profile")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        Text(subtitle)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }

                // Category icons - 2 rows of 5
                VStack(spacing: 12) {
                    HStack(spacing: 0) {
                        ForEach(Array(Self.categories.prefix(5).enumerated()), id: \.offset) { _, cat in
                            Spacer(minLength: 0)
                            categoryBubble(icon: cat.icon, color: cat.color, count: count(for: cat.key))
                            Spacer(minLength: 0)
                        }
                    }
                    HStack(spacing: 0) {
                        ForEach(Array(Self.categories.suffix(5).enumerated()), id: \.offset) { _, cat in
                            Spacer(minLength: 0)
                            categoryBubble(icon: cat.icon, color: cat.color, count: count(for: cat.key))
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helpers

    private var subtitle: String {
        guard let profile, profile.totalFacts > 0 else {
            return "Learned from your conversations"
        }
        return "\(profile.totalFacts) fact\(profile.totalFacts == 1 ? "" : "s") learned about you"
    }

    private func count(for category: String) -> Int {
        profile?.sections.first { $0.category == category }?.facts.count ?? 0
    }

    @ViewBuilder
    private func categoryBubble(icon: String, color: Color, count: Int) -> some View {
        let active = count > 0

        ZStack(alignment: .topTrailing) {
            Circle()
                .fill(active ? color.opacity(0.12) : Color(.systemGray5))
                .frame(width: 40, height: 40)
                .overlay {
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(active ? color : Color(.systemGray3))
                }

            if active {
                Text("\(count)")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(minWidth: 16, minHeight: 16)
                    .background(color, in: Circle())
                    .offset(x: 4, y: -4)
            }
        }
    }
}

#Preview {
    VStack {
        MyProfileCard(profile: nil) { }
            .padding()
        Spacer()
    }
    .background(Color(.systemGroupedBackground))
}
