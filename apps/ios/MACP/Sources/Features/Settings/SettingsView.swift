import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var agentStorage: AgentStorageService
    @StateObject private var profileService = ProfileService.shared
    @StateObject private var groundingService = GroundingService.shared
    @State private var notificationsEnabled = true
    @State private var showSignOutConfirm = false
    @State private var editingProvider: ProviderItem?
    @State private var showManageAgents = false
    @State private var showProfile = false

    /// All memory categories in display order
    private static let categories: [(key: String, icon: String, color: Color)] = [
        ("identity", "person.fill", .blue),
        ("dietary", "leaf.fill", .green),
        ("health", "heart.fill", .red),
        ("preferences", "star.fill", .orange),
        ("wishlist", "gift.fill", .purple),
        ("financial", "dollarsign.circle.fill", .mint),
        ("schedule", "calendar", .cyan),
        ("family", "figure.2.and.child.holdinghands", .pink),
        ("work", "briefcase.fill", .indigo),
        ("general", "info.circle.fill", .gray),
    ]

    private func factCount(for category: String) -> Int {
        profileService.profile?.sections.first { $0.category == category }?.facts.count ?? 0
    }

    @ViewBuilder
    private func categoryBubble(icon: String, color: Color, count: Int) -> some View {
        let active = count > 0

        ZStack(alignment: .topTrailing) {
            Circle()
                .fill(active ? color.opacity(0.12) : Color(.systemGray5))
                .frame(width: 40, height: 40)
                .overlay {
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(active ? color : Color(.systemGray3))
                }

            if active {
                Text("\(count)")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(minWidth: 16, minHeight: 16)
                    .background(color, in: Circle())
                    .offset(x: 4, y: -4)
            }
        }
    }
}

struct ProviderItem: Identifiable {
    let id: String
    var provider: String { id }
}

extension SettingsView {

    var body: some View {
        NavigationStack {
            Form {
                // My Profile Section (like Apple ID in Settings)
                Section {
                    Button {
                        showProfile = true
                    } label: {
                        VStack(spacing: 14) {
                            // Header row with avatar and name
                            HStack(spacing: 14) {
                                // Profile avatar
                                ZStack {
                                    Circle()
                                        .fill(.blue.gradient)
                                        .frame(width: 60, height: 60)
                                    Image(systemName: "person.fill")
                                        .font(.system(size: 28, weight: .semibold))
                                        .foregroundStyle(.white)
                                }

                                VStack(alignment: .leading, spacing: 4) {
                                    // Show name if we have it, otherwise generic title
                                    if let nameFact = profileService.fact(forKey: "name") {
                                        Text(nameFact.displayValue)
                                            .font(.title3.weight(.semibold))
                                            .foregroundStyle(.primary)
                                    } else if let user = authService.currentUser {
                                        Text(user.displayName)
                                            .font(.title3.weight(.semibold))
                                            .foregroundStyle(.primary)
                                    } else {
                                        Text("My Profile")
                                            .font(.title3.weight(.semibold))
                                            .foregroundStyle(.primary)
                                    }

                                    // Subtitle with fact count
                                    if profileService.profile?.totalFacts ?? 0 > 0 {
                                        Text("\(profileService.profile!.totalFacts) facts learned about you")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    } else {
                                        Text("Personalize your AI experience")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }

                                Spacer()

                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.tertiary)
                            }

                            // Category icons - 2 rows of 5
                            VStack(spacing: 10) {
                                HStack(spacing: 0) {
                                    ForEach(Array(Self.categories.prefix(5).enumerated()), id: \.offset) { _, cat in
                                        Spacer(minLength: 0)
                                        categoryBubble(icon: cat.icon, color: cat.color, count: factCount(for: cat.key))
                                        Spacer(minLength: 0)
                                    }
                                }
                                HStack(spacing: 0) {
                                    ForEach(Array(Self.categories.suffix(5).enumerated()), id: \.offset) { _, cat in
                                        Spacer(minLength: 0)
                                        categoryBubble(icon: cat.icon, color: cat.color, count: factCount(for: cat.key))
                                        Spacer(minLength: 0)
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }

                // Account Section
                Section {
                    if let user = authService.currentUser {
                        HStack {
                            Label {
                                Text(user.email ?? user.displayName)
                            } icon: {
                                Image(systemName: "envelope.fill")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                } header: {
                    Text("Account")
                }

                // My Memories Section
                Section {
                    NavigationLink {
                        MyMemoriesView()
                    } label: {
                        HStack {
                            Label("My Memories", systemImage: "brain.head.profile")
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                } header: {
                    Text("Memory")
                } footer: {
                    Text("Facts learned about you from conversations, synced across devices")
                }

                // AI Behavior Section
                Section {
                    NavigationLink {
                        GroundingPreferencesView()
                    } label: {
                        HStack {
                            Label("AI Behavior", systemImage: "slider.horizontal.3")
                            Spacer()
                            if let prefs = groundingService.preferences {
                                Text(prefs.presetName)
                                    .foregroundStyle(.secondary)
                            }
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                } header: {
                    Text("AI Settings")
                } footer: {
                    Text("Customize how your AI agents respond and participate in conversations")
                }

                // API Keys Section
                Section {
                    APIKeyRow(
                        provider: "Claude (Anthropic)",
                        isConfigured: apiKeyService.hasAnthropicKey,
                        onTap: {
                            editingProvider = ProviderItem(id: "anthropic")
                        }
                    )

                    APIKeyRow(
                        provider: "GPT (OpenAI)",
                        isConfigured: apiKeyService.hasOpenAIKey,
                        onTap: {
                            editingProvider = ProviderItem(id: "openai")
                        }
                    )

                    APIKeyRow(
                        provider: "Gemini (Google)",
                        isConfigured: apiKeyService.hasGeminiKey,
                        onTap: {
                            editingProvider = ProviderItem(id: "gemini")
                        }
                    )

                    APIKeyRow(
                        provider: "Groq (Fast LLaMA)",
                        isConfigured: apiKeyService.hasGroqKey,
                        onTap: {
                            editingProvider = ProviderItem(id: "groq")
                        }
                    )
                } header: {
                    Text("AI Provider Keys")
                } footer: {
                    Text("Enter your API keys to enable AI agents. Keys are stored securely on your device.")
                }

                // Notifications
                Section {
                    Toggle("Push Notifications", isOn: $notificationsEnabled)
                } header: {
                    Text("Notifications")
                } footer: {
                    Text("Get notified when your agent responds or is invited to a conversation")
                }

                // About
                Section {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundStyle(.secondary)
                    }

                    Link(destination: URL(string: "https://macp.app/privacy")!) {
                        Text("Privacy Policy")
                    }

                    Link(destination: URL(string: "https://macp.app/terms")!) {
                        Text("Terms of Service")
                    }
                } header: {
                    Text("About")
                }

                // Sign Out
                Section {
                    Button("Sign Out", role: .destructive) {
                        showSignOutConfirm = true
                    }
                }
            }
            .navigationTitle("Settings")
            .confirmationDialog("Sign Out", isPresented: $showSignOutConfirm) {
                Button("Sign Out", role: .destructive) {
                    authService.signOut()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Are you sure you want to sign out?")
            }
            .sheet(item: $editingProvider) { item in
                APIKeyInputSheet(provider: item.provider)
                    .environmentObject(apiKeyService)
            }
            .sheet(isPresented: $showProfile) {
                MyProfileView()
                    .environmentObject(profileService)
            }
            .task {
                await profileService.fetchProfile()
                await groundingService.fetchPreferences()
            }
        }
    }
}

struct APIKeyRow: View {
    let provider: String
    let isConfigured: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(provider)
                        .foregroundStyle(.primary)

                    Text(isConfigured ? "Configured" : "Not configured")
                        .font(.caption)
                        .foregroundStyle(isConfigured ? .green : .secondary)
                }

                Spacer()

                Image(systemName: isConfigured ? "checkmark.circle.fill" : "plus.circle")
                    .foregroundStyle(isConfigured ? .green : .orange)
            }
        }
    }
}

struct APIKeyInputSheet: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var apiKeyService: APIKeyService
    let provider: String

    @State private var apiKey = ""
    @State private var showKey = false

    var providerName: String {
        switch provider {
        case "anthropic": return "Anthropic"
        case "openai": return "OpenAI"
        case "gemini": return "Gemini"
        case "groq": return "Groq"
        case "elevenlabs": return "ElevenLabs"
        default: return provider.capitalized
        }
    }

    var keyPrefix: String {
        switch provider {
        case "anthropic": return "sk-ant-"
        case "openai": return "sk-"
        case "gemini": return "AI"
        case "groq": return "gsk_"
        case "elevenlabs": return "sk_"
        default: return ""
        }
    }

    var existingKey: String? {
        apiKeyService.getKey(for: provider)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        if showKey {
                            TextField("API Key", text: $apiKey)
                                .textContentType(.password)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        } else {
                            SecureField("API Key", text: $apiKey)
                                .textContentType(.password)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        }

                        Button {
                            showKey.toggle()
                        } label: {
                            Image(systemName: showKey ? "eye.slash" : "eye")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                } header: {
                    Text("\(providerName) API Key")
                } footer: {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Your key starts with \"\(keyPrefix)\"")

                        switch provider {
                        case "anthropic":
                            Link("Get an Anthropic API key",
                                 destination: URL(string: "https://console.anthropic.com/settings/keys")!)
                        case "openai":
                            Link("Get an OpenAI API key",
                                 destination: URL(string: "https://platform.openai.com/api-keys")!)
                        case "gemini":
                            Link("Get a Gemini API key",
                                 destination: URL(string: "https://aistudio.google.com/apikey")!)
                        case "groq":
                            Link("Get a Groq API key",
                                 destination: URL(string: "https://console.groq.com/keys")!)
                        default:
                            EmptyView()
                        }
                    }
                }

                if existingKey != nil {
                    Section {
                        Button("Remove API Key", role: .destructive) {
                            switch provider {
                            case "anthropic":
                                apiKeyService.clearAnthropicKey()
                            case "openai":
                                apiKeyService.clearOpenAIKey()
                            case "gemini":
                                apiKeyService.clearGeminiKey()
                            case "groq":
                                apiKeyService.clearGroqKey()
                            default:
                                break
                            }
                            // Sync to server
                            Task { await SettingsSyncService.shared.syncAPIKeys() }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle("\(providerName) Key")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        apiKeyService.saveKey(apiKey, for: provider)
                        // Sync to server
                        Task { await SettingsSyncService.shared.syncAPIKeys() }
                        dismiss()
                    }
                    .disabled(apiKey.isEmpty)
                }
            }
            .onAppear {
                if let existing = existingKey {
                    apiKey = existing
                }
            }
        }
        .presentationDetents([.medium])
    }
}

#Preview {
    SettingsView()
        .environmentObject(AuthService.shared)
        .environmentObject(APIKeyService.shared)
}
