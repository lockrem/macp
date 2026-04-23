import SwiftUI

/// Service to manage input mode preference (voice-first vs text-first)
@MainActor
class InputModeService: ObservableObject {
    static let shared = InputModeService()

    /// Available input modes
    enum InputMode: String, CaseIterable {
        case text = "text"
        case voice = "voice"

        var displayName: String {
            switch self {
            case .text: return "Type"
            case .voice: return "Talk"
            }
        }

        var icon: String {
            switch self {
            case .text: return "keyboard"
            case .voice: return "mic.fill"
            }
        }
    }

    /// Current input mode preference
    @Published var currentMode: InputMode {
        didSet {
            UserDefaults.standard.set(currentMode.rawValue, forKey: "inputMode")
        }
    }

    /// Whether to auto-start voice recording when entering conversations
    @Published var autoStartVoice: Bool {
        didSet {
            UserDefaults.standard.set(autoStartVoice, forKey: "autoStartVoice")
        }
    }

    private init() {
        // Load saved preference or default to text
        if let saved = UserDefaults.standard.string(forKey: "inputMode"),
           let mode = InputMode(rawValue: saved) {
            self.currentMode = mode
        } else {
            self.currentMode = .text
        }

        self.autoStartVoice = UserDefaults.standard.bool(forKey: "autoStartVoice")
    }

    /// Toggle between voice and text modes
    func toggle() {
        currentMode = currentMode == .text ? .voice : .text
    }
}

/// A toggle button for switching between input modes
struct InputModeToggle: View {
    @EnvironmentObject var inputModeService: InputModeService

    var body: some View {
        Button {
            inputModeService.toggle()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: inputModeService.currentMode.icon)
                Text(inputModeService.currentMode.displayName)
                    .font(.subheadline.weight(.medium))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(inputModeService.currentMode == .voice ? Color.red.opacity(0.15) : Color(.systemGray5))
            .foregroundStyle(inputModeService.currentMode == .voice ? .red : .primary)
            .clipShape(Capsule())
        }
    }
}

/// Compact toggle for toolbar use - shows what tapping will switch TO
struct InputModeToolbarToggle: View {
    @EnvironmentObject var inputModeService: InputModeService

    /// The mode that tapping will switch to
    private var targetMode: InputModeService.InputMode {
        inputModeService.currentMode == .text ? .voice : .text
    }

    var body: some View {
        Button {
            inputModeService.toggle()
        } label: {
            Image(systemName: targetMode.icon)
                .foregroundStyle(targetMode == .voice ? .red : .secondary)
        }
        .accessibilityLabel("Switch to \(targetMode.displayName.lowercased())")
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 20) {
        InputModeToggle()
        InputModeToolbarToggle()
    }
    .padding()
    .environmentObject(InputModeService.shared)
}
