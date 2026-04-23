import Foundation
import AVFoundation

/// Service for text-to-speech using ElevenLabs API
@MainActor
class ElevenLabsService: NSObject, ObservableObject, AVAudioPlayerDelegate {
    static let shared = ElevenLabsService()

    @Published var isSpeaking = false
    @Published var isLoading = false

    private var audioPlayer: AVAudioPlayer?
    private var apiKey: String?

    // Message queue for sequential playback
    private var messageQueue: [(text: String, voiceId: String, speed: Double)] = []
    private var isProcessingQueue = false

    // Continuation for waiting on playback completion
    private var playbackContinuation: CheckedContinuation<Void, Never>?

    // Default voice settings (nonisolated for use in default parameters)
    nonisolated static let defaultVoiceId = "21m00Tcm4TlvDq8ikWAM" // Rachel
    nonisolated static let defaultSpeed: Double = 1.0

    /// Whether TTS is available (API key is configured)
    var isAvailable: Bool {
        apiKey != nil && !apiKey!.isEmpty
    }

    // Popular ElevenLabs voices with character descriptions
    nonisolated static let availableVoices: [(id: String, name: String, description: String)] = [
        ("21m00Tcm4TlvDq8ikWAM", "Rachel", "Professional female voice"),
        ("AZnzlk1XvdvUeBnXmlld", "Domi", "Strong female voice"),
        ("EXAVITQu4vr4xnSDxMaL", "Bella", "Soft female voice"),
        ("ErXwobaYiN019PkySvjV", "Antoni", "Well-rounded male voice"),
        ("MF3mGyEYCl7XYWbV9V6O", "Elli", "Emotional female voice"),
        ("TxGEqnHWrfWFTfGW9XjX", "Josh", "Young American male"),
        ("VR6AewLTigWG4xSOukaG", "Arnold", "Crisp American male"),
        ("pNInz6obpgDQGcFmaJgB", "Adam", "Deep American male"),
        ("yoZ06aMxZJJ28mfd3POQ", "Sam", "Raspy American male"),
        ("jBpfuIE2acCO8z3wKNLl", "Gigi", "Childlike American female"),
        ("oWAxZDx7w5VEj9dCyTzz", "Grace", "Gentle American female"),
        ("onwK4e9ZLuTAKqWW03F9", "Daniel", "British male voice"),
        ("g5CIjZEefAph4nQFvHAz", "Ethan", "Smooth male narration"),
    ]

    private override init() {
        super.init()
        configureAudioSession()
        loadApiKey()
    }

    /// Loads the API key from Secrets.plist in the app bundle
    private func loadApiKey() {
        // Try to load from Secrets.plist
        if let secretsPath = Bundle.main.path(forResource: "Secrets", ofType: "plist"),
           let secrets = NSDictionary(contentsOfFile: secretsPath),
           let key = secrets["ElevenLabsAPIKey"] as? String,
           !key.isEmpty {
            self.apiKey = key
            print("[ElevenLabs] API key loaded from Secrets.plist")
            return
        }

        // Try environment variable (for development)
        if let key = ProcessInfo.processInfo.environment["ELEVENLABS_API_KEY"], !key.isEmpty {
            self.apiKey = key
            print("[ElevenLabs] API key loaded from environment")
            return
        }

        print("[ElevenLabs] No API key found - TTS disabled")
    }

    private func configureAudioSession() {
        #if os(iOS)
        do {
            let session = AVAudioSession.sharedInstance()
            // Use playAndRecord to allow both TTS playback and speech recognition
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
        } catch {
            print("[ElevenLabs] Failed to configure audio session: \(error)")
        }
        #endif
    }

    /// Ensures audio session is configured for playback
    func prepareForPlayback() {
        #if os(iOS)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
        } catch {
            print("[ElevenLabs] Failed to prepare for playback: \(error)")
        }
        #endif
    }

    func setApiKey(_ key: String) {
        self.apiKey = key
    }

    /// Queues text to be spoken using ElevenLabs TTS
    /// Messages are played sequentially in order
    /// - Parameters:
    ///   - text: The text to speak
    ///   - voiceId: ElevenLabs voice ID (default: Rachel)
    ///   - speed: Speech speed 0.75-1.25 (default: 1.0)
    func speak(
        _ text: String,
        voiceId: String = defaultVoiceId,
        speed: Double = defaultSpeed
    ) async {
        guard let apiKey = apiKey, !apiKey.isEmpty else {
            print("[ElevenLabs] No API key configured")
            return
        }

        // Add to queue
        messageQueue.append((text: text, voiceId: voiceId, speed: speed))
        print("[ElevenLabs] Queued message, queue size: \(messageQueue.count)")

        // Process queue if not already processing
        if !isProcessingQueue {
            await processQueue()
        }
    }

    /// Processes queued messages sequentially
    private func processQueue() async {
        guard !isProcessingQueue else { return }
        isProcessingQueue = true
        isSpeaking = true

        while !messageQueue.isEmpty {
            let message = messageQueue.removeFirst()
            await speakNow(message.text, voiceId: message.voiceId, speed: message.speed)
        }

        isProcessingQueue = false
        isSpeaking = false
        print("[ElevenLabs] Queue complete, isSpeaking = false")
    }

    /// Immediately speaks text, waiting for completion
    private func speakNow(
        _ text: String,
        voiceId: String,
        speed: Double
    ) async {
        guard let apiKey = apiKey else { return }

        // Ensure audio session is ready
        prepareForPlayback()

        isLoading = true
        defer { isLoading = false }

        let url = URL(string: "https://api.elevenlabs.io/v1/text-to-speech/\(voiceId)")!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "xi-api-key")

        let body: [String: Any] = [
            "text": text,
            "model_id": "eleven_turbo_v2_5",
            "voice_settings": [
                "stability": 0.5,
                "similarity_boost": 0.75,
                "speed": speed
            ]
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                print("[ElevenLabs] Invalid response")
                return
            }

            if httpResponse.statusCode != 200 {
                let errorText = String(data: data, encoding: .utf8) ?? "Unknown error"
                print("[ElevenLabs] API error \(httpResponse.statusCode): \(errorText)")
                return
            }

            // Play the audio and wait for completion
            audioPlayer = try AVAudioPlayer(data: data)
            audioPlayer?.delegate = self
            audioPlayer?.prepareToPlay()
            audioPlayer?.play()

            print("[ElevenLabs] Playing audio...")

            // Wait for playback to complete
            await withCheckedContinuation { continuation in
                self.playbackContinuation = continuation
            }

            print("[ElevenLabs] Playback complete")

        } catch {
            print("[ElevenLabs] Error: \(error)")
        }
    }

    func stop() {
        // Clear the queue
        messageQueue.removeAll()
        isProcessingQueue = false

        // Stop current playback
        audioPlayer?.stop()
        audioPlayer = nil
        isSpeaking = false

        // Resume any waiting continuation
        playbackContinuation?.resume()
        playbackContinuation = nil
    }

    // MARK: - AVAudioPlayerDelegate

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            // Resume continuation to allow next message in queue (or complete the queue)
            self.playbackContinuation?.resume()
            self.playbackContinuation = nil
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: (any Error)?) {
        print("[ElevenLabs] Decode error: \(error?.localizedDescription ?? "unknown")")
        Task { @MainActor in
            self.playbackContinuation?.resume()
            self.playbackContinuation = nil
        }
    }
}
