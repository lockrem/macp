import SwiftUI

/// Detail view for browsing facts within a memory category
struct MemoryCategoryDetailView: View {
    let category: MemoryCategoryMeta
    @EnvironmentObject var memoryService: MemoryService
    @State private var categoryData: UserMemoryCategory?
    @State private var isLoading = true

    var body: some View {
        List {
            if isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
            } else if let data = categoryData {
                if !data.summary.isEmpty {
                    Section {
                        Text(data.summary)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } header: {
                        Text("Summary")
                    }
                }

                Section {
                    ForEach(data.facts) { fact in
                        FactRow(fact: fact)
                    }
                } header: {
                    Text("Facts (\(data.facts.count))")
                }
            } else {
                Text("Unable to load memory data")
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle(category.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            categoryData = await memoryService.fetchCategory(category.name)
            isLoading = false
        }
    }
}

/// Row displaying a single memory fact
private struct FactRow: View {
    let fact: UserMemoryFact

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(fact.key.replacingOccurrences(of: "_", with: " ").capitalized)
                .font(.caption)
                .foregroundStyle(.secondary)

            Text(fact.displayValue)
                .font(.subheadline)

            HStack {
                Text(fact.confidence.displayName)
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(confidenceColor.opacity(0.15))
                    .foregroundStyle(confidenceColor)
                    .clipShape(Capsule())

                Spacer()

                Text(formatDate(fact.learnedAt))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
    }

    private var confidenceColor: Color {
        switch fact.confidence {
        case .high: return .green
        case .medium: return .orange
        case .low: return .red
        }
    }

    private func formatDate(_ isoString: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: isoString) else { return "" }
        let displayFormatter = RelativeDateTimeFormatter()
        return displayFormatter.localizedString(for: date, relativeTo: Date())
    }
}
