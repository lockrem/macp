import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authService: AuthService
    @EnvironmentObject var apiKeyService: APIKeyService
    @State private var notificationsEnabled = true
    @State private var showSignOutConfirm = false
    @State private var editingProvider: ProviderItem?
}

struct ProviderItem: Identifiable {
    let id: String
    var provider: String { id }
}

extension SettingsView {

    var body: some View {
        NavigationStack {
            Form {
                // Account Section
                Section {
                    if let user = authService.currentUser {
                        HStack {
                            Circle()
                                .fill(.blue.gradient)
                                .frame(width: 50, height: 50)
                                .overlay {
                                    Text(user.displayName.prefix(1))
                                        .font(.title2.bold())
                                        .foregroundColor(.white)
                                }

                            VStack(alignment: .leading) {
                                Text(user.displayName)
                                    .font(.headline)
                                if let email = user.email {
                                    Text(email)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                } header: {
                    Text("Account")
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
                    .foregroundStyle(isConfigured ? .green : .blue)
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
        default: return provider.capitalized
        }
    }

    var keyPrefix: String {
        switch provider {
        case "anthropic": return "sk-ant-"
        case "openai": return "sk-"
        case "gemini": return "AI"
        case "groq": return "gsk_"
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
