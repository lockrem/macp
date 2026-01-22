import Foundation

/// Manages user memory with dynamic categories stored on the server
/// Supports fact extraction from conversations and memory context injection
@MainActor
class MemoryService: ObservableObject {
    static let shared = MemoryService()

    @Published var isLoading = false
    @Published var error: String?

    // Memory state
    @Published var memoryIndex: UserMemoryIndex?
    @Published var memoryCache: UserMemoryCache?
    @Published var loadedCategories: [String: UserMemoryCategory] = [:]

    private let baseURL: String

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    private init() {
        self.baseURL = "\(APIClient.shared.baseURL)/api/memories"
    }

    // MARK: - Index Operations

    /// Fetches the memory index (list of all categories)
    func fetchIndex() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let index: UserMemoryIndex = try await APIClient.shared.get("/api/memories")
            self.memoryIndex = index
            print("[Memory] Loaded index: \(index.categories.count) categories, \(index.totalFacts) facts")
        } catch {
            self.error = "Failed to load memory index: \(error.localizedDescription)"
            print("[Memory] Failed to fetch index: \(error)")
        }
    }

    // MARK: - Category Operations

    /// Fetches a specific memory category
    func fetchCategory(_ categoryName: String) async -> UserMemoryCategory? {
        isLoading = true
        defer { isLoading = false }

        do {
            let category: UserMemoryCategory = try await APIClient.shared.get("/api/memories/\(categoryName)")
            loadedCategories[categoryName] = category
            return category
        } catch {
            print("[Memory] Failed to fetch category \(categoryName): \(error)")
            return nil
        }
    }

    /// Fetches multiple categories at once (efficient for context injection)
    func fetchCategories(_ categoryNames: [String]) async -> BulkMemoryResponse? {
        isLoading = true
        defer { isLoading = false }

        do {
            let response: BulkMemoryResponse = try await APIClient.shared.post(
                "/api/memories/bulk",
                body: ["categories": categoryNames]
            )

            // Cache loaded categories
            for (name, category) in response.categories {
                if let cat = category {
                    loadedCategories[name] = cat
                }
            }

            return response
        } catch {
            print("[Memory] Failed to fetch categories: \(error)")
            return nil
        }
    }

    // MARK: - Cache Operations

    /// Fetches the memory cache for fast fact lookups
    func fetchCache() async {
        do {
            let cache: UserMemoryCache = try await APIClient.shared.get("/api/memories/cache")
            self.memoryCache = cache
            print("[Memory] Cache loaded: \(cache.totalFacts) facts indexed")
        } catch {
            print("[Memory] Failed to fetch cache: \(error)")
        }
    }

    /// Checks which facts are available for a set of queries
    func checkFactAvailability(queries: [String]) async -> FactAvailabilityResponse? {
        do {
            let response: FactAvailabilityResponse = try await APIClient.shared.post(
                "/api/memories/cache/check",
                body: ["queries": queries]
            )
            return response
        } catch {
            print("[Memory] Failed to check fact availability: \(error)")
            return nil
        }
    }

    /// Smart fact lookup - returns facts based on queries with context
    func lookupFacts(queries: [String], includeContext: Bool = true) async -> FactLookupResponse? {
        let request = FactLookupRequest(queries: queries, includeContext: includeContext)
        do {
            let response: FactLookupResponse = try await APIClient.shared.post(
                "/api/memories/lookup",
                body: request
            )
            return response
        } catch {
            print("[Memory] Failed to lookup facts: \(error)")
            return nil
        }
    }

    // MARK: - Solo Conversation

    /// Creates a solo conversation with memory context
    func createSoloConversation(
        agent: LocalAgent,
        apiKey: String,
        topic: String? = nil,
        memoryCategories: [String]? = nil,
        extractFacts: Bool = true
    ) async -> SoloConversationResponse? {
        let payload: [String: Any] = [
            "agentId": agent.id.uuidString,
            "apiKey": apiKey,
            "agentConfig": [
                "displayName": agent.name,
                "provider": agent.provider.rawValue,
                "modelId": agent.modelId,
                "personality": agent.description
            ] as [String: Any],
            "topic": topic ?? "Personal conversation",
            "memoryCategories": memoryCategories ?? [],
            "extractFacts": extractFacts
        ] as [String: Any]

        do {
            // Create the request manually since we need a dictionary body
            let url = URL(string: "\(APIClient.shared.baseURL)/conversations/solo")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = AuthService.shared.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            request.httpBody = try JSONSerialization.data(withJSONObject: payload)

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode) else {
                print("[Memory] Solo conversation creation failed")
                return nil
            }

            return try decoder.decode(SoloConversationResponse.self, from: data)
        } catch {
            print("[Memory] Failed to create solo conversation: \(error)")
            return nil
        }
    }

    /// Sends a message in a solo conversation
    func sendSoloMessage(conversationId: String, content: String) async -> SoloMessageResponse? {
        do {
            let response: SoloMessageResponse = try await APIClient.shared.post(
                "/conversations/\(conversationId)/message",
                body: ["content": content]
            )
            return response
        } catch {
            print("[Memory] Failed to send solo message: \(error)")
            return nil
        }
    }

    /// Ends a solo conversation and extracts facts
    func endSoloConversation(conversationId: String) async -> EndConversationResponse? {
        do {
            let response: EndConversationResponse = try await APIClient.shared.post(
                "/conversations/\(conversationId)/end",
                body: [:] as [String: String]
            )

            // Refresh the index if facts were extracted
            if response.factsExtracted != nil {
                await fetchIndex()
                await fetchCache()
            }

            return response
        } catch {
            print("[Memory] Failed to end solo conversation: \(error)")
            return nil
        }
    }

    // MARK: - Context Building

    /// Builds a context string from loaded categories for prompt injection
    func buildContextFromCategories(_ categoryNames: [String]) -> String {
        var context = ""

        for name in categoryNames {
            if let category = loadedCategories[name], !category.summary.isEmpty {
                context += "### \(category.displayName)\n"
                context += category.summary
                context += "\n\n"
            }
        }

        return context.isEmpty ? "" : "## What You Know About Your User\n\n\(context)"
    }

    /// Gets the quick summary from cache
    var quickSummary: String {
        memoryCache?.quickSummary ?? "No information recorded yet."
    }

    /// Gets available categories from cache
    var availableCategories: [String] {
        memoryCache?.availableCategories ?? []
    }

    // MARK: - Legacy Support

    /// Loads memory for an agent (legacy - returns aggregated memory)
    func loadMemory(for agent: LocalAgent) async -> AgentMemory {
        // Fetch all categories and build an AgentMemory for backward compatibility
        await fetchIndex()

        guard let index = memoryIndex, !index.categories.isEmpty else {
            return AgentMemory()
        }

        // Load all categories
        let categoryNames = index.categories.map { $0.name }
        _ = await fetchCategories(categoryNames)

        // Convert to legacy format
        var stores: [MemoryStore] = []
        for (name, category) in loadedCategories {
            let entries = category.facts.map { fact in
                MemoryEntry(
                    id: UUID(),
                    content: "\(fact.key): \(fact.displayValue)",
                    category: name
                )
            }
            stores.append(MemoryStore(
                name: category.displayName,
                description: category.summary,
                entries: entries
            ))
        }

        return AgentMemory(stores: stores)
    }

    /// Saves memory for an agent (legacy - stores not supported in new system)
    /// This is a no-op in the new category-based system
    func saveMemory(_ memory: AgentMemory, for agent: LocalAgent) async {
        // The new system extracts facts from conversations automatically
        // Manual memory saving is deprecated
        print("[Memory] saveMemory called - this is deprecated in the new category-based system")
    }

    /// Clears memory for an agent (legacy)
    func clearMemory(for agent: LocalAgent) async {
        // Clear local caches
        invalidateAllCaches()
        print("[Memory] clearMemory called - caches cleared")
    }

    /// Clears all caches
    func invalidateAllCaches() {
        memoryIndex = nil
        memoryCache = nil
        loadedCategories.removeAll()
    }
}

// MARK: - Errors

enum MemoryError: LocalizedError {
    case notAuthenticated
    case invalidResponse
    case serverError(Int)
    case uploadFailed

    var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Please sign in to access memories"
        case .invalidResponse:
            return "Invalid server response"
        case .serverError(let code):
            return "Server error: \(code)"
        case .uploadFailed:
            return "Failed to upload memory"
        }
    }
}
