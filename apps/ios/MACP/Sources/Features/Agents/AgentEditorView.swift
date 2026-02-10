import SwiftUI

/// View for creating or editing an agent
/// Used when adding a new custom agent or editing an existing one
struct AgentEditorView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var memoryService: MemoryService

    let existingAgent: LocalAgent?

    @State private var name: String = ""
    @State private var description: String = ""
    @State private var provider: AgentProvider = .anthropic
    @State private var isDefault: Bool = false
    @State private var isSaving = false
    @State private var showDeleteConfirm = false
    @State private var showProviderWarning = false

    // Introduction questions
    @State private var introductionGreeting: String = ""
    @State private var introductionQuestions: [IntroductionQuestion] = []
    @State private var showAddQuestion = false

    // Voice settings
    @State private var voiceId: String = ElevenLabsService.defaultVoiceId
    @State private var voiceSpeed: Double = ElevenLabsService.defaultSpeed

    // Grounding overrides
    @State private var useCustomBehavior = false
    @State private var wordLimit: Double = 15
    @State private var responseStyle: String = "conversational"
    @State private var formality: String = "professional"
    @State private var memorySharing: String = "balanced"
    @StateObject private var groundingService = GroundingService.shared

    var isEditing: Bool { existingAgent != nil }
    var canSelectProvider: Bool { apiKeyService.hasKey(for: provider) }

    var body: some View {
        NavigationStack {
            Form {
                basicInfoSection
                providerSection
                defaultToggleSection
                voiceSection
                behaviorSection
                introductionSection
                memorySection
                deleteSection
            }
            .navigationTitle(isEditing ? "Edit Agent" : "New Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Save" : "Create") {
                        saveAgent()
                    }
                    .disabled(name.isEmpty || isSaving || !canSelectProvider)
                }
            }
            .onAppear { loadExistingAgent() }
            .sheet(isPresented: $showAddQuestion) {
                AddIntroductionQuestionSheet { question in
                    var newQuestion = question
                    newQuestion.priority = introductionQuestions.count + 1
                    introductionQuestions.append(newQuestion)
                }
            }
            .confirmationDialog("Delete Agent", isPresented: $showDeleteConfirm) {
                Button("Delete", role: .destructive) {
                    if let agent = existingAgent {
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
    }

    // MARK: - Sections

    private var basicInfoSection: some View {
        Section {
            TextField("Name", text: $name)
                .textInputAutocapitalization(.words)

            TextField("Description", text: $description, axis: .vertical)
                .lineLimit(2...4)
        } header: {
            Text("Agent Identity")
        } footer: {
            Text("Give your agent a memorable name and describe its purpose")
        }
    }

    private var providerSection: some View {
        Section {
            ForEach(AgentProvider.allCases, id: \.self) { p in
                ProviderSelectionRow(
                    provider: p,
                    isSelected: provider == p,
                    isAvailable: apiKeyService.hasKey(for: p),
                    onSelect: {
                        if apiKeyService.hasKey(for: p) {
                            provider = p
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
            } else {
                Text("Select which AI service powers this agent")
            }
        }
    }

    private var defaultToggleSection: some View {
        Section {
            Toggle("Default Agent", isOn: $isDefault)
        } footer: {
            Text("The default agent is used when joining new conversations")
        }
    }

    private var voiceSection: some View {
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
            Text("Agent responses will be spoken out loud using the selected voice")
        }
    }

    private var behaviorSection: some View {
        Section {
            Toggle("Custom AI Behavior", isOn: $useCustomBehavior)

            if useCustomBehavior {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Response Length")
                        Spacer()
                        Text("\(Int(wordLimit)) words")
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                    Slider(value: $wordLimit, in: 3...100, step: 5)
                }

                Picker("Response Style", selection: $responseStyle) {
                    Text("Concise").tag("concise")
                    Text("Conversational").tag("conversational")
                    Text("Detailed").tag("detailed")
                }

                Picker("Tone", selection: $formality) {
                    Text("Casual").tag("casual")
                    Text("Professional").tag("professional")
                    Text("Formal").tag("formal")
                }

                Picker("Memory Sharing", selection: $memorySharing) {
                    Text("Conservative").tag("conservative")
                    Text("Balanced").tag("balanced")
                    Text("Proactive").tag("proactive")
                }
            }
        } header: {
            Text("AI Behavior")
        } footer: {
            if useCustomBehavior {
                Text("These settings override your global AI preferences for this agent only")
            } else {
                Text("Enable to customize how this specific agent responds")
            }
        }
    }

    private var introductionSection: some View {
        Section {
            TextField("Introduction greeting", text: $introductionGreeting, axis: .vertical)
                .lineLimit(2...4)

            if !introductionQuestions.isEmpty {
                ForEach(Array(introductionQuestions.enumerated()), id: \.element.id) { index, question in
                    IntroductionQuestionRow(
                        question: question,
                        index: index + 1,
                        onEdit: { },
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
            }

            Button {
                showAddQuestion = true
            } label: {
                Label("Add Question", systemImage: "plus.circle.fill")
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
            Text("Define questions this agent asks when meeting a new user or agent.")
        }
    }

    @ViewBuilder
    private var memorySection: some View {
        if let agent = existingAgent {
            Section {
                NavigationLink {
                    AgentMemoryStoresView(agent: agent)
                        .environmentObject(memoryService)
                } label: {
                    HStack {
                        Label("Memory Stores", systemImage: "brain.head.profile")
                        Spacer()
                        Text("\(agent.memoryStores.count)")
                            .foregroundStyle(.secondary)
                    }
                }

                Button("Clear All Memory", role: .destructive) {
                    Task { await memoryService.clearMemory(for: agent) }
                }
            } header: {
                Text("Agent Memory")
            } footer: {
                Text("Organize memories into separate stores for different topics")
            }
        }
    }

    @ViewBuilder
    private var deleteSection: some View {
        if existingAgent != nil {
            Section {
                Button("Delete Agent", role: .destructive) {
                    showDeleteConfirm = true
                }
            }
        }
    }

    // MARK: - Actions

    private func loadExistingAgent() {
        guard let agent = existingAgent else { return }
        name = agent.name
        description = agent.description
        provider = agent.provider
        isDefault = agent.isDefault
        introductionGreeting = agent.introductionGreeting ?? ""
        introductionQuestions = agent.introductionQuestions
        voiceId = agent.voiceId
        voiceSpeed = agent.voiceSpeed

        // Load grounding overrides
        Task {
            if let overrides = await groundingService.fetchAgentOverrides(agentId: agent.id) {
                useCustomBehavior = overrides.hasOverrides
                if let wl = overrides.wordLimit { wordLimit = Double(wl) }
                if let rs = overrides.responseStyle { responseStyle = rs }
                if let f = overrides.formality { formality = f }
                if let ms = overrides.memorySharing { memorySharing = ms }
            }
        }
    }

    private func saveAgent() {
        isSaving = true

        var agentId: String

        if var agent = existingAgent {
            agent.name = name
            agent.description = description
            agent.provider = provider
            agent.isDefault = isDefault
            agent.introductionGreeting = introductionGreeting.isEmpty ? nil : introductionGreeting
            agent.introductionQuestions = introductionQuestions
            agent.voiceId = voiceId
            agent.voiceSpeed = voiceSpeed
            agentStorage.updateAgent(agent)
            agentId = agent.id
        } else {
            let newAgent = LocalAgent(
                name: name,
                description: description,
                provider: provider,
                isDefault: isDefault,
                introductionGreeting: introductionGreeting.isEmpty ? nil : introductionGreeting,
                introductionQuestions: introductionQuestions,
                voiceId: voiceId,
                voiceSpeed: voiceSpeed
            )
            agentStorage.addAgent(newAgent)
            agentId = newAgent.id
        }

        // Save grounding overrides
        Task {
            if useCustomBehavior {
                let overrides = AgentGroundingOverridesUpdate(
                    wordLimit: Int(wordLimit),
                    responseStyle: responseStyle,
                    formality: formality,
                    memorySharing: memorySharing
                )
                _ = await groundingService.updateAgentOverrides(agentId: agentId, overrides: overrides)
            } else {
                // Remove overrides if custom behavior is disabled
                _ = await groundingService.deleteAgentOverrides(agentId: agentId)
            }

            await SettingsSyncService.shared.syncAgents()
        }

        isSaving = false
        dismiss()
    }

    private func reorderQuestions() {
        for (index, _) in introductionQuestions.enumerated() {
            introductionQuestions[index].priority = index + 1
        }
    }
}

#Preview {
    AgentEditorView(existingAgent: nil)
        .environmentObject(AgentStorageService.shared)
        .environmentObject(APIKeyService.shared)
        .environmentObject(MemoryService.shared)
}
