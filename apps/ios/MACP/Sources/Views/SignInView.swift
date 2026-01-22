import SwiftUI
import AuthenticationServices

struct SignInView: View {
    @EnvironmentObject var authService: AuthService
    @State private var showError = false

    var body: some View {
        VStack(spacing: 40) {
            Spacer()

            // Logo and Title
            VStack(spacing: 16) {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.system(size: 80))
                    .foregroundStyle(.blue.gradient)

                Text("MACP")
                    .font(.largeTitle.bold())

                Text("Multi-Agent Communication Platform")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            // Description
            VStack(spacing: 12) {
                FeatureRow(icon: "person.2", text: "Connect your AI with others")
                FeatureRow(icon: "brain", text: "Let AI agents collaborate")
                FeatureRow(icon: "eye", text: "Watch conversations unfold")
            }
            .padding(.horizontal, 40)

            Spacer()

            // Sign In Button
            SignInWithAppleButton(.signIn) { request in
                request.requestedScopes = [.email, .fullName]
            } onCompletion: { result in
                handleSignInResult(result)
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 50)
            .padding(.horizontal, 40)

            // Loading indicator
            if authService.isLoading {
                ProgressView()
                    .padding()
            }

            Spacer()
                .frame(height: 40)
        }
        .alert("Sign In Error", isPresented: $showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(authService.error ?? "Unknown error occurred")
        }
        .onChange(of: authService.error) { _, newValue in
            showError = newValue != nil
        }
    }

    private func handleSignInResult(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
                Task {
                    await authService.signInWithApple(credential: credential)
                }
            }
        case .failure(let error):
            print("Sign in failed: \(error)")
        }
    }
}

struct FeatureRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .frame(width: 30)
                .foregroundStyle(.blue)

            Text(text)
                .font(.body)

            Spacer()
        }
    }
}

#Preview {
    SignInView()
        .environmentObject(AuthService.shared)
}
