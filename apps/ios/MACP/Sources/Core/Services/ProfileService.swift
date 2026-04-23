import Foundation
import SwiftUI

/// Service for fetching and updating the user's profile from the API
@MainActor
class ProfileService: ObservableObject {
    static let shared = ProfileService()

    @Published var profile: UserProfile?
    @Published var isLoading = false
    @Published var error: String?

    private let apiClient = APIClient.shared

    private init() {}

    // MARK: - Fetch Profile

    /// Fetch the user's profile (facts grouped by category)
    func fetchProfile() async {
        isLoading = true
        error = nil

        do {
            let result: UserProfile = try await apiClient.get("/api/profile")
            profile = result
        } catch {
            self.error = "Failed to load profile: \(error.localizedDescription)"
            print("[ProfileService] Fetch error: \(error)")
        }

        isLoading = false
    }

    // MARK: - Update Profile

    /// Update facts in a specific category
    func updateFacts(category: String, facts: [(key: String, value: String)]) async -> Bool {
        isLoading = true
        error = nil

        do {
            let request = UpdateProfileRequest(
                facts: facts.map { UpdateProfileFact(key: $0.key, value: $0.value) }
            )

            let response: UpdateProfileResponse = try await apiClient.patch("/api/profile/\(category)", body: request)
            profile = response.profile
            isLoading = false
            return true
        } catch {
            self.error = "Failed to update profile: \(error.localizedDescription)"
            print("[ProfileService] Update error: \(error)")
            isLoading = false
            return false
        }
    }

    // MARK: - Delete Fact

    /// Delete a specific fact from the profile
    func deleteFact(factId: String) async -> Bool {
        do {
            let response: DeleteFactResponse = try await apiClient.delete("/api/profile/facts/\(factId)")
            if response.success {
                profile = response.profile
            }
            return response.success
        } catch {
            self.error = "Failed to delete fact: \(error.localizedDescription)"
            print("[ProfileService] Delete error: \(error)")
            return false
        }
    }

    // MARK: - Helpers

    /// Get a specific section from the profile
    func section(for category: String) -> ProfileSection? {
        profile?.sections.first { $0.category == category }
    }

    /// Get a fact by key from any section
    func fact(forKey key: String) -> ProfileFact? {
        for section in profile?.sections ?? [] {
            if let fact = section.facts.first(where: { $0.key == key }) {
                return fact
            }
        }
        return nil
    }

    /// Quick summary of profile highlights
    var highlights: [String] {
        var items: [String] = []

        // Birthday
        if let birthday = fact(forKey: "birthday") {
            items.append("Birthday: \(birthday.displayValue)")
        }

        // Dietary restrictions (show first)
        if let dietary = section(for: "dietary"), let first = dietary.facts.first {
            items.append(first.displayValue)
        }

        // Wishlist count
        if let wishlist = section(for: "wishlist") {
            items.append("\(wishlist.facts.count) wishlist item\(wishlist.facts.count == 1 ? "" : "s")")
        }

        return items
    }
}

