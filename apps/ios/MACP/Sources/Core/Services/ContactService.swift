import Foundation
import SwiftUI

/// Service for managing contacts and their agent associations
@MainActor
class ContactService: ObservableObject {
    static let shared = ContactService()

    @Published var contacts: [Contact] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var searchResults: [Contact] = []

    private let apiClient = APIClient.shared

    private init() {}

    // MARK: - CRUD Operations

    /// Fetch all contacts for the current user
    func fetchContacts(search: String? = nil, tags: [String]? = nil) async {
        isLoading = true
        error = nil

        do {
            var path = "/api/contacts"
            var queryParams: [String] = []

            if let search = search, !search.isEmpty {
                queryParams.append("search=\(search.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? search)")
            }
            if let tags = tags, !tags.isEmpty {
                queryParams.append("tags=\(tags.joined(separator: ","))")
            }

            if !queryParams.isEmpty {
                path += "?" + queryParams.joined(separator: "&")
            }

            let response: ContactsListResponse = try await apiClient.get(path)
            contacts = response.contacts
        } catch {
            self.error = "Failed to load contacts: \(error.localizedDescription)"
            print("[ContactService] Fetch error: \(error)")
        }

        isLoading = false
    }

    /// Create a new contact
    func createContact(
        name: String,
        aliases: [String] = [],
        relationship: String? = nil,
        birthday: String? = nil,
        email: String? = nil,
        phone: String? = nil,
        notes: String? = nil,
        tags: [String] = []
    ) async -> Contact? {
        isLoading = true
        error = nil

        do {
            let request = CreateContactRequest(
                name: name,
                aliases: aliases.isEmpty ? nil : aliases,
                relationship: relationship,
                birthday: birthday,
                email: email,
                phone: phone,
                notes: notes,
                tags: tags.isEmpty ? nil : tags
            )

            let contact: Contact = try await apiClient.post("/api/contacts", body: request)

            // Add to local list
            contacts.insert(contact, at: 0)

            isLoading = false
            return contact
        } catch {
            self.error = "Failed to create contact: \(error.localizedDescription)"
            print("[ContactService] Create error: \(error)")
            isLoading = false
            return nil
        }
    }

    /// Get a single contact by ID (with agents)
    func getContact(id: String) async -> Contact? {
        do {
            let contact: Contact = try await apiClient.get("/api/contacts/\(id)")
            return contact
        } catch {
            print("[ContactService] Get contact error: \(error)")
            return nil
        }
    }

    /// Update an existing contact
    func updateContact(_ contact: Contact) async -> Bool {
        isLoading = true
        error = nil

        do {
            let request = UpdateContactRequest(
                name: contact.name,
                aliases: contact.aliases,
                relationship: contact.relationship,
                birthday: contact.birthday,
                email: contact.email,
                phone: contact.phone,
                notes: contact.notes,
                tags: contact.tags
            )

            let updated: Contact = try await apiClient.patch("/api/contacts/\(contact.id)", body: request)

            // Update local list
            if let index = contacts.firstIndex(where: { $0.id == contact.id }) {
                contacts[index] = updated
            }

            isLoading = false
            return true
        } catch {
            self.error = "Failed to update contact: \(error.localizedDescription)"
            print("[ContactService] Update error: \(error)")
            isLoading = false
            return false
        }
    }

    /// Delete a contact
    func deleteContact(id: String) async -> Bool {
        isLoading = true
        error = nil

        do {
            try await apiClient.delete("/api/contacts/\(id)")

            // Remove from local list
            contacts.removeAll { $0.id == id }

            isLoading = false
            return true
        } catch {
            self.error = "Failed to delete contact: \(error.localizedDescription)"
            print("[ContactService] Delete error: \(error)")
            isLoading = false
            return false
        }
    }

    // MARK: - Search

    /// Search contacts by name (fuzzy match including aliases)
    func searchContacts(query: String) async {
        guard !query.isEmpty else {
            searchResults = []
            return
        }

        do {
            let encodedQuery = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
            let response: ContactSearchResponse = try await apiClient.get("/api/contacts/search?q=\(encodedQuery)")
            searchResults = response.contacts
        } catch {
            print("[ContactService] Search error: \(error)")
            searchResults = []
        }
    }

    // MARK: - Agent Associations

    /// Associate a public agent with a contact
    func associateAgent(
        contactId: String,
        publicAgentId: String,
        agentName: String,
        agentEmoji: String?,
        role: String? = nil,
        discoveredVia: String? = nil
    ) async -> ContactAgent? {
        do {
            let request = AssociateAgentRequest(
                publicAgentId: publicAgentId,
                agentName: agentName,
                agentEmoji: agentEmoji,
                role: role,
                discoveredVia: discoveredVia
            )

            let agent: ContactAgent = try await apiClient.post("/api/contacts/\(contactId)/agents", body: request)

            // Update local contact's agents array
            if let index = contacts.firstIndex(where: { $0.id == contactId }) {
                if contacts[index].agents == nil {
                    contacts[index].agents = []
                }
                contacts[index].agents?.append(agent)
            }

            return agent
        } catch {
            self.error = "Failed to associate agent: \(error.localizedDescription)"
            print("[ContactService] Associate agent error: \(error)")
            return nil
        }
    }

    /// Remove an agent association from a contact
    func removeAgentAssociation(contactId: String, agentId: String) async -> Bool {
        do {
            try await apiClient.delete("/api/contacts/\(contactId)/agents/\(agentId)")

            // Update local contact's agents array
            if let index = contacts.firstIndex(where: { $0.id == contactId }) {
                contacts[index].agents?.removeAll { $0.publicAgentId == agentId }
            }

            return true
        } catch {
            self.error = "Failed to remove agent: \(error.localizedDescription)"
            print("[ContactService] Remove agent error: \(error)")
            return false
        }
    }

    /// Get all agents associated with a contact
    func getContactAgents(contactId: String) async -> [ContactAgent] {
        do {
            let agents: [ContactAgent] = try await apiClient.get("/api/contacts/\(contactId)/agents")
            return agents
        } catch {
            print("[ContactService] Get agents error: \(error)")
            return []
        }
    }

    // MARK: - Helpers

    /// Get contacts that have a specific tag
    func contactsWithTag(_ tag: String) -> [Contact] {
        contacts.filter { $0.tags.contains(tag) }
    }

    /// Get all unique tags across contacts
    var allTags: [String] {
        Array(Set(contacts.flatMap { $0.tags })).sorted()
    }

    /// Find contacts by relationship type
    func contactsByRelationship(_ relationship: String) -> [Contact] {
        contacts.filter { $0.relationship == relationship }
    }

    /// Clear any error state
    func clearError() {
        error = nil
    }
}

// MARK: - APIClient Extensions

extension APIClient {
    func patch<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var request = URLRequest(url: URL(string: baseURL + path)!)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = AuthService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200...299:
            break
        case 401:
            let refreshed = await AuthService.shared.refreshAccessToken()
            if refreshed {
                return try await patch(path, body: body)
            }
            throw APIError.unauthorized
        case 404:
            throw APIError.notFound
        case 500...599:
            throw APIError.serverError
        default:
            throw APIError.unknown(httpResponse.statusCode)
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(T.self, from: data)
    }
}
