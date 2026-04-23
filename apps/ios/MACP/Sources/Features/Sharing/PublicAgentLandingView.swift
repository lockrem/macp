import SwiftUI

/// Landing page for a public agent accessed via deep link
struct PublicAgentLandingView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var publicAgentService: PublicAgentService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var authService: AuthService

    let agentId: String

    @State private var agent: PublishedAgent?
    @State private var isLoading = true
    @State private var error: String?

    // Navigation state
    @State private var showChatView = false
    @State private var selectedMode: PublicAgentInteractionMode?
    @State private var selectedUserAgent: LocalAgent?
    @State private var createdSession: PublicAgentSession?

    @State private var showAgentPicker = false
    @State private var showSignInPrompt = false

    // Autonomous conversation state
    @State private var showAutonomousSheet = false
    @State private var autonomousContext = ""
    @State private var isAutonomousMode = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    LoadingView()
                } else if let error = error {
                    ErrorView(error: error, onRetry: loadAgent)
                } else if let agent = agent {
                    AgentLandingContent(
                        agent: agent,
                        onModeSelected: handleModeSelection
                    )
                } else {
                    ErrorView(error: "Agent not found", onRetry: loadAgent)
                }
            }
            .navigationTitle(agent?.name ?? "Public Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
            .task {
                await loadAgent()
            }
            .sheet(isPresented: $showAgentPicker) {
                AgentPickerSheet(
                    agents: agentStorage.agents,
                    onSelect: { agent in
                        selectedUserAgent = agent
                        showAgentPicker = false

                        // For agent-to-agent mode, show autonomous context sheet
                        if selectedMode == .agentToAgent {
                            showAutonomousSheet = true
                        } else {
                            startSession()
                        }
                    }
                )
            }
            .sheet(isPresented: $showChatView) {
                if let session = createdSession, let agent = agent {
                    PublicAgentChatView(
                        session: session,
                        agent: agent,
                        mode: selectedMode ?? .direct,
                        visitorAgent: selectedUserAgent
                    )
                    .environmentObject(publicAgentService)
                    .environmentObject(apiKeyService)
                }
            }
            .alert("Sign In Required", isPresented: $showSignInPrompt) {
                Button("Cancel", role: .cancel) {}
                Button("Sign In") {
                    // Handle sign in - this will depend on your auth flow
                }
            } message: {
                Text("Please sign in to use agent-to-agent or accompanied modes.")
            }
            .sheet(isPresented: $showAutonomousSheet) {
                if let agent = agent, let visitorAgent = selectedUserAgent {
                    AutonomousContextSheet(
                        hostAgent: agent,
                        visitorAgent: visitorAgent,
                        context: $autonomousContext,
                        onStart: {
                            showAutonomousSheet = false
                            isAutonomousMode = true
                        },
                        onCancel: {
                            showAutonomousSheet = false
                            autonomousContext = ""
                        }
                    )
                }
            }
            .fullScreenCover(isPresented: $isAutonomousMode) {
                if let agent = agent, let visitorAgent = selectedUserAgent {
                    AutonomousAgentChatView(
                        hostAgent: agent,
                        visitorAgent: visitorAgent,
                        visitorContext: autonomousContext.isEmpty ? nil : autonomousContext
                    )
                    .environmentObject(publicAgentService)
                    .environmentObject(apiKeyService)
                }
            }
        }
    }

    private func loadAgent() async {
        isLoading = true
        error = nil

        do {
            agent = try await publicAgentService.fetchPublicAgent(agentId: agentId)
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    private func handleModeSelection(_ mode: PublicAgentInteractionMode) {
        selectedMode = mode

        switch mode {
        case .direct:
            // Direct chat - no agent needed
            startSession()

        case .agentToAgent:
            // Agent-to-agent mode - show autonomous conversation flow
            if !authService.isAuthenticated {
                showSignInPrompt = true
                return
            }

            if agentStorage.agents.isEmpty {
                error = "Please create an agent first to use this mode."
                return
            }

            // Select agent then show autonomous context sheet
            if agentStorage.agents.count == 1 {
                selectedUserAgent = agentStorage.agents.first
                showAutonomousSheet = true
            } else {
                showAgentPicker = true
            }

        case .accompanied:
            // Accompanied mode - regular session
            if !authService.isAuthenticated {
                showSignInPrompt = true
                return
            }

            if agentStorage.agents.isEmpty {
                error = "Please create an agent first to use this mode."
                return
            }

            if agentStorage.agents.count == 1 {
                selectedUserAgent = agentStorage.agents.first
                startSession()
            } else {
                showAgentPicker = true
            }
        }
    }

    private func startSession() {
        guard let mode = selectedMode else { return }

        Task {
            do {
                let session = try await publicAgentService.createSession(
                    agentId: agentId,
                    mode: mode,
                    visitorAgent: selectedUserAgent
                )
                createdSession = session
                showChatView = true
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

// MARK: - Loading View

private struct LoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Loading agent...")
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Error View

private struct ErrorView: View {
    let error: String
    let onRetry: () async -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(.orange)

            Text(error)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)

            Button("Try Again") {
                Task { await onRetry() }
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }
}

// MARK: - Agent Landing Content

private struct AgentLandingContent: View {
    let agent: PublishedAgent
    let onModeSelected: (PublicAgentInteractionMode) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Agent Card
                PublicAgentInfoCard(agent: agent)

                // Interaction Mode Buttons
                VStack(spacing: 12) {
                    Text("How would you like to interact?")
                        .font(.headline)

                    if agent.allowDirectChat {
                        ModeButton(
                            mode: .direct,
                            accentColor: agent.accentColorValue,
                            onTap: { onModeSelected(.direct) }
                        )
                    }

                    if agent.allowAgentToAgent {
                        ModeButton(
                            mode: .agentToAgent,
                            accentColor: agent.accentColorValue,
                            onTap: { onModeSelected(.agentToAgent) }
                        )
                    }

                    if agent.allowAccompaniedChat {
                        ModeButton(
                            mode: .accompanied,
                            accentColor: agent.accentColorValue,
                            onTap: { onModeSelected(.accompanied) }
                        )
                    }
                }
                .padding(.horizontal)

                // Owner info
                if let ownerName = agent.ownerName {
                    Text("Published by \(ownerName)")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }

                // View count
                HStack {
                    Image(systemName: "eye")
                    Text("\(agent.viewCount) views")
                }
                .font(.caption)
                .foregroundStyle(.tertiary)
            }
            .padding()
        }
    }
}

// MARK: - Agent Card

private struct PublicAgentInfoCard: View {
    let agent: PublishedAgent

    var body: some View {
        VStack(spacing: 16) {
            // Avatar
            ZStack {
                Circle()
                    .fill(agent.accentColorValue.opacity(0.15))
                    .frame(width: 80, height: 80)
                Text(agent.emoji)
                    .font(.system(size: 40))
            }

            // Name
            Text(agent.name)
                .font(.title2.weight(.bold))

            // Description
            if !agent.description.isEmpty {
                Text(agent.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            // Greeting
            Text("\"\(agent.introductionGreeting)\"")
                .font(.subheadline)
                .italic()
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .padding(24)
        .background(Color(UIColor.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

// MARK: - Mode Button

private struct ModeButton: View {
    let mode: PublicAgentInteractionMode
    let accentColor: Color
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 16) {
                Image(systemName: mode.iconName)
                    .font(.title2)
                    .frame(width: 32)

                VStack(alignment: .leading, spacing: 4) {
                    Text(mode.displayName)
                        .font(.headline)
                    Text(mode.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .foregroundStyle(.secondary)
            }
            .padding(16)
            .background(Color(UIColor.tertiarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Agent Picker Sheet

private struct AgentPickerSheet: View {
    @Environment(\.dismiss) var dismiss
    let agents: [LocalAgent]
    let onSelect: (LocalAgent) -> Void

    var body: some View {
        NavigationStack {
            List(agents) { agent in
                Button {
                    onSelect(agent)
                } label: {
                    HStack(spacing: 12) {
                        Text(agent.emoji)
                            .font(.title2)

                        VStack(alignment: .leading) {
                            Text(agent.name)
                                .font(.headline)
                            Text(agent.description)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
            }
            .navigationTitle("Select Your Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Autonomous Context Sheet

private struct AutonomousContextSheet: View {
    let hostAgent: PublishedAgent
    let visitorAgent: LocalAgent
    @Binding var context: String
    let onStart: () -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                // Header
                VStack(spacing: 16) {
                    // Agent avatars
                    HStack(spacing: 20) {
                        VStack(spacing: 4) {
                            ZStack {
                                Circle()
                                    .fill(Color.blue.opacity(0.15))
                                    .frame(width: 60, height: 60)
                                Text(visitorAgent.emoji)
                                    .font(.title)
                            }
                            Text(visitorAgent.name)
                                .font(.caption)
                        }

                        Image(systemName: "arrow.right")
                            .font(.title2)
                            .foregroundStyle(.secondary)

                        VStack(spacing: 4) {
                            ZStack {
                                Circle()
                                    .fill(hostAgent.accentColorValue.opacity(0.15))
                                    .frame(width: 60, height: 60)
                                Text(hostAgent.emoji)
                                    .font(.title)
                            }
                            Text(hostAgent.name)
                                .font(.caption)
                        }
                    }

                    Text("Your agent will have a conversation with \(hostAgent.name) on your behalf")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                // Context input
                VStack(alignment: .leading, spacing: 8) {
                    Text("What should your agent ask about? (Optional)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    TextField("e.g., Ask about appointment availability", text: $context, axis: .vertical)
                        .textFieldStyle(.plain)
                        .lineLimit(3...5)
                        .padding(12)
                        .background(Color(UIColor.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                // Suggestions
                VStack(alignment: .leading, spacing: 8) {
                    Text("Suggestions")
                        .font(.caption)
                        .foregroundStyle(.tertiary)

                    FlowLayout(spacing: 8) {
                        ForEach(suggestions, id: \.self) { suggestion in
                            Button {
                                context = suggestion
                            } label: {
                                Text(suggestion)
                                    .font(.caption)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(Color.blue.opacity(0.1))
                                    .foregroundStyle(.blue)
                                    .clipShape(Capsule())
                            }
                        }
                    }
                }

                Spacer()

                // Start button
                Button {
                    onStart()
                } label: {
                    HStack {
                        Image(systemName: "arrow.left.arrow.right")
                        Text("Start Conversation")
                    }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(hostAgent.accentColorValue)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                Text("Watch your agents converse in real-time")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
            .padding()
            .navigationTitle("Agent Conversation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onCancel()
                    }
                }
            }
        }
    }

    private var suggestions: [String] {
        [
            "Ask about their services",
            "Learn about pricing",
            "Check availability",
            "Get contact information",
            "Ask about experience"
        ]
    }
}
