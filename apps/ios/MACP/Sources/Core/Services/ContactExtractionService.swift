import Foundation

/// Service for extracting contact information from conversations
/// When users mention people with details like "Jane is my girlfriend, her birthday is March 15th",
/// this extracts the info and suggests creating/updating a contact
@MainActor
class ContactExtractionService: ObservableObject {
    static let shared = ContactExtractionService()

    private init() {}

    /// Analyzes a message to extract ALL people mentioned with contact-worthy information
    /// Returns array of extracted contacts (supports multiple people in one message)
    func extractContacts(
        from message: String,
        agentResponse: String,
        conversationContext: [String] = [],
        existingContacts: [Contact] = [],
        apiKey: String,
        provider: String = "anthropic"
    ) async -> [ExtractedContact] {
        let contextStr = conversationContext.suffix(5).joined(separator: "\n")

        // Build existing contacts section for matching
        let existingContactsSection = existingContacts.isEmpty ? "" : """

        EXISTING CONTACTS (check if any person mentioned matches these):
        \(existingContacts.map { contact in
            var desc = "- \(contact.name)"
            if !contact.aliases.isEmpty {
                desc += " (aliases: \(contact.aliases.joined(separator: ", ")))"
            }
            if let rel = contact.relationship {
                desc += " [relationship: \(rel)]"
            }
            return desc
        }.joined(separator: "\n"))

        If a person matches an existing contact, include their existingContactId so we can UPDATE their record.
        """

        let prompt = """
        Analyze this conversation to extract ALL people the user mentioned with personal information.

        EXTRACT when the user:
        - States ANY relationship ("Mary is my mother", "my friend Jake", "my coworker Lisa")
        - Shares contact info (email, phone, address)
        - Shares personal details (birthday, job, interests)
        - References someone they clearly know personally

        DO NOT extract:
        - Celebrities, public figures, historical figures
        - Fictional characters
        - Strangers with no personal connection ("some guy at the store")
        - The user themselves
        - Businesses or organizations
        \(existingContactsSection)

        Recent context:
        \(contextStr.isEmpty ? "(none)" : contextStr)

        User message: "\(message)"
        Agent response: "\(agentResponse)"

        IMPORTANT: Extract ALL people mentioned, not just one. Parents, siblings, multiple friends - get them all.

        Respond with JSON array (even if just one person):
        {
          "people": [
            {
              "name": "Person's name",
              "relationship": "mom|dad|parent|sibling|sister|brother|spouse|partner|girlfriend|boyfriend|friend|coworker|boss|child|son|daughter|other",
              "aliases": ["nicknames", "alternate names"],
              "birthday": "MM-DD or YYYY-MM-DD if mentioned",
              "email": "if mentioned",
              "phone": "if mentioned",
              "notes": "Any other details (job, interests, etc.)",
              "tags": ["family", "work", etc.],
              "isUpdate": false,
              "existingContactId": null,
              "existingContactName": null,
              "newInfo": "What new information was learned about this person",
              "confidence": "high|medium|low"
            }
          ]
        }

        If NO people with personal connections mentioned:
        {
          "people": []
        }

        Set isUpdate=true and include existingContactId/existingContactName if updating someone we already know.
        Set confidence based on how explicit the information is.

        JSON only:
        """

        do {
            let response = try await callLLM(prompt: prompt, apiKey: apiKey, provider: provider, maxTokens: 800)
            return parseMultipleContactsResponse(response, existingContacts: existingContacts)
        } catch {
            print("[ContactExtraction] Error: \(error)")
            return []
        }
    }

    /// Legacy single-contact extraction for backward compatibility
    func extractContact(
        from message: String,
        agentResponse: String,
        conversationContext: [String] = [],
        existingContacts: [Contact] = [],
        apiKey: String,
        provider: String = "anthropic"
    ) async -> ExtractedContact? {
        let contacts = await extractContacts(
            from: message,
            agentResponse: agentResponse,
            conversationContext: conversationContext,
            existingContacts: existingContacts,
            apiKey: apiKey,
            provider: provider
        )
        return contacts.first
    }

    /// Creates a Contact from extracted info
    func createContact(from extracted: ExtractedContact) -> Contact {
        return Contact(
            name: extracted.name,
            aliases: extracted.aliases,
            relationship: extracted.relationship,
            birthday: extracted.birthday,
            email: extracted.email,
            phone: extracted.phone,
            notes: extracted.notes,
            tags: extracted.tags
        )
    }

    // MARK: - Private

    private func callLLM(prompt: String, apiKey: String, provider: String, maxTokens: Int = 400) async throws -> String {
        switch provider {
        case "anthropic":
            return try await callAnthropic(prompt: prompt, apiKey: apiKey, maxTokens: maxTokens)
        case "openai":
            return try await callOpenAI(prompt: prompt, apiKey: apiKey, maxTokens: maxTokens)
        default:
            return try await callAnthropic(prompt: prompt, apiKey: apiKey, maxTokens: maxTokens)
        }
    }

    private func callAnthropic(prompt: String, apiKey: String, maxTokens: Int = 400) async throws -> String {
        guard let url = URL(string: "https://api.anthropic.com/v1/messages") else {
            throw ContactExtractionError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        let body: [String: Any] = [
            "model": "claude-sonnet-4-20250514",
            "max_tokens": maxTokens,
            "temperature": 0.1,
            "system": "You analyze conversations and extract contact information about people the user knows. Respond only with valid JSON.",
            "messages": [
                ["role": "user", "content": prompt]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await URLSession.shared.data(for: request)

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = json["content"] as? [[String: Any]],
              let firstContent = content.first,
              let text = firstContent["text"] as? String else {
            print("[ContactExtraction] Invalid Anthropic response: \(String(data: data, encoding: .utf8) ?? "nil")")
            throw ContactExtractionError.invalidResponse
        }

        return text
    }

    private func callOpenAI(prompt: String, apiKey: String, maxTokens: Int = 400) async throws -> String {
        guard let url = URL(string: "https://api.openai.com/v1/chat/completions") else {
            throw ContactExtractionError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "model": "gpt-4o",
            "max_tokens": maxTokens,
            "temperature": 0.1,
            "messages": [
                ["role": "system", "content": "You analyze conversations and extract contact information about people the user knows. Respond only with valid JSON."],
                ["role": "user", "content": prompt]
            ]
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await URLSession.shared.data(for: request)

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let choices = json["choices"] as? [[String: Any]],
              let firstChoice = choices.first,
              let message = firstChoice["message"] as? [String: Any],
              let content = message["content"] as? String else {
            print("[ContactExtraction] Invalid OpenAI response: \(String(data: data, encoding: .utf8) ?? "nil")")
            throw ContactExtractionError.invalidResponse
        }

        return content
    }

    private func parseMultipleContactsResponse(_ response: String, existingContacts: [Contact]) -> [ExtractedContact] {
        guard let jsonStart = response.firstIndex(of: "{"),
              let jsonEnd = response.lastIndex(of: "}") else {
            return []
        }

        let jsonString = String(response[jsonStart...jsonEnd])
        guard let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let people = json["people"] as? [[String: Any]] else {
            print("[ContactExtraction] Failed to parse multiple contacts response")
            return []
        }

        var results: [ExtractedContact] = []

        for person in people {
            guard let name = person["name"] as? String, !name.isEmpty else {
                continue
            }

            let relationship = person["relationship"] as? String
            let aliases = person["aliases"] as? [String] ?? []
            let birthday = person["birthday"] as? String
            let email = person["email"] as? String
            let phone = person["phone"] as? String
            let notes = person["notes"] as? String
            let tags = person["tags"] as? [String] ?? []
            let isUpdate = person["isUpdate"] as? Bool ?? false
            let existingContactId = person["existingContactId"] as? String
            let existingContactName = person["existingContactName"] as? String
            let newInfo = person["newInfo"] as? String
            let confidenceStr = person["confidence"] as? String ?? "medium"

            let confidence: ExtractedContact.Confidence
            switch confidenceStr {
            case "high": confidence = .high
            case "low": confidence = .low
            default: confidence = .medium
            }

            // Try to match with existing contacts if not already matched
            var matchedContactId = existingContactId
            var matchedContactName = existingContactName
            var shouldUpdate = isUpdate

            if matchedContactId == nil {
                // Try to find a matching existing contact by name or alias
                for existing in existingContacts {
                    let nameLower = name.lowercased()
                    if existing.name.lowercased() == nameLower ||
                       existing.aliases.contains(where: { $0.lowercased() == nameLower }) {
                        matchedContactId = existing.id
                        matchedContactName = existing.name
                        shouldUpdate = true
                        break
                    }
                }
            }

            results.append(ExtractedContact(
                name: name,
                relationship: relationship,
                aliases: aliases,
                birthday: birthday,
                email: email,
                phone: phone,
                notes: notes,
                tags: tags,
                isUpdate: shouldUpdate,
                existingContactId: matchedContactId,
                existingContactName: matchedContactName,
                newInfo: newInfo,
                confidence: confidence
            ))
        }

        print("[ContactExtraction] Extracted \(results.count) contacts: \(results.map { $0.name }.joined(separator: ", "))")
        return results
    }

    private func parseContactResponse(_ response: String) -> ExtractedContact? {
        guard let jsonStart = response.firstIndex(of: "{"),
              let jsonEnd = response.lastIndex(of: "}") else {
            return nil
        }

        let jsonString = String(response[jsonStart...jsonEnd])
        guard let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        guard let hasContact = json["hasContact"] as? Bool, hasContact else {
            return nil
        }

        guard let name = json["name"] as? String, !name.isEmpty else {
            return nil
        }

        let relationship = json["relationship"] as? String
        let aliases = json["aliases"] as? [String] ?? []
        let birthday = json["birthday"] as? String
        let email = json["email"] as? String
        let phone = json["phone"] as? String
        let notes = json["notes"] as? String
        let tags = json["tags"] as? [String] ?? []
        let matchesExisting = json["matchesExisting"] as? Bool ?? false
        let existingContactName = json["existingContactName"] as? String
        let confidenceStr = json["confidence"] as? String ?? "medium"

        let confidence: ExtractedContact.Confidence
        switch confidenceStr {
        case "high": confidence = .high
        case "low": confidence = .low
        default: confidence = .medium
        }

        return ExtractedContact(
            name: name,
            relationship: relationship,
            aliases: aliases,
            birthday: birthday,
            email: email,
            phone: phone,
            notes: notes,
            tags: tags,
            isUpdate: matchesExisting,
            existingContactId: nil,
            existingContactName: existingContactName,
            newInfo: nil,
            confidence: confidence
        )
    }
}

/// Extracted contact information before creating/updating a Contact
struct ExtractedContact {
    let name: String
    let relationship: String?
    let aliases: [String]
    let birthday: String?
    let email: String?
    let phone: String?
    let notes: String?
    let tags: [String]
    let isUpdate: Bool
    let existingContactId: String?
    let existingContactName: String?
    let newInfo: String?
    let confidence: Confidence

    enum Confidence {
        case high, medium, low
    }

    // Legacy compatibility
    var matchesExisting: Bool { isUpdate }

    /// Human-readable summary of what was extracted
    var summary: String {
        var parts: [String] = [name]
        if let rel = relationship {
            parts.append("(\(rel))")
        }
        return parts.joined(separator: " ")
    }

    /// Details to show in the suggestion banner
    var detailsSummary: String {
        var details: [String] = []
        if isUpdate {
            details.append("Update")
        }
        if let rel = relationship {
            details.append(rel.capitalized)
        }
        if let bday = birthday {
            details.append("Birthday: \(bday)")
        }
        if email != nil {
            details.append("Has email")
        }
        if phone != nil {
            details.append("Has phone")
        }
        if let info = newInfo, !info.isEmpty {
            details.append(info)
        }
        return details.isEmpty ? "New contact" : details.joined(separator: " • ")
    }

    /// Action description for the banner
    var actionDescription: String {
        if isUpdate {
            return "Update \(existingContactName ?? name)?"
        } else {
            return "Save \(name) as contact?"
        }
    }
}

enum ContactExtractionError: Error {
    case invalidURL
    case invalidResponse
}
