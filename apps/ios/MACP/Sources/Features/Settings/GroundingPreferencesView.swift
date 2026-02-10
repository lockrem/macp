import SwiftUI

struct GroundingPreferencesView: View {
    @StateObject private var service = GroundingService.shared
    @Environment(\.dismiss) private var dismiss

    @State private var selectedPreset: String = "balanced"
    @State private var agentWordLimit: Double = 15
    @State private var hostWordLimit: Double = 20
    @State private var participationStyle: String = "balanced"
    @State private var responseStyle: String = "conversational"
    @State private var formality: String = "professional"
    @State private var memorySharing: String = "balanced"
    @State private var hasChanges = false
    @State private var isSaving = false
    @State private var showResetConfirm = false

    private var minWords: Double { Double(service.guardrails?.minResponseWords ?? 3) }
    private var maxWords: Double { Double(service.guardrails?.maxResponseWords ?? 100) }

    var body: some View {
        Form {
            // Preset Selection
            Section {
                ForEach(service.presets) { preset in
                    PresetRow(
                        preset: preset,
                        isSelected: selectedPreset == preset.id,
                        onSelect: {
                            selectedPreset = preset.id
                            applyPresetSettings(preset)
                            hasChanges = true
                        }
                    )
                }
            } header: {
                Text("Preset")
            } footer: {
                Text("Choose a preset or customize individual settings below")
            }

            // Word Limits
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Agent Response Length")
                        Spacer()
                        Text("\(Int(agentWordLimit)) words")
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                    Slider(value: $agentWordLimit, in: minWords...maxWords, step: 5) { _ in
                        selectedPreset = "custom"
                        hasChanges = true
                    }
                    Text("How verbose your agents are when speaking")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Host Response Length")
                        Spacer()
                        Text("\(Int(hostWordLimit)) words")
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                    Slider(value: $hostWordLimit, in: minWords...maxWords, step: 5) { _ in
                        selectedPreset = "custom"
                        hasChanges = true
                    }
                    Text("How verbose the host agent is in conversations")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } header: {
                Text("Response Length")
            }

            // Participation Style
            Section {
                Picker("Participation", selection: $participationStyle) {
                    Text("Minimal").tag("minimal")
                    Text("Balanced").tag("balanced")
                    Text("Active").tag("active")
                }
                .pickerStyle(.segmented)
                .onChange(of: participationStyle) { _, _ in
                    selectedPreset = "custom"
                    hasChanges = true
                }
            } header: {
                Text("Agent Participation")
            } footer: {
                participationDescription
            }

            // Response Style
            Section {
                Picker("Style", selection: $responseStyle) {
                    Text("Concise").tag("concise")
                    Text("Conversational").tag("conversational")
                    Text("Detailed").tag("detailed")
                }
                .pickerStyle(.segmented)
                .onChange(of: responseStyle) { _, _ in
                    selectedPreset = "custom"
                    hasChanges = true
                }
            } header: {
                Text("Response Style")
            } footer: {
                responseStyleDescription
            }

            // Formality
            Section {
                Picker("Formality", selection: $formality) {
                    Text("Casual").tag("casual")
                    Text("Professional").tag("professional")
                    Text("Formal").tag("formal")
                }
                .pickerStyle(.segmented)
                .onChange(of: formality) { _, _ in
                    selectedPreset = "custom"
                    hasChanges = true
                }
            } header: {
                Text("Tone")
            } footer: {
                formalityDescription
            }

            // Memory Sharing
            Section {
                Picker("Memory Sharing", selection: $memorySharing) {
                    Text("Conservative").tag("conservative")
                    Text("Balanced").tag("balanced")
                    Text("Proactive").tag("proactive")
                }
                .pickerStyle(.segmented)
                .onChange(of: memorySharing) { _, _ in
                    selectedPreset = "custom"
                    hasChanges = true
                }
            } header: {
                Text("Memory Sharing")
            } footer: {
                memorySharingDescription
            }

            // Reset
            Section {
                Button("Reset to Defaults", role: .destructive) {
                    showResetConfirm = true
                }
            }
        }
        .navigationTitle("AI Behavior")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if hasChanges {
                    Button("Save") {
                        Task { await saveChanges() }
                    }
                    .disabled(isSaving)
                }
            }
        }
        .task {
            await loadData()
        }
        .confirmationDialog("Reset Preferences", isPresented: $showResetConfirm) {
            Button("Reset to Defaults", role: .destructive) {
                Task { await resetToDefaults() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will reset all AI behavior settings to their default values.")
        }
        .overlay {
            if service.isLoading {
                ProgressView()
                    .scaleEffect(1.5)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.ultraThinMaterial)
            }
        }
    }

    // MARK: - Description Views

    @ViewBuilder
    private var participationDescription: some View {
        switch participationStyle {
        case "minimal":
            Text("Agents speak only when directly relevant")
        case "active":
            Text("Agents engage proactively and offer suggestions")
        default:
            Text("Agents participate when they have helpful information")
        }
    }

    @ViewBuilder
    private var responseStyleDescription: some View {
        switch responseStyle {
        case "concise":
            Text("Brief, to-the-point responses")
        case "detailed":
            Text("Thorough explanations with context")
        default:
            Text("Natural, conversational dialogue")
        }
    }

    @ViewBuilder
    private var formalityDescription: some View {
        switch formality {
        case "casual":
            Text("Informal, friendly language")
        case "formal":
            Text("Very formal, polished language")
        default:
            Text("Business-appropriate, professional tone")
        }
    }

    @ViewBuilder
    private var memorySharingDescription: some View {
        switch memorySharing {
        case "conservative":
            Text("Only share memories when directly asked")
        case "proactive":
            Text("Actively share helpful context from memory")
        default:
            Text("Share memories when appropriately relevant")
        }
    }

    // MARK: - Actions

    private func loadData() async {
        await service.fetchPresets()
        await service.fetchPreferences()

        if let prefs = service.preferences {
            selectedPreset = prefs.preset
            agentWordLimit = Double(prefs.agentResponseWords)
            hostWordLimit = Double(prefs.hostResponseWords)
            participationStyle = prefs.participationStyle
            responseStyle = prefs.responseStyle
            formality = prefs.formality
            memorySharing = prefs.memorySharing
        }
    }

    private func applyPresetSettings(_ preset: GroundingPreset) {
        agentWordLimit = Double(preset.settings.agentResponseWords)
        hostWordLimit = Double(preset.settings.hostResponseWords)
        participationStyle = preset.settings.participationStyle
        responseStyle = preset.settings.responseStyle
        formality = preset.settings.formality
        memorySharing = preset.settings.memorySharing
    }

    private func saveChanges() async {
        isSaving = true
        defer { isSaving = false }

        let update = GroundingPreferencesUpdate(
            preset: selectedPreset,
            agentResponseWords: Int(agentWordLimit),
            hostResponseWords: Int(hostWordLimit),
            participationStyle: participationStyle,
            responseStyle: responseStyle,
            formality: formality,
            memorySharing: memorySharing
        )

        let success = await service.updatePreferences(update)
        if success {
            hasChanges = false
        }
    }

    private func resetToDefaults() async {
        let success = await service.resetToDefaults()
        if success {
            if let prefs = service.preferences {
                selectedPreset = prefs.preset
                agentWordLimit = Double(prefs.agentResponseWords)
                hostWordLimit = Double(prefs.hostResponseWords)
                participationStyle = prefs.participationStyle
                responseStyle = prefs.responseStyle
                formality = prefs.formality
                memorySharing = prefs.memorySharing
            }
            hasChanges = false
        }
    }
}

// MARK: - Preset Row

struct PresetRow: View {
    let preset: GroundingPreset
    let isSelected: Bool
    let onSelect: () -> Void

    var presetIcon: String {
        switch preset.id {
        case "efficient": return "bolt.fill"
        case "balanced": return "scale.3d"
        case "conversational": return "bubble.left.and.bubble.right.fill"
        case "custom": return "slider.horizontal.3"
        default: return "circle.fill"
        }
    }

    var presetColor: Color {
        switch preset.id {
        case "efficient": return .orange
        case "balanced": return .blue
        case "conversational": return .purple
        case "custom": return .gray
        default: return .secondary
        }
    }

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 12) {
                Image(systemName: presetIcon)
                    .font(.title3)
                    .foregroundStyle(presetColor)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 2) {
                    Text(preset.name)
                        .font(.body.weight(.medium))
                        .foregroundStyle(.primary)

                    Text(preset.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.blue)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    NavigationStack {
        GroundingPreferencesView()
    }
}
