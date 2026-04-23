import SwiftUI

// MARK: - Introduction Question Row

/// Displays a single introduction question with edit/delete actions
/// Used by both AgentEditorView and AgentDetailView
struct IntroductionQuestionRow: View {
    let question: IntroductionQuestion
    let index: Int
    let onEdit: () -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Q\(index)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.blue)
                    .clipShape(Capsule())

                Spacer()

                Button(role: .destructive, action: onDelete) {
                    Image(systemName: "trash")
                        .font(.caption)
                }
                .buttonStyle(.borderless)
            }

            Text(question.question)
                .font(.subheadline)

            if let followUp = question.followUp, !followUp.isEmpty {
                Text("Follow-up: \(followUp)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 8) {
                if !question.extractsMemory.isEmpty {
                    Label("\(question.extractsMemory.count) memories", systemImage: "brain.head.profile")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                if question.extractsRules {
                    Label("Preferences", systemImage: "heart.fill")
                        .font(.caption2)
                        .foregroundStyle(.pink)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Add Introduction Question Sheet

/// Sheet for adding a new introduction question
struct AddIntroductionQuestionSheet: View {
    @Environment(\.dismiss) var dismiss
    let onAdd: (IntroductionQuestion) -> Void

    @State private var question = ""
    @State private var followUp = ""
    @State private var extractsRules = false
    @State private var memoryCategories: [String] = []
    @State private var newCategory = ""

    let suggestedCategories = ["health", "work", "personal", "goals", "preferences", "background", "contact"]

    var body: some View {
        NavigationStack {
            Form {
                questionSection
                followUpSection
                ruleExtractionSection
                memoryCategoriesSection
            }
            .navigationTitle("Add Question")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let newQuestion = IntroductionQuestion(
                            question: question,
                            followUp: followUp.isEmpty ? nil : followUp,
                            extractsMemory: memoryCategories,
                            extractsRules: extractsRules
                        )
                        onAdd(newQuestion)
                        dismiss()
                    }
                    .disabled(question.isEmpty)
                }
            }
        }
        .presentationDetents([.large])
    }

    private var questionSection: some View {
        Section {
            TextField("What would you like to ask?", text: $question, axis: .vertical)
                .lineLimit(2...4)
        } header: {
            Text("Question")
        } footer: {
            Text("This question will be asked during the introduction flow")
        }
    }

    private var followUpSection: some View {
        Section {
            TextField("Optional follow-up question", text: $followUp, axis: .vertical)
                .lineLimit(2...3)
        } header: {
            Text("Follow-up")
        } footer: {
            Text("Asked after the initial answer to gather more detail")
        }
    }

    private var ruleExtractionSection: some View {
        Section {
            Toggle("Extracts Preferences/Rules", isOn: $extractsRules)
        } header: {
            Text("Rule Extraction")
        } footer: {
            Text("Enable if answers should be saved as user preferences (e.g., \"I prefer morning appointments\")")
        }
    }

    private var memoryCategoriesSection: some View {
        Section {
            if !memoryCategories.isEmpty {
                ForEach(memoryCategories, id: \.self) { category in
                    HStack {
                        Text(category)
                        Spacer()
                        Button {
                            memoryCategories.removeAll { $0 == category }
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }

            HStack {
                TextField("Add category", text: $newCategory)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                Button {
                    if !newCategory.isEmpty && !memoryCategories.contains(newCategory) {
                        memoryCategories.append(newCategory.lowercased())
                        newCategory = ""
                    }
                } label: {
                    Image(systemName: "plus.circle.fill")
                }
                .disabled(newCategory.isEmpty)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(suggestedCategories.filter { !memoryCategories.contains($0) }, id: \.self) { category in
                        Button {
                            memoryCategories.append(category)
                        } label: {
                            Text(category)
                                .font(.caption)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color(.systemGray5))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        } header: {
            Text("Memory Categories")
        } footer: {
            Text("Facts from answers will be stored in these categories")
        }
    }
}
