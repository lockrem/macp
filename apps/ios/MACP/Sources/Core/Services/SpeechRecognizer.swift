import Foundation
import Speech
import AVFoundation

/// Handles speech-to-text transcription using iOS Speech framework
@MainActor
class SpeechRecognizer: ObservableObject {
    @Published var transcript = ""
    @Published var isAvailable = false
    @Published var isSilent = false

    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))

    // Silence detection
    private var silenceTimer: Timer?
    private let silenceThreshold: TimeInterval = 1.5
    var onSilenceDetected: (() -> Void)?

    init() {
        checkPermissions()
    }

    private func checkPermissions() {
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                self?.isAvailable = status == .authorized
            }
        }
    }

    func startTranscribing() {
        guard let speechRecognizer = speechRecognizer, speechRecognizer.isAvailable else {
            print("[Speech] Speech recognizer not available")
            return
        }

        #if os(iOS)
        do {
            let audioSession = AVAudioSession.sharedInstance()
            // Use playAndRecord to allow TTS to play while recording
            try audioSession.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth, .duckOthers])
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            print("[Speech] Failed to configure audio session: \(error)")
        }
        #endif

        do {
            audioEngine = AVAudioEngine()
            guard let audioEngine = audioEngine else { return }

            let inputNode = audioEngine.inputNode
            recognitionRequest = SFSpeechAudioBufferRecognitionRequest()

            guard let recognitionRequest = recognitionRequest else { return }
            recognitionRequest.shouldReportPartialResults = true

            recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
                guard let self = self else { return }

                if let result = result {
                    DispatchQueue.main.async {
                        self.transcript = result.bestTranscription.formattedString
                        self.isSilent = false

                        // Reset silence timer on every transcript update
                        self.silenceTimer?.invalidate()
                        self.silenceTimer = Timer.scheduledTimer(withTimeInterval: self.silenceThreshold, repeats: false) { [weak self] _ in
                            DispatchQueue.main.async {
                                guard let self = self else { return }
                                self.isSilent = true
                                self.onSilenceDetected?()
                            }
                        }
                    }
                }

                if error != nil || result?.isFinal == true {
                    self.stopTranscribing()
                }
            }

            let recordingFormat = inputNode.outputFormat(forBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
                recognitionRequest.append(buffer)
            }

            audioEngine.prepare()
            try audioEngine.start()
            print("[Speech] Started transcribing")
        } catch {
            print("[Speech] Error starting transcription: \(error)")
        }
    }

    func stopTranscribing() {
        silenceTimer?.invalidate()
        silenceTimer = nil

        audioEngine?.stop()
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()

        audioEngine = nil
        recognitionRequest = nil
        recognitionTask = nil
        isSilent = false
    }

    func resetTranscript() {
        transcript = ""
    }
}
