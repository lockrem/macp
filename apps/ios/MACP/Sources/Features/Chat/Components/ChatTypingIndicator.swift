import SwiftUI

// MARK: - Chat Typing Indicator

/// A reusable typing indicator with bouncing dots animation
struct ChatTypingIndicator: View {
    let agentEmoji: String?
    let agentName: String?
    let accentColor: Color

    var showAvatar: Bool = true

    @State private var animationPhase = 0

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            if showAvatar {
                avatar
            }

            VStack(alignment: .leading, spacing: 4) {
                if let name = agentName {
                    Text("\(name) is typing...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                dotsView
            }

            Spacer()
        }
        .padding(.leading, showAvatar ? 4 : 0)
        .onAppear {
            startAnimation()
        }
    }

    @ViewBuilder
    private var avatar: some View {
        ZStack {
            Circle()
                .fill(accentColor.opacity(0.15))
                .frame(width: 32, height: 32)
            Text(agentEmoji ?? "")
                .font(.system(size: 16))
        }
    }

    private var dotsView: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(accentColor.opacity(animationPhase == index ? 1.0 : 0.4))
                    .frame(width: 8, height: 8)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .shadow(color: .black.opacity(0.05), radius: 2)
    }

    private func startAnimation() {
        Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { _ in
            withAnimation(.easeInOut(duration: 0.2)) {
                animationPhase = (animationPhase + 1) % 3
            }
        }
    }
}

// MARK: - Simple Typing Dots (minimal version)

/// Just the dots, no avatar or name
struct TypingDots: View {
    let color: Color

    @State private var animating = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                    .offset(y: animating ? -4 : 4)
                    .animation(
                        .easeInOut(duration: 0.5)
                            .repeatForever()
                            .delay(Double(index) * 0.15),
                        value: animating
                    )
            }
        }
        .onAppear { animating = true }
    }
}

// MARK: - Preview

#Preview("With Avatar") {
    VStack {
        ChatTypingIndicator(
            agentEmoji: "",
            agentName: "Health Buddy",
            accentColor: .red
        )

        ChatTypingIndicator(
            agentEmoji: "",
            agentName: nil,
            accentColor: .blue
        )
    }
    .padding()
}

#Preview("Just Dots") {
    TypingDots(color: .secondary)
        .padding()
        .background(Color(.systemGray6))
        .clipShape(RoundedRectangle(cornerRadius: 12))
}
