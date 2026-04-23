import SwiftUI

// MARK: - Chat Input Bar

/// A reusable chat input bar with text field and send button
struct ChatInputBar: View {
    @Binding var text: String
    let placeholder: String
    let accentColor: Color
    let isEnabled: Bool
    let isSpeaking: Bool
    let onSend: () -> Void
    let onStopSpeaking: (() -> Void)?

    @FocusState private var isInputFocused: Bool

    init(
        text: Binding<String>,
        placeholder: String = "Type a message...",
        accentColor: Color = .blue,
        isEnabled: Bool = true,
        isSpeaking: Bool = false,
        onSend: @escaping () -> Void,
        onStopSpeaking: (() -> Void)? = nil
    ) {
        self._text = text
        self.placeholder = placeholder
        self.accentColor = accentColor
        self.isEnabled = isEnabled
        self.isSpeaking = isSpeaking
        self.onSend = onSend
        self.onStopSpeaking = onStopSpeaking
    }

    var body: some View {
        HStack(spacing: 12) {
            // Text input
            TextField(placeholder, text: $text, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 24))
                .focused($isInputFocused)
                .toolbar {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Done") {
                            isInputFocused = false
                        }
                    }
                }

            // Send button
            Button {
                onSend()
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(text.isEmpty || !isEnabled ? Color.secondary : accentColor)
            }
            .disabled(text.isEmpty || !isEnabled)

            // Stop speaking button (optional)
            if isSpeaking, let stopAction = onStopSpeaking {
                Button {
                    stopAction()
                } label: {
                    Image(systemName: "speaker.slash.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(.red)
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(Color(.systemGroupedBackground))
    }
}

// MARK: - Chat Input Bar with Voice

/// Input bar that includes voice input capability
struct ChatInputBarWithVoice: View {
    @Binding var text: String
    let placeholder: String
    let accentColor: Color
    let isEnabled: Bool
    let isSpeaking: Bool
    let isRecording: Bool
    let onSend: () -> Void
    let onToggleRecording: () -> Void
    let onStopSpeaking: (() -> Void)?

    @FocusState private var isInputFocused: Bool

    var body: some View {
        HStack(spacing: 12) {
            // Voice input button
            Button {
                onToggleRecording()
            } label: {
                Image(systemName: isRecording ? "mic.fill" : "mic")
                    .font(.system(size: 22))
                    .foregroundStyle(isRecording ? .red : .secondary)
                    .frame(width: 44, height: 44)
                    .background(isRecording ? Color.red.opacity(0.1) : Color.clear)
                    .clipShape(Circle())
            }
            .accessibilityLabel(isRecording ? "Stop recording" : "Start voice input")

            // Text input
            TextField(placeholder, text: $text, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color(.systemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 24))
                .focused($isInputFocused)
                .overlay(
                    Group {
                        if isRecording {
                            HStack {
                                Spacer()
                                RecordingWaveform()
                                    .padding(.trailing, 12)
                            }
                        }
                    }
                )
                .toolbar {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Done") {
                            isInputFocused = false
                        }
                    }
                }

            // Send button
            Button {
                onSend()
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(text.isEmpty || !isEnabled ? Color.secondary : accentColor)
            }
            .disabled(text.isEmpty || !isEnabled)
            .accessibilityLabel("Send message")

            // Stop speaking button
            if isSpeaking, let stopAction = onStopSpeaking {
                Button {
                    stopAction()
                } label: {
                    Image(systemName: "speaker.slash.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(.red)
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(Color(.systemGroupedBackground))
    }
}

// MARK: - Recording Waveform Animation

struct RecordingWaveform: View {
    @State private var animating = false

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<4) { index in
                Capsule()
                    .fill(Color.red)
                    .frame(width: 3, height: animating ? CGFloat.random(in: 8...20) : 8)
                    .animation(
                        Animation.easeInOut(duration: 0.3)
                            .repeatForever()
                            .delay(Double(index) * 0.1),
                        value: animating
                    )
            }
        }
        .onAppear { animating = true }
        .onDisappear { animating = false }
    }
}

// MARK: - Preview

#Preview("Basic Input") {
    VStack {
        Spacer()
        ChatInputBar(
            text: .constant("Hello"),
            accentColor: .blue,
            isEnabled: true,
            isSpeaking: false,
            onSend: {}
        )
    }
}

#Preview("With Voice") {
    VStack {
        Spacer()
        ChatInputBarWithVoice(
            text: .constant(""),
            placeholder: "Type or speak...",
            accentColor: .blue,
            isEnabled: true,
            isSpeaking: false,
            isRecording: false,
            onSend: {},
            onToggleRecording: {},
            onStopSpeaking: nil
        )
    }
}
