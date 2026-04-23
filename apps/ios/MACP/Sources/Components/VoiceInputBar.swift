import SwiftUI

/// A voice-first input bar with large tap-to-talk button
struct VoiceInputBar: View {
    @Binding var isRecording: Bool
    let isSpeaking: Bool
    let transcript: String
    let accentColor: Color
    let onToggleRecording: () -> Void
    let onSend: () -> Void
    let onStopSpeaking: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            // Transcript display when recording
            if isRecording || !transcript.isEmpty {
                Text(transcript.isEmpty ? "Listening..." : transcript)
                    .font(.subheadline)
                    .foregroundStyle(transcript.isEmpty ? .secondary : .primary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.horizontal)
            }

            HStack(spacing: 16) {
                // Stop speaking button
                if isSpeaking, let stopAction = onStopSpeaking {
                    Button {
                        stopAction()
                    } label: {
                        Image(systemName: "speaker.slash.fill")
                            .font(.system(size: 24))
                            .foregroundStyle(.white)
                            .frame(width: 50, height: 50)
                            .background(Color.orange)
                            .clipShape(Circle())
                    }
                }

                // Main voice button
                Button {
                    if isRecording && !transcript.isEmpty {
                        // Stop and send
                        onToggleRecording()
                        onSend()
                    } else {
                        onToggleRecording()
                    }
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: isRecording ? "stop.fill" : "mic.fill")
                            .font(.system(size: 32))
                        Text(isRecording ? "Tap to Send" : "Tap to Talk")
                            .font(.caption.weight(.medium))
                    }
                    .foregroundStyle(.white)
                    .frame(width: 100, height: 100)
                    .background(isRecording ? Color.red : accentColor)
                    .clipShape(Circle())
                    .shadow(color: (isRecording ? Color.red : accentColor).opacity(0.4), radius: 10, x: 0, y: 4)
                }
                .scaleEffect(isRecording ? 1.1 : 1.0)
                .animation(.spring(response: 0.3), value: isRecording)

                // Send button (shown when there's a transcript and not recording)
                if !transcript.isEmpty && !isRecording {
                    Button {
                        onSend()
                    } label: {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 24, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 50, height: 50)
                            .background(accentColor)
                            .clipShape(Circle())
                    }
                }
            }
        }
        .padding(.vertical, 16)
        .background(Color(.systemBackground))
    }
}

// Recording pulse animation
struct RecordingPulse: View {
    @State private var isPulsing = false

    var body: some View {
        Circle()
            .fill(Color.red.opacity(0.3))
            .scaleEffect(isPulsing ? 1.3 : 1.0)
            .opacity(isPulsing ? 0 : 0.6)
            .animation(
                Animation.easeInOut(duration: 1.0)
                    .repeatForever(autoreverses: false),
                value: isPulsing
            )
            .onAppear { isPulsing = true }
    }
}

// MARK: - Preview

#Preview("Idle") {
    VStack {
        Spacer()
        VoiceInputBar(
            isRecording: .constant(false),
            isSpeaking: false,
            transcript: "",
            accentColor: .blue,
            onToggleRecording: {},
            onSend: {},
            onStopSpeaking: nil
        )
    }
}

#Preview("Recording") {
    VStack {
        Spacer()
        VoiceInputBar(
            isRecording: .constant(true),
            isSpeaking: false,
            transcript: "I have a cough and sore throat...",
            accentColor: .blue,
            onToggleRecording: {},
            onSend: {},
            onStopSpeaking: nil
        )
    }
}

#Preview("With Transcript") {
    VStack {
        Spacer()
        VoiceInputBar(
            isRecording: .constant(false),
            isSpeaking: false,
            transcript: "I need to make an appointment for next week",
            accentColor: .cyan,
            onToggleRecording: {},
            onSend: {},
            onStopSpeaking: nil
        )
    }
}
