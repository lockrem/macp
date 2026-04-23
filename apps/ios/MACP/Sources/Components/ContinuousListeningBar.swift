import SwiftUI

/// A minimal always-listening interface for continuous voice conversations
/// No big button - just shows listening state and transcript
struct ContinuousListeningBar: View {
    @Binding var isRecording: Bool
    let isSpeaking: Bool
    let transcript: String
    let accentColor: Color
    let onStopSpeaking: (() -> Void)?
    let onSendManually: (() -> Void)?  // For manual send if needed

    var body: some View {
        VStack(spacing: 8) {
            // Transcript display
            if !transcript.isEmpty {
                HStack {
                    Text(transcript)
                        .font(.body)
                        .foregroundStyle(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    // Manual send button
                    if let sendAction = onSendManually {
                        Button {
                            sendAction()
                        } label: {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 28))
                                .foregroundStyle(accentColor)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color(UIColor.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal)
            }

            // Status bar
            HStack(spacing: 12) {
                // Speaking indicator / stop button
                if isSpeaking {
                    Button {
                        onStopSpeaking?()
                    } label: {
                        HStack(spacing: 6) {
                            SpeakingWaveform(color: accentColor)
                                .frame(width: 24, height: 16)
                            Text("Speaking...")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 16))
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(accentColor.opacity(0.1))
                        .clipShape(Capsule())
                    }
                }
                // Listening indicator
                else if isRecording {
                    HStack(spacing: 6) {
                        ListeningIndicator()
                            .frame(width: 12, height: 12)
                        Text(transcript.isEmpty ? "Listening..." : "Listening")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.red.opacity(0.1))
                    .clipShape(Capsule())
                }
                // Idle - waiting
                else if transcript.isEmpty {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color.secondary.opacity(0.3))
                            .frame(width: 8, height: 8)
                        Text("Ready")
                            .font(.subheadline)
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }

                Spacer()
            }
            .padding(.horizontal)
        }
        .padding(.vertical, 12)
        .background(Color(UIColor.systemBackground))
    }
}

/// Animated listening indicator - pulsing red dot
struct ListeningIndicator: View {
    @State private var isPulsing = false

    var body: some View {
        ZStack {
            // Outer pulse
            Circle()
                .fill(Color.red.opacity(0.3))
                .scaleEffect(isPulsing ? 1.8 : 1.0)
                .opacity(isPulsing ? 0 : 0.6)

            // Inner solid dot
            Circle()
                .fill(Color.red)
        }
        .onAppear {
            withAnimation(
                .easeInOut(duration: 1.0)
                .repeatForever(autoreverses: false)
            ) {
                isPulsing = true
            }
        }
    }
}

/// Animated speaking waveform
struct SpeakingWaveform: View {
    let color: Color
    @State private var animating = false

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<4, id: \.self) { index in
                Capsule()
                    .fill(color)
                    .frame(width: 3)
                    .scaleEffect(y: animating ? 1.0 : 0.3, anchor: .center)
                    .animation(
                        .easeInOut(duration: 0.4)
                        .repeatForever(autoreverses: true)
                        .delay(Double(index) * 0.1),
                        value: animating
                    )
            }
        }
        .onAppear { animating = true }
    }
}

// MARK: - Preview

#Preview("Listening") {
    VStack {
        Spacer()
        ContinuousListeningBar(
            isRecording: .constant(true),
            isSpeaking: false,
            transcript: "",
            accentColor: .orange,
            onStopSpeaking: nil,
            onSendManually: nil
        )
    }
}

#Preview("Listening with Transcript") {
    VStack {
        Spacer()
        ContinuousListeningBar(
            isRecording: .constant(true),
            isSpeaking: false,
            transcript: "I'd like to make a reservation for two people...",
            accentColor: .orange,
            onStopSpeaking: nil,
            onSendManually: {}
        )
    }
}

#Preview("Speaking") {
    VStack {
        Spacer()
        ContinuousListeningBar(
            isRecording: .constant(false),
            isSpeaking: true,
            transcript: "",
            accentColor: .orange,
            onStopSpeaking: {},
            onSendManually: nil
        )
    }
}

#Preview("Ready") {
    VStack {
        Spacer()
        ContinuousListeningBar(
            isRecording: .constant(false),
            isSpeaking: false,
            transcript: "",
            accentColor: .orange,
            onStopSpeaking: nil,
            onSendManually: nil
        )
    }
}
