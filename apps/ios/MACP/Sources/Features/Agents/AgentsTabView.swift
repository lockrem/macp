import SwiftUI

/// Simplified Agents tab - single list view with inline actions
struct AgentsTabView: View {
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var rulesService: RulesService
    @EnvironmentObject var memoryService: MemoryService
    @EnvironmentObject var introductionService: IntroductionService
    @StateObject private var formService = FormService.shared

    @State private var showCreateAgent = false
    @State private var showTaskQueue = false
    @State private var selectedAgentForEdit: LocalAgent?
    @State private var selectedAgentForShare: LocalAgent?
    @State private var showCreateForm = false
    @State private var selectedForm: SmartForm?

    /// Total pending tasks across all agents
    private var totalPendingTasks: Int {
        agentStorage.agents.reduce(0) { $0 + $1.pendingTasks.count }
    }

    var body: some View {
        NavigationStack {
            List {
                if agentStorage.agents.isEmpty {
                    emptyStateSection
                } else {
                    agentsSection
                }

                // Form Agents section
                formAgentsSection
            }
            .navigationTitle("Agents")
            .toolbar {
                // Left: Task Queue
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        showTaskQueue = true
                    } label: {
                        Image(systemName: "checklist")
                            .font(.title3)
                    }
                }

                // Right: Add agent
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showCreateAgent = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showTaskQueue) {
                AllTasksQueueView()
                    .environmentObject(agentStorage)
            }
            .sheet(isPresented: $showCreateAgent) {
                AddAgentView()
                    .environmentObject(agentStorage)
                    .environmentObject(apiKeyService)
                    .environmentObject(memoryService)
            }
            .sheet(item: $selectedAgentForEdit) { agent in
                AgentEditSheet(agent: agent)
                    .environmentObject(agentStorage)
                    .environmentObject(apiKeyService)
            }
            .sheet(item: $selectedAgentForShare) { agent in
                AgentQRSheet(agent: agent)
            }
            .sheet(isPresented: $showCreateForm) {
                CreateFormSheet()
                    .environmentObject(formService)
            }
            .sheet(item: $selectedForm) { form in
                FormEditorView(form: form)
                    .environmentObject(formService)
            }
            .task {
                await rulesService.fetchIndex()
                await introductionService.fetchStatus()
                await formService.fetchForms()
            }
        }
    }

    // MARK: - Empty State

    private var emptyStateSection: some View {
        Section {
            VStack(spacing: 16) {
                Image(systemName: "person.2.circle")
                    .font(.system(size: 50))
                    .foregroundStyle(.secondary)

                Text("No Agents Yet")
                    .font(.headline)

                Text("Create your first agent to start chatting")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button {
                    showCreateAgent = true
                } label: {
                    Label("Create Agent", systemImage: "plus")
                        .font(.headline)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(Color.orange)
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                }
                .padding(.top, 8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 40)
        }
    }

    // MARK: - Agents Section

    private var agentsSection: some View {
        Section {
            ForEach(agentStorage.agents) { agent in
                AgentCompactRow(
                    agent: agent,
                    needsIntroduction: introductionService.needsIntroduction(agent.id.uuidString),
                    onTap: {
                        selectedAgentForEdit = agent
                    },
                    onShare: {
                        selectedAgentForShare = agent
                    }
                )
            }
            .onDelete(perform: deleteAgents)
        } header: {
            Text("Your Agents")
        }
    }

    private func deleteAgents(at offsets: IndexSet) {
        for index in offsets {
            agentStorage.deleteAgent(agentStorage.agents[index])
        }
    }

    // MARK: - Form Agents Section

    private var formAgentsSection: some View {
        Section {
            if formService.forms.isEmpty {
                Button {
                    showCreateForm = true
                } label: {
                    HStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(Color.purple.opacity(0.15))
                                .frame(width: 44, height: 44)
                            Image(systemName: "doc.text.fill")
                                .font(.system(size: 18))
                                .foregroundColor(.purple)
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Create Form Agent")
                                .font(.headline)
                                .foregroundColor(.primary)
                            Text("Build forms that auto-fill from customer profiles")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        Spacer()

                        Image(systemName: "plus.circle.fill")
                            .font(.title2)
                            .foregroundColor(.purple)
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
            } else {
                ForEach(formService.forms) { form in
                    FormAgentRow(form: form) {
                        selectedForm = form
                    }
                }
                .onDelete(perform: deleteForms)

                Button {
                    showCreateForm = true
                } label: {
                    Label("Add Form Agent", systemImage: "plus.circle")
                }
            }
        } header: {
            Text("Form Agents")
        } footer: {
            Text("Form Agents collect information from customers with AI-assisted auto-fill.")
        }
    }

    private func deleteForms(at offsets: IndexSet) {
        for index in offsets {
            let form = formService.forms[index]
            Task {
                try? await formService.deleteForm(form.id)
            }
        }
    }
}

// MARK: - Form Agent Row

struct FormAgentRow: View {
    let form: SmartForm
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Icon
                ZStack {
                    Circle()
                        .fill(Color.purple.opacity(0.15))
                        .frame(width: 44, height: 44)
                    Image(systemName: "doc.text.fill")
                        .font(.system(size: 18))
                        .foregroundColor(.purple)
                }

                // Info
                VStack(alignment: .leading, spacing: 2) {
                    Text(form.title)
                        .font(.headline)
                        .foregroundColor(.primary)

                    if let description = form.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    // Stats
                    HStack(spacing: 12) {
                        Label("\(form.fieldCount ?? form.fields?.count ?? 0) fields", systemImage: "list.bullet")
                        Label("\(form.submissionCount ?? 0) responses", systemImage: "tray.full")
                    }
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Compact Agent Row

struct AgentCompactRow: View {
    let agent: LocalAgent
    let needsIntroduction: Bool
    let onTap: () -> Void
    let onShare: () -> Void

    var accentColor: Color {
        switch agent.accentColorName {
        case "red": return .red
        case "orange": return .orange
        case "green": return .green
        case "purple": return .purple
        case "cyan": return .cyan
        case "pink": return .pink
        default: return .blue
        }
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Avatar
                ZStack {
                    Circle()
                        .fill(accentColor.opacity(0.15))
                        .frame(width: 44, height: 44)
                    Text(agent.emoji)
                        .font(.system(size: 22))

                    if needsIntroduction {
                        Circle()
                            .fill(.orange)
                            .frame(width: 12, height: 12)
                            .overlay(
                                Image(systemName: "hand.wave.fill")
                                    .font(.system(size: 6))
                                    .foregroundStyle(.white)
                            )
                            .offset(x: 14, y: -14)
                    }
                }

                // Info
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(agent.name)
                            .font(.headline)
                            .foregroundStyle(.primary)

                        if needsIntroduction {
                            Text("New")
                                .font(.caption2)
                                .fontWeight(.medium)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(.orange.opacity(0.15))
                                .foregroundStyle(.orange)
                                .clipShape(Capsule())
                        }
                    }

                    Text(agent.personality)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    // Provider badge
                    Text(agent.provider.displayName)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                Spacer()

                // QR code button
                Button(action: onShare) {
                    Image(systemName: "qrcode")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .padding(8)
                        .background(Color(UIColor.secondarySystemBackground))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Agent Edit Sheet

struct AgentEditSheet: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService

    let agent: LocalAgent

    @State private var name: String = ""
    @State private var emoji: String = ""
    @State private var personality: String = ""
    @State private var greeting: String = ""
    @State private var accentColorName: String = ""
    @State private var isShareable: Bool = false
    @State private var voiceId: String = ""
    @State private var voiceSpeed: Double = 1.0

    let emojis = ["🤖", "🏥", "💪", "💼", "💰", "📔", "📚", "🎯", "🧘", "🎨", "🍎", "✈️", "🏠", "👨‍👩‍👧", "🐕"]
    let colors = ["blue", "red", "orange", "green", "purple", "cyan", "pink"]

    // ElevenLabs voice options
    let voices: [(id: String, name: String)] = [
        ("21m00Tcm4TlvDq8ikWAM", "Rachel (Female)"),
        ("AZnzlk1XvdvUeBnXmlld", "Domi (Female)"),
        ("EXAVITQu4vr4xnSDxMaL", "Bella (Female)"),
        ("ErXwobaYiN019PkySvjV", "Antoni (Male)"),
        ("MF3mGyEYCl7XYWbV9V6O", "Elli (Female)"),
        ("TxGEqnHWrfWFTfGW9XjX", "Josh (Male)"),
        ("VR6AewLTigWG4xSOukaG", "Arnold (Male)"),
        ("pNInz6obpgDQGcFmaJgB", "Adam (Male)"),
        ("yoZ06aMxZJJ28mfd3POQ", "Sam (Male)"),
    ]

    var body: some View {
        NavigationStack {
            Form {
                // Identity
                Section {
                    HStack {
                        Menu {
                            ForEach(emojis, id: \.self) { e in
                                Button(e) { emoji = e }
                            }
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(selectedColor.opacity(0.15))
                                    .frame(width: 50, height: 50)
                                Text(emoji)
                                    .font(.system(size: 26))
                            }
                        }

                        TextField("Name", text: $name)
                            .font(.headline)
                    }
                } header: {
                    Text("Identity")
                }

                // Color
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(colors, id: \.self) { colorName in
                                Button {
                                    accentColorName = colorName
                                } label: {
                                    Circle()
                                        .fill(colorFor(colorName))
                                        .frame(width: 36, height: 36)
                                        .overlay(
                                            Circle()
                                                .stroke(Color.primary, lineWidth: accentColorName == colorName ? 2 : 0)
                                                .padding(2)
                                        )
                                }
                            }
                        }
                    }
                } header: {
                    Text("Color")
                }

                // Personality
                Section {
                    TextField("Personality", text: $personality, axis: .vertical)
                        .lineLimit(2...4)
                } header: {
                    Text("Personality")
                }

                // Greeting
                Section {
                    TextField("Greeting", text: $greeting)
                } header: {
                    Text("Greeting Message")
                }

                // Voice Settings
                Section {
                    Picker("Voice", selection: $voiceId) {
                        ForEach(voices, id: \.id) { voice in
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
                    Text("Voice")
                } footer: {
                    Text("Voice settings for text-to-speech responses")
                }

                // Sharing
                Section {
                    Toggle("Allow Sharing", isOn: $isShareable)
                } header: {
                    Text("Sharing")
                } footer: {
                    Text("When enabled, others can interact with this agent via QR code")
                }
            }
            .navigationTitle("Edit Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saveChanges()
                    }
                    .disabled(name.isEmpty)
                }
            }
            .onAppear {
                loadAgentData()
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var selectedColor: Color {
        colorFor(accentColorName)
    }

    private func colorFor(_ name: String) -> Color {
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

    private func loadAgentData() {
        name = agent.name
        emoji = agent.emoji
        personality = agent.personality
        greeting = agent.greeting
        accentColorName = agent.accentColorName
        isShareable = agent.isShareable
        voiceId = agent.voiceId
        voiceSpeed = agent.voiceSpeed
    }

    private func saveChanges() {
        var updated = agent
        updated.name = name
        updated.emoji = emoji
        updated.personality = personality
        updated.greeting = greeting
        updated.accentColorName = accentColorName
        updated.isShareable = isShareable
        updated.voiceId = voiceId
        updated.voiceSpeed = voiceSpeed
        agentStorage.updateAgent(updated)
        dismiss()
    }
}

// MARK: - Agent Share Sheet

struct AgentQRSheet: View {
    @Environment(\.dismiss) var dismiss
    let agent: LocalAgent

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                // Agent info
                VStack(spacing: 8) {
                    Text(agent.emoji)
                        .font(.system(size: 60))

                    Text(agent.name)
                        .font(.title2)
                        .fontWeight(.semibold)
                }
                .padding(.top, 20)

                // QR Code
                if agent.isShareable, let url = agent.shareURL {
                    QRCodeView(content: url.absoluteString, size: 200)
                        .padding()
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .shadow(color: .black.opacity(0.1), radius: 10)

                    Text("Scan to connect")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "qrcode")
                            .font(.system(size: 60))
                            .foregroundStyle(.secondary)

                        Text("Sharing Disabled")
                            .font(.headline)

                        Text("Enable sharing in agent settings to generate a QR code")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                    .padding(.vertical, 40)
                }

                Spacer()
            }
            .navigationTitle("Share Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Preview

#Preview {
    AgentsTabView()
        .environmentObject(AgentStorageService.shared)
        .environmentObject(APIKeyService.shared)
        .environmentObject(RulesService.shared)
        .environmentObject(MemoryService.shared)
        .environmentObject(IntroductionService.shared)
}
