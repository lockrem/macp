import SwiftUI

/// View for managing rules/preferences for a specific agent
struct AgentRulesView: View {
    let agentId: String
    let agentName: String
    let agentEmoji: String?

    @EnvironmentObject var rulesService: RulesService
    @Environment(\.dismiss) var dismiss

    @State private var rules: [AgentRule] = []
    @State private var newRuleText = ""
    @State private var isLoading = false
    @State private var editingRule: AgentRule?
    @State private var editText = ""
    @State private var showDeleteConfirmation = false
    @State private var ruleToDelete: AgentRule?

    var body: some View {
        NavigationStack {
            List {
                // Add new rule section
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Add preferences or instructions for \(agentName)")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        TextField("e.g., \"I prefer natural remedies over prescriptions\"", text: $newRuleText, axis: .vertical)
                            .lineLimit(2...4)

                        HStack {
                            Spacer()
                            Button {
                                addRule()
                            } label: {
                                Label("Add Rule", systemImage: "plus.circle.fill")
                            }
                            .disabled(newRuleText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                } header: {
                    Text("New Rule")
                }

                // Existing rules
                if !rules.isEmpty {
                    Section {
                        ForEach(rules) { rule in
                            RuleRow(
                                rule: rule,
                                isEditing: editingRule?.id == rule.id,
                                editText: $editText,
                                onEdit: { startEditing(rule) },
                                onSave: { saveEdit(rule) },
                                onCancel: { cancelEdit() },
                                onDelete: { confirmDelete(rule) }
                            )
                        }
                    } header: {
                        Text("Your Rules (\(rules.count))")
                    } footer: {
                        Text("Rules are synced across all your devices and will be applied whenever you interact with \(agentName).")
                            .font(.caption)
                    }
                } else if !isLoading {
                    Section {
                        VStack(spacing: 12) {
                            Image(systemName: "text.badge.plus")
                                .font(.system(size: 40))
                                .foregroundStyle(.secondary)

                            Text("No rules yet")
                                .font(.headline)

                            Text("Add preferences or instructions to personalize how \(agentName) responds to you.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 20)
                    }
                }

                // Examples section
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Example rules for \(agentName):")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        ForEach(exampleRules, id: \.self) { example in
                            Button {
                                newRuleText = example
                            } label: {
                                HStack(alignment: .top) {
                                    Text("\u{201C}\(example)\u{201D}")
                                        .font(.subheadline)
                                        .foregroundStyle(.primary)
                                        .multilineTextAlignment(.leading)
                                    Spacer()
                                    Image(systemName: "plus.circle")
                                        .foregroundStyle(.blue)
                                }
                            }
                        }
                    }
                } header: {
                    Text("Suggestions")
                }
            }
            .navigationTitle("Rules for \(agentName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .overlay {
                if isLoading {
                    ProgressView()
                        .scaleEffect(1.5)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(.ultraThinMaterial)
                }
            }
            .alert("Delete Rule?", isPresented: $showDeleteConfirmation, presenting: ruleToDelete) { rule in
                Button("Delete", role: .destructive) {
                    deleteRule(rule)
                }
                Button("Cancel", role: .cancel) {}
            } message: { rule in
                Text("This rule will be removed from \(agentName). This action cannot be undone.")
            }
            .task {
                await loadRules()
            }
        }
    }

    private var exampleRules: [String] {
        switch agentId {
        case "health_buddy":
            return [
                "I prefer natural remedies over prescription medications when possible",
                "I have anxiety about medical procedures",
                "Please always explain medical terms in simple language"
            ]
        case "fitness_coach":
            return [
                "I have a bad knee so avoid high-impact exercises",
                "I prefer bodyweight exercises over gym equipment",
                "I'm training for a marathon"
            ]
        case "work_assistant":
            return [
                "I work in a fast-paced startup environment",
                "I prefer bullet points over long paragraphs",
                "English is my second language"
            ]
        case "finance_advisor":
            return [
                "I'm focused on long-term investing, not day trading",
                "I'm risk-averse and prefer stable investments",
                "I'm saving for retirement in 20 years"
            ]
        case "daily_journal":
            return [
                "Help me focus on gratitude and positive experiences",
                "Ask follow-up questions to help me reflect deeper",
                "I journal in the evening before bed"
            ]
        case "study_helper":
            return [
                "I learn best with visual examples and diagrams",
                "Break complex topics into smaller chunks",
                "Quiz me after explaining new concepts"
            ]
        default:
            return [
                "Respond in a casual, friendly tone",
                "Keep responses concise when possible",
                "Ask clarifying questions if unsure"
            ]
        }
    }

    // MARK: - Actions

    private func loadRules() async {
        isLoading = true
        if let agentRules = await rulesService.fetchAgentRules(agentId) {
            rules = agentRules.rules
        }
        isLoading = false
    }

    private func addRule() {
        let content = newRuleText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }

        isLoading = true
        Task {
            if let rule = await rulesService.addRule(agentId: agentId, content: content, agentName: agentName) {
                rules.append(rule)
                newRuleText = ""
            }
            isLoading = false
        }
    }

    private func startEditing(_ rule: AgentRule) {
        editingRule = rule
        editText = rule.content
    }

    private func saveEdit(_ rule: AgentRule) {
        let content = editText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }

        isLoading = true
        Task {
            if await rulesService.updateRule(agentId: agentId, ruleId: rule.id, content: content) {
                if let index = rules.firstIndex(where: { $0.id == rule.id }) {
                    rules[index].content = content
                }
            }
            editingRule = nil
            editText = ""
            isLoading = false
        }
    }

    private func cancelEdit() {
        editingRule = nil
        editText = ""
    }

    private func confirmDelete(_ rule: AgentRule) {
        ruleToDelete = rule
        showDeleteConfirmation = true
    }

    private func deleteRule(_ rule: AgentRule) {
        isLoading = true
        Task {
            if await rulesService.deleteRule(agentId: agentId, ruleId: rule.id) {
                rules.removeAll { $0.id == rule.id }
            }
            isLoading = false
        }
    }
}

// MARK: - Rule Row

struct RuleRow: View {
    let rule: AgentRule
    let isEditing: Bool
    @Binding var editText: String
    let onEdit: () -> Void
    let onSave: () -> Void
    let onCancel: () -> Void
    let onDelete: () -> Void

    var body: some View {
        if isEditing {
            VStack(alignment: .leading, spacing: 8) {
                TextField("Rule", text: $editText, axis: .vertical)
                    .lineLimit(2...4)

                HStack {
                    Button("Cancel", action: onCancel)
                        .foregroundStyle(.secondary)

                    Spacer()

                    Button("Save", action: onSave)
                        .disabled(editText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .font(.subheadline)
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text(rule.content)
                    .font(.body)

                Text(formatDate(rule.createdAt))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .swipeActions(edge: .trailing) {
                Button(role: .destructive, action: onDelete) {
                    Label("Delete", systemImage: "trash")
                }

                Button(action: onEdit) {
                    Label("Edit", systemImage: "pencil")
                }
                .tint(.orange)
            }
            .contextMenu {
                Button(action: onEdit) {
                    Label("Edit", systemImage: "pencil")
                }
                Button(role: .destructive, action: onDelete) {
                    Label("Delete", systemImage: "trash")
                }
            }
        }
    }

    private func formatDate(_ isoString: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: isoString) else { return isoString }

        let displayFormatter = DateFormatter()
        displayFormatter.dateStyle = .medium
        displayFormatter.timeStyle = .short
        return "Added \(displayFormatter.string(from: date))"
    }
}

#Preview {
    AgentRulesView(agentId: "health_buddy", agentName: "Health Buddy", agentEmoji: nil)
        .environmentObject(RulesService.shared)
}
