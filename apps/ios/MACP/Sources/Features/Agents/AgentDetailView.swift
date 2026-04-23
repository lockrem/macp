import SwiftUI
import UIKit

/// Unified detail/settings view for agents
/// All settings on a single page - no second editor layer
struct AgentDetailView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var memoryService: MemoryService
    @EnvironmentObject var rulesService: RulesService
    @EnvironmentObject var introductionService: IntroductionService

    let agentId: String
    let agentName: String
    let agentEmoji: String
    let agentDescription: String
    let isSystemAgent: Bool
    let localAgent: LocalAgent?

    // Editable state
    @State private var editedName: String = ""
    @State private var editedDescription: String = ""
    @State private var editedProvider: AgentProvider = .anthropic
    @State private var isDefault: Bool = false
    @State private var isSaving = false
    @State private var showDeleteConfirm = false
    @State private var showProviderWarning = false

    // Voice settings state
    @State private var voiceId: String = ElevenLabsService.defaultVoiceId
    @State private var voiceSpeed: Double = ElevenLabsService.defaultSpeed

    // Introduction state
    @State private var introductionGreeting: String = ""
    @State private var introductionQuestions: [IntroductionQuestion] = []
    @State private var showAddQuestion = false
    @State private var introStartInfo: IntroductionStartInfo?
    @State private var showIntroductionChat = false
    @State private var isLoadingIntro = false

    // Rules state
    @State private var rules: [AgentRule] = []
    @State private var isLoadingRules = true
    @State private var newRuleText = ""

    // Memory state
    @State private var memoryCategories: [MemoryCategoryMeta] = []
    @State private var isLoadingMemory = true

    // Sharing state
    @State private var isShareable = false
    @State private var allowDirectChat = true
    @State private var allowAgentToAgent = true
    @State private var allowAccompanied = true

    // Tasks state
    @State private var showTaskQueue = false

    var accentColor: Color {
        if let agent = localAgent {
            return colorFromName(agent.accentColorName)
        }
        switch agentId {
        case "health_buddy": return .red
        case "fitness_coach": return .orange
        case "work_assistant": return .blue
        case "finance_advisor", "money_mentor": return .green
        case "daily_journal", "journal_pal": return .purple
        case "study_helper", "study_buddy": return .cyan
        default: return .blue
        }
    }

    var needsIntroduction: Bool {
        if isSystemAgent {
            return introductionService.needsIntroduction(agentId)
        }
        if let agent = localAgent, agent.hasIntroduction {
            return introductionService.needsIntroduction(agentId)
        }
        return false
    }

    var body: some View {
        List {
            introductionPromptSection
            identitySection
            defaultToggleSection
            providerSection
            voiceSection
            introductionQuestionsSection
            sharingSection
            tasksSection
            rulesSection
            memorySection
            deleteSection
        }
        .navigationTitle(isSystemAgent ? agentName : "Agent Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !isSystemAgent {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saveChanges()
                    }
                    .disabled(editedName.isEmpty || isSaving)
                }
            }
        }
        .task {
            loadInitialState()
            await loadRules()
            await loadMemoryCategories()
            await loadIntroductionInfo()
        }
        .sheet(isPresented: $showIntroductionChat) {
            NavigationStack {
                IntroductionChatView(
                    agentId: agentId,
                    agentName: editedName.isEmpty ? agentName : editedName,
                    agentEmoji: agentEmoji,
                    accentColor: accentColor,
                    customAgent: localAgent
                )
                .environmentObject(introductionService)
                .environmentObject(apiKeyService)
            }
        }
        .onChange(of: showIntroductionChat) { _, isShowing in
            if !isShowing {
                Task {
                    await introductionService.fetchStatus()
                    await loadRules()
                    await loadMemoryCategories()
                }
            }
        }
        .sheet(isPresented: $showAddQuestion) {
            AddIntroductionQuestionSheet { question in
                var newQuestion = question
                newQuestion.priority = introductionQuestions.count + 1
                introductionQuestions.append(newQuestion)
            }
        }
        .alert("Delete Agent", isPresented: $showDeleteConfirm) {
            Button("Delete", role: .destructive) {
                if let agent = localAgent {
                    agentStorage.deleteAgent(agent)
                    dismiss()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Are you sure you want to delete this agent? This cannot be undone.")
        }
        .alert("API Key Required", isPresented: $showProviderWarning) {
            Button("OK") {}
        } message: {
            Text("Please configure an API key for this provider in Settings first.")
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private var introductionPromptSection: some View {
        if needsIntroduction {
            Section {
                IntroductionPromptCard(
                    agentName: editedName.isEmpty ? agentName : editedName,
                    agentEmoji: agentEmoji,
                    greeting: introductionGreeting.isEmpty ? introStartInfo?.introductionGreeting : introductionGreeting,
                    totalQuestions: introductionQuestions.isEmpty ? (introStartInfo?.totalQuestions ?? 0) : introductionQuestions.count,
                    accentColor: accentColor,
                    isLoading: isLoadingIntro,
                    onStart: { showIntroductionChat = true },
                    onSkip: {
                        Task {
                            try? await introductionService.skipIntroduction(for: agentId)
                        }
                    }
                )
            }
        }
    }

    @ViewBuilder
    private var identitySection: some View {
        Section {
            HStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(accentColor.opacity(0.15))
                        .frame(width: 64, height: 64)
                    Text(agentEmoji)
                        .font(.system(size: 32))
                }

                VStack(alignment: .leading, spacing: 4) {
                    if isSystemAgent {
                        Text(agentName)
                            .font(.title2)
                            .fontWeight(.semibold)
                        Text("MACP Original")
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(accentColor.opacity(0.15))
                            .foregroundStyle(accentColor)
                            .clipShape(Capsule())
                    } else {
                        TextField("Name", text: $editedName)
                            .font(.title2)
                            .fontWeight(.semibold)
                        Text("Custom Agent")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.vertical, 8)

            if !isSystemAgent {
                TextField("Description", text: $editedDescription, axis: .vertical)
                    .lineLimit(2...4)
            }
        } header: {
            Text("Identity")
        }
    }

    @ViewBuilder
    private var defaultToggleSection: some View {
        if !isSystemAgent {
            Section {
                Toggle("Default Agent", isOn: $isDefault)
            } footer: {
                Text("The default agent is used for new conversations")
            }
        }
    }

    @ViewBuilder
    private var providerSection: some View {
        Section {
            ForEach(AgentProvider.allCases, id: \.self) { provider in
                ProviderRow(
                    provider: provider,
                    isSelected: editedProvider == provider,
                    isAvailable: apiKeyService.hasKey(for: provider),
                    onSelect: {
                        if apiKeyService.hasKey(for: provider) {
                            editedProvider = provider
                        } else {
                            showProviderWarning = true
                        }
                    }
                )
            }
        } header: {
            Text("AI Provider")
        } footer: {
            if !apiKeyService.hasAnyKey {
                Text("Configure API keys in Settings to enable providers")
                    .foregroundStyle(.orange)
            }
        }
    }

    @ViewBuilder
    private var voiceSection: some View {
        if !isSystemAgent {
            Section {
                Picker("Voice", selection: $voiceId) {
                    ForEach(ElevenLabsService.availableVoices, id: \.id) { voice in
                        Text(voice.name).tag(voice.id)
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Speed")
                        Spacer()
                        Text(String(format: "%.2fx", voiceSpeed))
                            .foregroundStyle(.secondary)
                    }
                    Slider(value: $voiceSpeed, in: 0.75...1.25, step: 0.05)
                }
            } header: {
                Text("Voice (Text-to-Speech)")
            } footer: {
                Text("Agent responses will be spoken using the selected voice")
            }
        }
    }

    @ViewBuilder
    private var introductionQuestionsSection: some View {
        Section {
            if !isSystemAgent {
                TextField("Introduction greeting", text: $introductionGreeting, axis: .vertical)
                    .lineLimit(2...4)
            }

            ForEach(Array(introductionQuestions.enumerated()), id: \.element.id) { index, question in
                IntroductionQuestionRow(
                    question: question,
                    index: index + 1,
                    onEdit: {
                        // TODO: Implement inline editing
                    },
                    onDelete: {
                        introductionQuestions.removeAll { $0.id == question.id }
                        reorderQuestions()
                    }
                )
            }
            .onMove { from, to in
                introductionQuestions.move(fromOffsets: from, toOffset: to)
                reorderQuestions()
            }

            if isSystemAgent, let info = introStartInfo {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(info.totalQuestions) questions configured")
                            .font(.subheadline)
                        if let firstQ = info.firstQuestion {
                            Text("\"\(firstQ.question)\"")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                    }
                    Spacer()
                }
            }

            if let status = introductionService.getStatus(for: agentId) {
                HStack {
                    IntroductionStatusBadge(status: status.introductionStatus, accentColor: accentColor)
                    Spacer()
                    if status.factsLearned > 0 || status.rulesLearned > 0 {
                        Text("\(status.factsLearned) facts, \(status.rulesLearned) preferences")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if !isSystemAgent {
                Button {
                    showAddQuestion = true
                } label: {
                    Label("Add Question", systemImage: "plus.circle.fill")
                }
            }
        } header: {
            HStack {
                Text("Introduction Questions")
                Spacer()
                if !introductionQuestions.isEmpty {
                    Text("\(introductionQuestions.count)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        } footer: {
            Text("Questions asked when this agent first meets someone")
        }
    }

    @ViewBuilder
    private var sharingSection: some View {
        Section {
            Toggle("Enable Sharing", isOn: $isShareable)

            if isShareable {
                SharingDetailsView(
                    agentId: agentId,
                    allowDirectChat: $allowDirectChat,
                    allowAgentToAgent: $allowAgentToAgent,
                    allowAccompanied: $allowAccompanied
                )
            }
        } header: {
            Text("Sharing")
        } footer: {
            if isShareable {
                Text("Anyone with the link can interact with this agent")
            } else {
                Text("Enable sharing to get a QR code and link")
            }
        }
    }

    @ViewBuilder
    private var tasksSection: some View {
        if let agent = localAgent {
            Section {
                Button {
                    showTaskQueue = true
                } label: {
                    HStack {
                        Label("Task Queue", systemImage: "checklist")
                        Spacer()
                        if !agent.pendingTasks.isEmpty {
                            Text("\(agent.pendingTasks.count) pending")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
                .foregroundStyle(.primary)
            } header: {
                Text("Tasks")
            } footer: {
                Text("Assign tasks like \"Make reservations for 4 at 5:30 PM\" and your agent will look for opportunities to complete them")
            }
            .sheet(isPresented: $showTaskQueue) {
                TaskQueueView(agent: agent)
            }
        }
    }

    @ViewBuilder
    private var rulesSection: some View {
        Section {
            if isLoadingRules {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
            } else if rules.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("No rules yet")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("Rules guide how this agent responds.")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .padding(.vertical, 4)
            } else {
                ForEach(rules) { rule in
                    RuleRowView(rule: rule)
                }
                .onDelete(perform: deleteRules)
            }

            HStack {
                TextField("Add a rule...", text: $newRuleText, axis: .vertical)
                    .lineLimit(1...3)

                Button {
                    addRule()
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .foregroundStyle(accentColor)
                }
                .disabled(newRuleText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        } header: {
            HStack {
                Text("Rules")
                Spacer()
                if !rules.isEmpty {
                    Text("\(rules.count)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        } footer: {
            Text("Example: \"I prefer natural remedies\"")
        }
    }

    @ViewBuilder
    private var memorySection: some View {
        Section {
            if isLoadingMemory {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
            } else if memoryCategories.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("No memories yet")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text("Memories are facts learned from conversations.")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .padding(.vertical, 4)
            } else {
                ForEach(memoryCategories) { category in
                    NavigationLink {
                        MemoryCategoryDetailView(category: category)
                            .environmentObject(memoryService)
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(category.displayName)
                                    .font(.subheadline)
                                Text("\(category.factCount) facts")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                    }
                }
            }
        } header: {
            HStack {
                Text("Memory")
                Spacer()
                if !memoryCategories.isEmpty {
                    Text("\(memoryCategories.reduce(0) { $0 + $1.factCount }) facts")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        } footer: {
            Text("Memories are automatically learned and stored securely")
        }
    }

    @ViewBuilder
    private var deleteSection: some View {
        if !isSystemAgent && localAgent != nil {
            Section {
                Button("Delete Agent", role: .destructive) {
                    showDeleteConfirm = true
                }
            }
        }
    }

    // MARK: - Helpers

    private func colorFromName(_ name: String) -> Color {
        switch name {
        case "red": return .red
        case "orange": return .orange
        case "green": return .green
        case "purple": return .purple
        case "cyan": return .cyan
        case "pink": return .pink
        default: return .blue
        }
    }

    private func loadInitialState() {
        guard let agent = localAgent else {
            editedName = agentName
            editedDescription = agentDescription
            return
        }

        editedName = agent.name
        editedDescription = agent.description
        editedProvider = agent.provider
        isDefault = agent.isDefault
        voiceId = agent.voiceId
        voiceSpeed = agent.voiceSpeed
        introductionGreeting = agent.introductionGreeting ?? ""
        introductionQuestions = agent.introductionQuestions
        isShareable = agent.isShareable
        allowDirectChat = agent.allowDirectChat
        allowAgentToAgent = agent.allowAgentToAgent
        allowAccompanied = agent.allowAccompanied
    }

    private func reorderQuestions() {
        for (index, _) in introductionQuestions.enumerated() {
            introductionQuestions[index].priority = index + 1
        }
    }

    private func loadRules() async {
        isLoadingRules = true
        if let agentRules = await rulesService.fetchAgentRules(agentId) {
            rules = agentRules.rules
        }
        isLoadingRules = false
    }

    private func loadMemoryCategories() async {
        isLoadingMemory = true
        await memoryService.fetchIndex()
        memoryCategories = memoryService.memoryIndex?.categories ?? []
        isLoadingMemory = false
    }

    private func loadIntroductionInfo() async {
        if localAgent != nil {
            isLoadingIntro = false
            return
        }

        guard isSystemAgent else { return }

        isLoadingIntro = true
        do {
            introStartInfo = try await introductionService.getStartInfo(for: agentId)
        } catch {
            #if DEBUG
            print("[AgentDetail] Could not load introduction info")
            #endif
        }
        isLoadingIntro = false
    }

    private func addRule() {
        let content = newRuleText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }

        Task {
            if let rule = await rulesService.addRule(agentId: agentId, content: content, agentName: editedName) {
                rules.append(rule)
                newRuleText = ""
            }
        }
    }

    private func deleteRules(at offsets: IndexSet) {
        for index in offsets {
            let rule = rules[index]
            Task {
                if await rulesService.deleteRule(agentId: agentId, ruleId: rule.id) {
                    rules.remove(at: index)
                }
            }
        }
    }

    private func saveChanges() {
        guard var agent = localAgent else { return }
        isSaving = true

        agent.name = editedName
        agent.description = editedDescription
        agent.provider = editedProvider
        agent.isDefault = isDefault
        agent.voiceId = voiceId
        agent.voiceSpeed = voiceSpeed
        agent.introductionGreeting = introductionGreeting.isEmpty ? nil : introductionGreeting
        agent.introductionQuestions = introductionQuestions
        agent.isShareable = isShareable
        agent.allowDirectChat = allowDirectChat
        agent.allowAgentToAgent = allowAgentToAgent
        agent.allowAccompanied = allowAccompanied

        agentStorage.updateAgent(agent)

        Task {
            await SettingsSyncService.shared.syncAgents()
            isSaving = false
            dismiss()
        }
    }
}

// MARK: - Sharing Details View

struct SharingDetailsView: View {
    let agentId: String
    @Binding var allowDirectChat: Bool
    @Binding var allowAgentToAgent: Bool
    @Binding var allowAccompanied: Bool

    var shareURL: String {
        "macp://agent/\(agentId)"
    }

    var body: some View {
        HStack(spacing: 16) {
            QRCodeView(content: shareURL, size: 100)
                .clipShape(RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 8) {
                Text("Scan to interact")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Text(shareURL)
                    .font(.system(.caption2, design: .monospaced))
                    .lineLimit(1)
                    .truncationMode(.middle)

                HStack(spacing: 8) {
                    Button {
                        UIPasteboard.general.string = shareURL
                    } label: {
                        Label("Copy", systemImage: "doc.on.doc")
                            .font(.caption)
                    }
                    .buttonStyle(.bordered)

                    Button {
                        let activityVC = UIActivityViewController(
                            activityItems: [shareURL],
                            applicationActivities: nil
                        )
                        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                           let rootVC = windowScene.windows.first?.rootViewController {
                            rootVC.present(activityVC, animated: true)
                        }
                    } label: {
                        Label("Share", systemImage: "square.and.arrow.up")
                            .font(.caption)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .padding(.vertical, 8)

        Toggle("Allow Direct Chat", isOn: $allowDirectChat)
        Toggle("Allow Agent-to-Agent", isOn: $allowAgentToAgent)
        Toggle("Allow Accompanied", isOn: $allowAccompanied)
    }
}

// IntroductionQuestionRow is defined in AgentEditorView.swift
