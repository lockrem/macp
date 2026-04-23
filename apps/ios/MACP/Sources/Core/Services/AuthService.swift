import Foundation
import AuthenticationServices

@MainActor
class AuthService: ObservableObject {
    static let shared = AuthService()

    @Published var isAuthenticated = false
    @Published var isAuthReady = false  // True when auth state is fully resolved (including any needed refresh)
    @Published var currentUser: User?
    @Published var accessToken: String?
    @Published var isLoading = false
    @Published var error: String?

    private var refreshToken: String?
    private var refreshTask: Task<Bool, Never>?

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
        isAuthReady = true  // Auth is resolved, just not logged in
        clearStoredCredentials()
    }

    // MARK: - Token Refresh

    /// Attempts to refresh the access token using the stored refresh token
    /// Returns true if refresh was successful, false otherwise
    /// Multiple concurrent calls will share the same refresh operation
    func refreshAccessToken() async -> Bool {
        // If a refresh is already in progress, wait for it to complete
        if let existingTask = refreshTask {
            print("[Auth] Token refresh already in progress - waiting for it to complete")
            return await existingTask.value
        }

        guard let refreshToken = refreshToken else {
            print("[Auth] No refresh token available - cannot refresh")
            return false
        }

        print("[Auth] Attempting to refresh access token...")

        // Capture refreshToken before creating the task
        let tokenToRefresh = refreshToken

        // Create a new refresh task that other callers can await
        let task = Task<Bool, Never> { [weak self] in
            guard let self = self else { return false }

            do {
                let url = URL(string: "\(APIClient.shared.baseURL)/auth/refresh")!
                var request = URLRequest(url: url)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")

                let body = ["refreshToken": tokenToRefresh]
                request.httpBody = try JSONSerialization.data(withJSONObject: body)

                let (data, response) = try await URLSession.shared.data(for: request)

                guard let httpResponse = response as? HTTPURLResponse else {
                    print("[Auth] Token refresh - invalid response")
                    return false
                }

                switch httpResponse.statusCode {
                case 200:
                    let result = try JSONDecoder().decode(RefreshResult.self, from: data)
                    print("[Auth] Got new token: \(result.accessToken.prefix(30))...")
                    await MainActor.run {
                        self.accessToken = result.accessToken
                        print("[Auth] Token updated in AuthService")
                    }
                    // Update stored access token
                    KeychainHelper.save(key: "accessToken", value: result.accessToken)
                    print("[Auth] Token refreshed successfully")
                    return true
                case 401, 403:
                    // Actual auth failure - token is invalid, sign out
                    print("[Auth] Token refresh failed with \(httpResponse.statusCode) - signing out")
                    await MainActor.run {
                        self.signOut()
                    }
                    return false
                default:
                    // Server error or other issue - don't sign out, just fail this request
                    print("[Auth] Token refresh failed with status \(httpResponse.statusCode)")
                    return false
                }
            } catch let urlError as URLError {
                // Network error - don't sign out, might be temporary
                print("[Auth] Token refresh network error: \(urlError.localizedDescription)")
                return false
            } catch {
                print("[Auth] Token refresh error: \(error)")
                return false
            }
        }

        refreshTask = task
        let result = await task.value
        refreshTask = nil  // Clear the task after completion
        return result
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

        // Server returns camelCase keys, so no conversion needed
        return try JSONDecoder().decode(AuthResult.self, from: data)
    }

    struct AppleUserInfo {
        let email: String?
        let firstName: String?
        let lastName: String?
    }

    // MARK: - Credential Storage

    private func loadStoredCredentials() {
        print("[Auth] loadStoredCredentials called")
        // Load from Keychain
        if let token = KeychainHelper.load(key: "accessToken") {
            print("[Auth] Found access token")
            self.accessToken = token
            self.refreshToken = KeychainHelper.load(key: "refreshToken")

            print("[Auth] Loaded stored credentials - accessToken: \(token.prefix(20))..., refreshToken: \(refreshToken != nil ? "present" : "MISSING")")

            // Check if token is expired before setting authenticated
            if isTokenExpired(token) {
                print("[Auth] Access token is expired, attempting refresh...")
                // Try to refresh before setting authenticated - don't show UI until ready
                Task {
                    if await refreshAccessToken() {
                        await MainActor.run {
                            self.isAuthenticated = true
                            self.isAuthReady = true
                        }
                    } else {
                        print("[Auth] Token refresh failed, user needs to sign in again")
                        await MainActor.run {
                            self.signOut()
                            self.isAuthReady = true  // Auth is ready, just not authenticated
                        }
                    }
                }
                return
            }

            self.isAuthenticated = true
            self.isAuthReady = true

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
        } else {
            // No stored credentials - user needs to sign in
            print("[Auth] No stored credentials found")
            self.isAuthReady = true
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

    /// Check if a JWT token is expired by decoding the payload
    private func isTokenExpired(_ token: String) -> Bool {
        // JWT format: header.payload.signature
        let parts = token.split(separator: ".")
        guard parts.count == 3 else { return true }

        // Decode the payload (base64url encoded)
        var base64 = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")

        // Pad to multiple of 4
        while base64.count % 4 != 0 {
            base64.append("=")
        }

        guard let data = Data(base64Encoded: base64),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let exp = json["exp"] as? TimeInterval else {
            return true
        }

        let expirationDate = Date(timeIntervalSince1970: exp)
        let isExpired = expirationDate < Date()

        if isExpired {
            print("[Auth] Token expired at: \(expirationDate)")
        }

        return isExpired
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

