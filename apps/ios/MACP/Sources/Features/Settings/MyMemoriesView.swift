import SwiftUI

// MARK: - My Memories View

/// Displays user memories stored in AWS that persist across devices
struct MyMemoriesView: View {
    @State private var memoryIndex: UserMemoryIndexResponse?
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading memories...")
            } else if let error = error {
                ContentUnavailableView(
                    "Error Loading Memories",
                    systemImage: "exclamationmark.triangle",
                    description: Text(error)
                )
            } else if let index = memoryIndex, !index.categories.isEmpty {
                List {
                    Section {
                        HStack {
                            Label("\(index.totalFacts)", systemImage: "brain.head.profile")
                            Spacer()
                            Text("Total facts")
                                .foregroundStyle(.secondary)
                        }

                        if let lastUpdated = index.lastUpdated {
                            HStack {
                                Label("Last updated", systemImage: "clock")
                                Spacer()
                                Text(formatDate(lastUpdated))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } header: {
                        Text("Summary")
                    }

                    Section {
                        ForEach(index.categories, id: \.name) { category in
                            NavigationLink {
                                MemoryCategoryView(categoryName: category.name, displayName: category.displayName)
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(category.displayName)
                                            .font(.headline)

                                        Text("\(category.factCount) facts")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }

                                    Spacer()

                                    Image(systemName: iconForCategory(category.name))
                                        .foregroundStyle(.orange)
                                }
                            }
                        }
                    } header: {
                        Text("Categories")
                    }
                }
            } else {
                ContentUnavailableView(
                    "No Memories Yet",
                    systemImage: "brain.head.profile",
                    description: Text("Memories will appear here as you have conversations. The system learns facts about you like your name, preferences, and dietary restrictions.")
                )
            }
        }
        .navigationTitle("My Memories")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await loadMemories()
        }
        .task {
            await loadMemories()
        }
    }

    private func loadMemories() async {
        isLoading = true
        error = nil

        do {
            memoryIndex = try await APIClient.shared.get("/api/memories")
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    private func formatDate(_ isoString: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: isoString) else {
            return isoString
        }

        let displayFormatter = DateFormatter()
        displayFormatter.dateStyle = .medium
        displayFormatter.timeStyle = .short
        return displayFormatter.string(from: date)
    }

    private func iconForCategory(_ name: String) -> String {
        switch name {
        case "identity": return "person.fill"
        case "dietary": return "leaf.fill"
        case "health": return "heart.fill"
        case "preferences": return "star.fill"
        case "schedule": return "calendar"
        case "family": return "figure.2.and.child.holdinghands"
        case "work": return "briefcase.fill"
        default: return "folder.fill"
        }
    }
}

// MARK: - Memory Category View

/// Shows facts within a specific memory category
struct MemoryCategoryView: View {
    let categoryName: String
    let displayName: String

    @State private var category: UserMemoryCategoryResponse?
    @State private var isLoading = true
    @State private var error: String?
    @State private var factToDelete: UserMemoryFactResponse?
    @State private var showDeleteConfirm = false

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading...")
            } else if let error = error {
                ContentUnavailableView(
                    "Error",
                    systemImage: "exclamationmark.triangle",
                    description: Text(error)
                )
            } else if let category = category, !category.facts.isEmpty {
                List {
                    if !category.summary.isEmpty {
                        Section {
                            Text(category.summary)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        } header: {
                            Text("Summary")
                        }
                    }

                    Section {
                        ForEach(category.facts, id: \.id) { fact in
                            MemoryFactRow(fact: fact)
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        factToDelete = fact
                                        showDeleteConfirm = true
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                        }
                    } header: {
                        Text("Facts (\(category.facts.count))")
                    }
                }
            } else {
                ContentUnavailableView(
                    "No Facts",
                    systemImage: "doc.text",
                    description: Text("No facts recorded in this category")
                )
            }
        }
        .navigationTitle(displayName)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await loadCategory()
        }
        .task {
            await loadCategory()
        }
        .confirmationDialog("Delete Fact", isPresented: $showDeleteConfirm, presenting: factToDelete) { fact in
            Button("Delete", role: .destructive) {
                Task { await deleteFact(fact) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { fact in
            Text("Are you sure you want to delete this memory?")
        }
    }

    private func loadCategory() async {
        isLoading = true
        error = nil

        do {
            category = try await APIClient.shared.get("/api/memories/\(categoryName)")
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    private func deleteFact(_ fact: UserMemoryFactResponse) async {
        do {
            try await APIClient.shared.delete("/api/memories/\(categoryName)/facts/\(fact.id)")
            // Remove from local state
            category?.facts.removeAll { $0.id == fact.id }
        } catch {
            self.error = "Failed to delete: \(error.localizedDescription)"
        }
    }
}

// MARK: - Memory Fact Row

struct MemoryFactRow: View {
    let fact: UserMemoryFactResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Value (the actual memory content)
            Text(factValueString)
                .font(.body)

            // Metadata
            HStack(spacing: 12) {
                // Confidence badge
                HStack(spacing: 4) {
                    Circle()
                        .fill(confidenceColor)
                        .frame(width: 8, height: 8)
                    Text(fact.confidence.capitalized)
                        .font(.caption2)
                }

                Spacer()

                // Source
                if !fact.learnedFrom.isEmpty {
                    Text(fact.learnedFrom)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            // Timestamp
            Text(formatDate(fact.learnedAt))
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }

    private var factValueString: String {
        if let stringValue = fact.value.value as? String {
            return stringValue
        } else if let arrayValue = fact.value.value as? [String] {
            return arrayValue.joined(separator: ", ")
        } else {
            return String(describing: fact.value.value)
        }
    }

    private var confidenceColor: Color {
        switch fact.confidence {
        case "high": return .green
        case "medium": return .orange
        case "low": return .red
        default: return .gray
        }
    }

    private func formatDate(_ isoString: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: isoString) else {
            return isoString
        }

        let displayFormatter = RelativeDateTimeFormatter()
        displayFormatter.unitsStyle = .abbreviated
        return displayFormatter.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Response Models

struct UserMemoryIndexResponse: Codable {
    let userId: String
    let categories: [UserMemoryCategoryMeta]
    let totalFacts: Int
    let lastUpdated: String?
}

struct UserMemoryCategoryMeta: Codable {
    let name: String
    let displayName: String
    let factCount: Int
    let lastUpdated: String
}

struct UserMemoryCategoryResponse: Codable {
    let category: String
    let displayName: String
    let userId: String
    let lastUpdated: String
    let summary: String
    var facts: [UserMemoryFactResponse]
}

struct UserMemoryFactResponse: Codable, Identifiable {
    let id: String
    let key: String
    let value: MemoryAnyCodable
    let confidence: String
    let learnedFrom: String
    let learnedAt: String
    let supersedes: String?
}

/// Helper for decoding arbitrary JSON values
struct MemoryAnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let string = try? container.decode(String.self) {
            value = string
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let array = try? container.decode([String].self) {
            value = array
        } else if let dict = try? container.decode([String: String].self) {
            value = dict
        } else {
            value = ""
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        if let string = value as? String {
            try container.encode(string)
        } else if let int = value as? Int {
            try container.encode(int)
        } else if let double = value as? Double {
            try container.encode(double)
        } else if let bool = value as? Bool {
            try container.encode(bool)
        } else if let array = value as? [String] {
            try container.encode(array)
        } else {
            try container.encode(String(describing: value))
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        MyMemoriesView()
    }
}
