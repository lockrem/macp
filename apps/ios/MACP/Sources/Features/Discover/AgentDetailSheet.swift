import SwiftUI

/// Detail sheet shown when tapping a marketplace agent
/// Shows agent info and allows adding to user's staff
struct AgentDetailSheet: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService

    let agent: MarketplaceAgent
    var onDismissParent: (() -> Void)? = nil

    @State private var isAdding = false
    @State private var showSuccess = false
    @State private var showDuplicateConfirm = false

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

    var alreadyHasAgent: Bool {
        agentStorage.agents.contains { $0.name == agent.name }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    headerSection
                    descriptionSection
                    capabilitiesSection
                    addButtonSection
                    Spacer(minLength: 40)
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
            .alert("Added to Your Staff", isPresented: $showSuccess) {
                Button("OK") {
                    dismiss()
                    onDismissParent?()
                }
            } message: {
                Text("\(agent.name) is now part of your team and ready to help.")
            }
            .alert("Add Another Copy?", isPresented: $showDuplicateConfirm) {
                Button("Cancel", role: .cancel) {}
                Button("Add Another") {
                    addAgent()
                }
            } message: {
                Text("You already have \(agent.name) on your team. Add another copy with separate memories and settings?")
            }
        }
    }

    // MARK: - Sections

    private var headerSection: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.15))
                    .frame(width: 100, height: 100)
                Text(agent.emoji)
                    .font(.system(size: 50))
            }

            Text(agent.name)
                .font(.title)
                .fontWeight(.bold)

            HStack(spacing: 12) {
                if agent.isMACPOriginal {
                    Label("MACP Original", systemImage: "checkmark.seal.fill")
                        .font(.caption)
                        .fontWeight(.medium)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.yellow.opacity(0.15))
                        .foregroundStyle(.yellow)
                        .clipShape(Capsule())
                }

                if agent.isFree {
                    Text("Free")
                        .font(.caption)
                        .fontWeight(.medium)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.green.opacity(0.15))
                        .foregroundStyle(.green)
                        .clipShape(Capsule())
                }
            }

            HStack(spacing: 8) {
                HStack(spacing: 4) {
                    ForEach(0..<5) { index in
                        Image(systemName: index < Int(agent.rating) ? "star.fill" : "star")
                            .font(.caption)
                            .foregroundStyle(.yellow)
                    }
                }

                Text(String(format: "%.1f", agent.rating))
                    .font(.subheadline)
                    .fontWeight(.semibold)

                Text("(\(agent.reviewCount) reviews)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.top)
    }

    private var descriptionSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("About")
                .font(.headline)
                .fontWeight(.semibold)

            Text(agent.longDescription)
                .font(.body)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemBackground))
        )
    }

    private var capabilitiesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Capabilities")
                .font(.headline)
                .fontWeight(.semibold)

            VStack(alignment: .leading, spacing: 10) {
                ForEach(agent.capabilities, id: \.self) { capability in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.subheadline)
                            .foregroundStyle(accentColor)

                        Text(capability)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color(.systemBackground))
        )
    }

    private var addButtonSection: some View {
        VStack(spacing: 12) {
            if alreadyHasAgent {
                // Show "Added" badge
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                    Text("Already in your staff")
                        .fontWeight(.medium)
                }
                .foregroundStyle(.secondary)
                .padding(.bottom, 8)

                // Still allow adding another copy
                Button {
                    showDuplicateConfirm = true
                } label: {
                    HStack {
                        Image(systemName: "plus.circle")
                        Text("Add Another Copy")
                            .fontWeight(.medium)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color(.systemGray5))
                    .foregroundStyle(accentColor)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }
            } else {
                Button {
                    addAgent()
                } label: {
                    HStack {
                        if isAdding {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "plus.circle.fill")
                        }
                        Text("Add to My Staff")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(accentColor)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                .disabled(isAdding)
            }
        }
    }

    // MARK: - Actions

    private func addAgent() {
        isAdding = true

        let newAgent = LocalAgent(
            name: agent.name,
            description: agent.shortDescription,
            provider: .anthropic,
            emoji: agent.emoji,
            personality: agent.longDescription,
            greeting: "Hi! I'm \(agent.name). \(agent.shortDescription)",
            accentColorName: agent.accentColor,
            isSystemAgent: agent.isMACPOriginal,
            memoryCategories: []
        )

        agentStorage.addAgent(newAgent)

        Task {
            await SettingsSyncService.shared.syncAgents()
        }

        isAdding = false
        showSuccess = true
    }
}
