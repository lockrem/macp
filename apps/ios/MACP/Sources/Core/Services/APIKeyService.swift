import Foundation

@MainActor
class APIKeyService: ObservableObject {
    static let shared = APIKeyService()

    @Published var hasAnthropicKey: Bool = false
    @Published var hasOpenAIKey: Bool = false
    @Published var hasGeminiKey: Bool = false
    @Published var hasGroqKey: Bool = false
    @Published var hasElevenLabsKey: Bool = false

    private let anthropicKeyName = "anthropic_api_key"
    private let openaiKeyName = "openai_api_key"
    private let geminiKeyName = "gemini_api_key"
    private let groqKeyName = "groq_api_key"
    private let elevenLabsKeyName = "elevenlabs_api_key"

    private init() {
        refreshKeyStatus()
    }

    // MARK: - Key Status

    func refreshKeyStatus() {
        hasAnthropicKey = KeychainHelper.load(key: anthropicKeyName) != nil
        hasOpenAIKey = KeychainHelper.load(key: openaiKeyName) != nil
        hasGeminiKey = KeychainHelper.load(key: geminiKeyName) != nil
        hasGroqKey = KeychainHelper.load(key: groqKeyName) != nil
        hasElevenLabsKey = KeychainHelper.load(key: elevenLabsKeyName) != nil
    }

    var availableProviders: [String] {
        var providers: [String] = []
        if hasAnthropicKey { providers.append("anthropic") }
        if hasOpenAIKey { providers.append("openai") }
        if hasGeminiKey { providers.append("gemini") }
        if hasGroqKey { providers.append("groq") }
        return providers
    }

    var hasAnyKey: Bool {
        hasAnthropicKey || hasOpenAIKey || hasGeminiKey || hasGroqKey
    }

    // MARK: - Anthropic Key

    func saveAnthropicKey(_ key: String) {
        if key.isEmpty {
            KeychainHelper.delete(key: anthropicKeyName)
        } else {
            KeychainHelper.save(key: anthropicKeyName, value: key)
        }
        refreshKeyStatus()
    }

    func getAnthropicKey() -> String? {
        KeychainHelper.load(key: anthropicKeyName)
    }

    func clearAnthropicKey() {
        KeychainHelper.delete(key: anthropicKeyName)
        refreshKeyStatus()
    }

    // MARK: - OpenAI Key

    func saveOpenAIKey(_ key: String) {
        if key.isEmpty {
            KeychainHelper.delete(key: openaiKeyName)
        } else {
            KeychainHelper.save(key: openaiKeyName, value: key)
        }
        refreshKeyStatus()
    }

    func getOpenAIKey() -> String? {
        KeychainHelper.load(key: openaiKeyName)
    }

    func clearOpenAIKey() {
        KeychainHelper.delete(key: openaiKeyName)
        refreshKeyStatus()
    }

    // MARK: - Gemini Key

    func saveGeminiKey(_ key: String) {
        if key.isEmpty {
            KeychainHelper.delete(key: geminiKeyName)
        } else {
            KeychainHelper.save(key: geminiKeyName, value: key)
        }
        refreshKeyStatus()
    }

    func getGeminiKey() -> String? {
        KeychainHelper.load(key: geminiKeyName)
    }

    func clearGeminiKey() {
        KeychainHelper.delete(key: geminiKeyName)
        refreshKeyStatus()
    }

    // MARK: - Groq Key

    func saveGroqKey(_ key: String) {
        if key.isEmpty {
            KeychainHelper.delete(key: groqKeyName)
        } else {
            KeychainHelper.save(key: groqKeyName, value: key)
        }
        refreshKeyStatus()
    }

    func getGroqKey() -> String? {
        KeychainHelper.load(key: groqKeyName)
    }

    func clearGroqKey() {
        KeychainHelper.delete(key: groqKeyName)
        refreshKeyStatus()
    }

    // MARK: - ElevenLabs Key

    func saveElevenLabsKey(_ key: String) {
        if key.isEmpty {
            KeychainHelper.delete(key: elevenLabsKeyName)
        } else {
            KeychainHelper.save(key: elevenLabsKeyName, value: key)
        }
        refreshKeyStatus()
    }

    func getElevenLabsKey() -> String? {
        KeychainHelper.load(key: elevenLabsKeyName)
    }

    func clearElevenLabsKey() {
        KeychainHelper.delete(key: elevenLabsKeyName)
        refreshKeyStatus()
    }

    // MARK: - Get Key for Provider

    func getKey(for provider: String) -> String? {
        switch provider {
        case "anthropic":
            return getAnthropicKey()
        case "openai":
            return getOpenAIKey()
        case "gemini":
            return getGeminiKey()
        case "groq":
            return getGroqKey()
        case "elevenlabs":
            return getElevenLabsKey()
        default:
            return nil
        }
    }

    // MARK: - Save Key for Provider

    func saveKey(_ key: String, for provider: String) {
        switch provider {
        case "anthropic":
            saveAnthropicKey(key)
        case "openai":
            saveOpenAIKey(key)
        case "gemini":
            saveGeminiKey(key)
        case "groq":
            saveGroqKey(key)
        case "elevenlabs":
            saveElevenLabsKey(key)
        default:
            break
        }
    }

    // MARK: - Check if Provider Has Key

    func hasKey(for provider: AgentProvider) -> Bool {
        switch provider {
        case .anthropic:
            return hasAnthropicKey
        case .openai:
            return hasOpenAIKey
        case .gemini:
            return hasGeminiKey
        case .groq:
            return hasGroqKey
        }
    }
}
