import Foundation
import AuthenticationServices

@MainActor
class AuthService: ObservableObject {
    static let shared = AuthService()

    @Published var isAuthenticated = false
    @Published var currentUser: User?
    @Published var accessToken: String?
    @Published var isLoading = false
    @Published var error: String?

    private var refreshToken: String?
    private var isRefreshing = false

    private init() {
        // Check for stored credentials on init
        loadStoredCredentials()
    }

    // MARK: - Apple Sign In

    func signInWithApple(credential: ASAuthorizationAppleIDCredential) async {
        isLoading = true
        error = nil

        do {
            guard let identityToken = credential.identityToken,
                  let tokenString = String(data: identityToken, encoding: .utf8) else {
                throw AuthError.invalidCredentials
            }

            // Extract user info (only available on first sign in)
            var userInfo: AppleUserInfo? = nil
            if let email = credential.email {
                userInfo = AppleUserInfo(
                    email: email,
                    firstName: credential.fullName?.givenName,
                    lastName: credential.fullName?.familyName
                )
            }

            // Exchange Apple token for server tokens
            let authResult = try await exchangeAppleToken(tokenString, user: userInfo)

            self.accessToken = authResult.accessToken
            self.refreshToken = authResult.refreshToken
            self.currentUser = authResult.user
            self.isAuthenticated = true

            // Store credentials securely
            saveCredentials(accessToken: authResult.accessToken, refreshToken: authResult.refreshToken, user: authResult.user)

            // Sync settings from server (API keys, agents)
            await SettingsSyncService.shared.syncFromServer()

        } catch {
            self.error = error.localizedDescription
            print("[Auth] Sign in failed: \(error)")
        }

        isLoading = false
    }

    func signOut() {
        accessToken = nil
        refreshToken = nil
        currentUser = nil
        isAuthenticated = false
        clearStoredCredentials()
    }

    // MARK: - Token Refresh

    /// Attempts to refresh the access token using the stored refresh token
    /// Returns true if refresh was successful, false otherwise
    func refreshAccessToken() async -> Bool {
        guard let refreshToken = refreshToken, !isRefreshing else {
            return false
        }

        isRefreshing = true
        defer { isRefreshing = false }

        do {
            let url = URL(string: "\(APIClient.shared.baseURL)/auth/refresh")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let body = ["refreshToken": refreshToken]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                print("[Auth] Token refresh failed - signing out")
                signOut()
                return false
            }

            let result = try JSONDecoder().decode(RefreshResult.self, from: data)
            self.accessToken = result.accessToken

            // Update stored access token
            KeychainHelper.save(key: "accessToken", value: result.accessToken)

            print("[Auth] Token refreshed successfully")
            return true
        } catch {
            print("[Auth] Token refresh error: \(error)")
            signOut()
            return false
        }
    }

    // MARK: - Token Exchange

    private func exchangeAppleToken(_ appleToken: String, user: AppleUserInfo? = nil) async throws -> AuthResult {
        let url = URL(string: "\(APIClient.shared.baseURL)/auth/apple")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Build request body
        var body: [String: Any] = ["identityToken": appleToken]
        if let user = user {
            body["user"] = [
                "email": user.email as Any,
                "firstName": user.firstName as Any,
                "lastName": user.lastName as Any,
            ]
        }

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.networkError
        }

        guard httpResponse.statusCode == 200 else {
            print("[Auth] Server returned status \(httpResponse.statusCode)")
            if let errorBody = String(data: data, encoding: .utf8) {
                print("[Auth] Error: \(errorBody)")
            }
            throw AuthError.serverError
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(AuthResult.self, from: data)
    }

    struct AppleUserInfo {
        let email: String?
        let firstName: String?
        let lastName: String?
    }

    // MARK: - Credential Storage

    private func loadStoredCredentials() {
        // Load from Keychain
        if let token = KeychainHelper.load(key: "accessToken") {
            self.accessToken = token
            self.refreshToken = KeychainHelper.load(key: "refreshToken")
            self.isAuthenticated = true

            // Load user data
            if let userData = KeychainHelper.load(key: "userData"),
               let data = userData.data(using: .utf8),
               let user = try? JSONDecoder().decode(User.self, from: data) {
                self.currentUser = user
            } else {
                // Create a default dev user if user data is missing (migration case)
                #if DEBUG
                self.currentUser = User(
                    id: "dev-user-default",
                    email: "developer@example.com",
                    displayName: "Developer",
                    avatarUrl: nil
                )
                #endif
            }

            // Sync settings from server in background
            Task {
                await SettingsSyncService.shared.syncFromServer()
            }
        }
    }

    private func saveCredentials(accessToken: String, refreshToken: String?, user: User) {
        KeychainHelper.save(key: "accessToken", value: accessToken)

        if let refreshToken = refreshToken {
            KeychainHelper.save(key: "refreshToken", value: refreshToken)
        }

        // Also save user data
        if let userData = try? JSONEncoder().encode(user),
           let userString = String(data: userData, encoding: .utf8) {
            KeychainHelper.save(key: "userData", value: userString)
        }
    }

    private func clearStoredCredentials() {
        KeychainHelper.delete(key: "accessToken")
        KeychainHelper.delete(key: "refreshToken")
        KeychainHelper.delete(key: "userData")
    }
}

// MARK: - Supporting Types

struct AuthResult: Codable {
    let accessToken: String
    let refreshToken: String?
    let user: User
}

struct RefreshResult: Codable {
    let accessToken: String
}

enum AuthError: LocalizedError {
    case invalidCredentials
    case serverError
    case networkError

    var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return "Invalid credentials"
        case .serverError:
            return "Server error occurred"
        case .networkError:
            return "Network connection failed"
        }
    }
}

