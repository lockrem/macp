import Foundation

@MainActor
class APIClient {
    static let shared = APIClient()

    // AWS Load Balancer URL - update this if you set up a custom domain
    // For local development, change these to http://localhost:3000 and ws://localhost:3000/ws
    let baseURL = "http://macp-d-Servi-hIptPoUsWsQu-466256938.us-east-1.elb.amazonaws.com"

    var wsURL: String {
        // Convert http(s) baseURL to ws(s) for WebSocket
        baseURL
            .replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://", with: "ws://")
        + "/ws"
    }

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        // Server sends camelCase (JavaScript convention)
        // Don't convert from snake_case
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        // Server expects camelCase (JavaScript convention)
        // Don't convert to snake_case
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    private init() {}

    // MARK: - GET Request

    func get<T: Decodable>(_ path: String) async throws -> T {
        return try await performRequest(path: path, method: "GET", body: nil as Empty?)
    }

    // MARK: - POST Request

    func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        return try await performRequest(path: path, method: "POST", body: body)
    }

    // MARK: - PUT Request

    func put<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        return try await performRequest(path: path, method: "PUT", body: body)
    }

    // MARK: - DELETE Request

    func delete(_ path: String) async throws {
        let _: Empty = try await performRequest(path: path, method: "DELETE", body: nil as Empty?)
    }

    // MARK: - Generic Request (for PATCH, etc.)

    func request<T: Decodable, B: Encodable>(_ path: String, method: String, body: B) async throws -> T {
        return try await performRequest(path: path, method: method, body: body)
    }

    // MARK: - Core Request Handler with Auto-Refresh

    private func performRequest<T: Decodable, B: Encodable>(
        path: String,
        method: String,
        body: B?,
        isRetry: Bool = false
    ) async throws -> T {
        let url = URL(string: "\(baseURL)\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = method

        if let body = body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        addAuthHeaders(&request)

        let (data, response) = try await URLSession.shared.data(for: request)

        // Check for 401 and attempt token refresh
        if let httpResponse = response as? HTTPURLResponse,
           httpResponse.statusCode == 401,
           !isRetry {
            // Try to refresh the token
            let refreshed = await AuthService.shared.refreshAccessToken()
            if refreshed {
                // Retry the request with new token
                return try await performRequest(path: path, method: method, body: body, isRetry: true)
            }
            // Refresh failed, throw unauthorized
            throw APIError.unauthorized
        }

        try validateResponse(response)
        return try decoder.decode(T.self, from: data)
    }

    // MARK: - Helpers

    private func addAuthHeaders(_ request: inout URLRequest) {
        // Send Bearer token for authentication
        if let token = AuthService.shared.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    private func validateResponse(_ response: URLResponse) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200...299:
            return
        case 401:
            throw APIError.unauthorized
        case 404:
            throw APIError.notFound
        case 500...599:
            throw APIError.serverError
        default:
            throw APIError.unknown(httpResponse.statusCode)
        }
    }
}

// Empty type for requests without body/response
private struct Empty: Codable {}

// MARK: - API Errors

enum APIError: LocalizedError {
    case invalidResponse
    case unauthorized
    case notFound
    case serverError
    case unknown(Int)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid server response"
        case .unauthorized:
            return "Please sign in again"
        case .notFound:
            return "Resource not found"
        case .serverError:
            return "Server error occurred"
        case .unknown(let code):
            return "Error: \(code)"
        }
    }
}
