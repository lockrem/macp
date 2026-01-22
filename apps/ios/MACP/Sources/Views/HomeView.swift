import SwiftUI

struct HomeView: View {
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService
    @State private var showCreateAgent = false
    @State private var selectedAgent: LocalAgent?
    @State private var showChat = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    headerSection

                    if agentStorage.agents.isEmpty {
                        emptyStateView
                    } else {
                        // Agent Cards
                        agentCardsSection
                    }

                    Spacer(minLength: 100)
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("My Agents")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showCreateAgent = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.title2)
                    }
                }
            }
            .sheet(isPresented: $showCreateAgent) {
                CreateAgentView()
                    .environmentObject(agentStorage)
                    .environmentObject(apiKeyService)
            }
            .fullScreenCover(isPresented: $showChat) {
                if let agent = selectedAgent {
                    SoloChatView(agent: agent)
                        .environmentObject(apiKeyService)
                }
            }
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(greeting)
                .font(.title2)
                .fontWeight(.medium)
                .foregroundStyle(.secondary)

            Text("Who would you like to chat with?")
                .font(.headline)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 8)
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Good morning"
        case 12..<17: return "Good afternoon"
        case 17..<22: return "Good evening"
        default: return "Good night"
        }
    }

    // MARK: - Agent Cards

    private var agentCardsSection: some View {
        LazyVStack(spacing: 16) {
            ForEach(agentStorage.agents) { agent in
                AgentCard(agent: agent) {
                    selectedAgent = agent
                    showChat = true
                }
            }
        }
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        VStack(spacing: 24) {
            Spacer().frame(height: 40)

            Text("🤖")
                .font(.system(size: 80))

            VStack(spacing: 8) {
                Text("Create Your First Agent")
                    .font(.title2)
                    .fontWeight(.bold)

                Text("Agents remember your conversations and learn about you over time.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Button {
                showCreateAgent = true
            } label: {
                Label("Create Agent", systemImage: "plus")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(.blue)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .padding(.horizontal, 40)

            Spacer()
        }
        .padding()
    }
}

// MARK: - Agent Card

struct AgentCard: View {
    let agent: LocalAgent
    let onTap: () -> Void

    @State private var isPressed = false

    var accentColor: Color {
        switch agent.accentColorName {
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

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 16) {
                // Avatar
                ZStack {
                    Circle()
                        .fill(accentColor.opacity(0.15))
                        .frame(width: 70, height: 70)

                    Text(agent.emoji)
                        .font(.system(size: 36))
                }

                // Info
                VStack(alignment: .leading, spacing: 6) {
                    Text(agent.name)
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundStyle(.primary)

                    Text(agent.greeting)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)

                    // Provider badge
                    HStack(spacing: 4) {
                        Image(agent.provider.iconName)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 14, height: 14)

                        Text(agent.provider.displayName)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                // Chat button
                Image(systemName: "bubble.left.fill")
                    .font(.title2)
                    .foregroundStyle(accentColor)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(.systemBackground))
                    .shadow(color: accentColor.opacity(0.15), radius: 10, y: 4)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(accentColor.opacity(0.2), lineWidth: 1)
            )
        }
        .buttonStyle(AgentCardButtonStyle())
    }
}

struct AgentCardButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.spring(response: 0.3), value: configuration.isPressed)
    }
}

// MARK: - Create Agent View

struct CreateAgentView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService

    @State private var selectedTemplate: AgentTemplate?
    @State private var showCustomize = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    VStack(spacing: 8) {
                        Text("Choose a Template")
                            .font(.title2)
                            .fontWeight(.bold)

                        Text("Pick a starting point, then customize it to fit your needs")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top)

                    // Templates Grid
                    LazyVGrid(columns: [
                        GridItem(.flexible()),
                        GridItem(.flexible())
                    ], spacing: 16) {
                        ForEach(LocalAgent.templates) { template in
                            TemplateCard(template: template, isSelected: selectedTemplate?.id == template.id) {
                                selectedTemplate = template
                            }
                        }
                    }
                    .padding(.horizontal)

                    // Create custom option
                    Button {
                        selectedTemplate = nil
                        showCustomize = true
                    } label: {
                        HStack {
                            Image(systemName: "sparkles")
                            Text("Create Custom Agent")
                        }
                        .font(.headline)
                        .foregroundStyle(.blue)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .padding(.horizontal)
                }
                .padding(.bottom, 100)
            }
            .navigationTitle("New Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Next") {
                        showCustomize = true
                    }
                    .disabled(selectedTemplate == nil)
                }
            }
            .sheet(isPresented: $showCustomize) {
                CustomizeAgentView(template: selectedTemplate) { agent in
                    agentStorage.addAgent(agent)
                    Task { await SettingsSyncService.shared.syncAgents() }
                    dismiss()
                }
                .environmentObject(apiKeyService)
            }
        }
    }
}

struct TemplateCard: View {
    let template: AgentTemplate
    let isSelected: Bool
    let onTap: () -> Void

    var accentColor: Color {
        switch template.accentColorName {
        case "red": return .red
        case "orange": return .orange
        case "green": return .green
        case "purple": return .purple
        case "cyan": return .cyan
        default: return .blue
        }
    }

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(accentColor.opacity(0.15))
                        .frame(width: 60, height: 60)

                    Text(template.emoji)
                        .font(.system(size: 30))
                }

                VStack(spacing: 4) {
                    Text(template.name)
                        .font(.headline)
                        .foregroundStyle(.primary)

                    Text(template.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemBackground))
                    .shadow(color: .black.opacity(0.05), radius: 5)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(isSelected ? accentColor : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Customize Agent View

struct CustomizeAgentView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var apiKeyService: APIKeyService

    let template: AgentTemplate?
    let onCreate: (LocalAgent) -> Void

    @State private var name: String = ""
    @State private var emoji: String = "🤖"
    @State private var greeting: String = ""
    @State private var personality: String = ""
    @State private var provider: AgentProvider = .anthropic
    @State private var accentColorName: String = "blue"

    let emojis = ["🤖", "🏥", "💪", "💼", "💰", "📔", "📚", "🎯", "🧘", "🎨", "🍎", "✈️", "🏠", "👨‍👩‍👧", "🐕"]
    let colors = ["blue", "red", "orange", "green", "purple", "cyan", "pink"]

    var body: some View {
        NavigationStack {
            Form {
                // Avatar & Name
                Section {
                    HStack {
                        // Emoji picker
                        Menu {
                            ForEach(emojis, id: \.self) { e in
                                Button(e) { emoji = e }
                            }
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(selectedColor.opacity(0.15))
                                    .frame(width: 60, height: 60)
                                Text(emoji)
                                    .font(.system(size: 30))
                            }
                        }

                        TextField("Agent Name", text: $name)
                            .font(.title3)
                            .fontWeight(.semibold)
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
                                        .frame(width: 40, height: 40)
                                        .overlay(
                                            Circle()
                                                .stroke(Color.primary, lineWidth: accentColorName == colorName ? 3 : 0)
                                                .padding(2)
                                        )
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                } header: {
                    Text("Color Theme")
                }

                // Greeting
                Section {
                    TextField("e.g., Hey! What's on your mind?", text: $greeting)
                } header: {
                    Text("Greeting Message")
                } footer: {
                    Text("This is how your agent will greet you")
                }

                // Personality
                Section {
                    TextField("e.g., friendly, supportive, and encouraging", text: $personality, axis: .vertical)
                        .lineLimit(2...4)
                } header: {
                    Text("Personality")
                } footer: {
                    Text("Describe how your agent should behave")
                }

                // Provider
                Section {
                    Picker("AI Provider", selection: $provider) {
                        ForEach(AgentProvider.allCases, id: \.self) { p in
                            HStack {
                                Image(p.iconName)
                                    .resizable()
                                    .scaledToFit()
                                    .frame(width: 20, height: 20)
                                Text(p.displayName)
                            }
                            .tag(p)
                        }
                    }
                } footer: {
                    if !apiKeyService.hasKey(for: provider) {
                        Text("Configure this API key in Settings first")
                            .foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle("Customize Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Back") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        let agent = LocalAgent(
                            name: name,
                            description: personality,
                            provider: provider,
                            emoji: emoji,
                            personality: personality,
                            greeting: greeting,
                            accentColorName: accentColorName
                        )
                        onCreate(agent)
                    }
                    .disabled(name.isEmpty || !apiKeyService.hasKey(for: provider))
                }
            }
            .onAppear {
                if let template = template {
                    name = template.name
                    emoji = template.emoji
                    greeting = template.greeting
                    personality = template.personality
                    accentColorName = template.accentColorName
                }
            }
        }
    }

    var selectedColor: Color {
        colorFor(accentColorName)
    }

    func colorFor(_ name: String) -> Color {
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
}

#Preview {
    HomeView()
        .environmentObject(AgentStorageService.shared)
        .environmentObject(APIKeyService.shared)
}
