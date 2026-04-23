import SwiftUI
import AVFoundation

// MARK: - QR Scanner View

struct QRScannerView: View {
    @Environment(\.dismiss) var dismiss
    @StateObject private var scanner = QRScannerController()

    let onCodeScanned: (String) -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                // Camera preview
                CameraPreview(session: scanner.session)
                    .ignoresSafeArea()

                // Overlay
                VStack {
                    Spacer()

                    // Scan frame
                    ZStack {
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(Color.white, lineWidth: 3)
                            .frame(width: 250, height: 250)

                        // Corner accents
                        ScannerCorners()
                            .frame(width: 250, height: 250)
                    }

                    Spacer()

                    // Instructions
                    VStack(spacing: 8) {
                        Text("Scan Agent QR Code")
                            .font(.headline)
                            .foregroundStyle(.white)

                        Text("Point your camera at another user's agent QR code")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.8))
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .padding(.horizontal)
                    .padding(.bottom, 40)
                }

                // Permission denied view
                if scanner.permissionDenied {
                    permissionDeniedView
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.white.opacity(0.8))
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    Button {
                        scanner.toggleFlash()
                    } label: {
                        Image(systemName: scanner.isFlashOn ? "bolt.fill" : "bolt.slash")
                            .font(.title3)
                            .foregroundStyle(.white.opacity(0.8))
                    }
                }
            }
            .toolbarBackground(.hidden, for: .navigationBar)
            .onAppear {
                scanner.startScanning()
            }
            .onDisappear {
                scanner.stopScanning()
            }
            .onChange(of: scanner.scannedCode) { _, code in
                if let code = code {
                    // Haptic feedback
                    let generator = UINotificationFeedbackGenerator()
                    generator.notificationOccurred(.success)

                    // Let the callback handle dismissal
                    onCodeScanned(code)
                }
            }
        }
    }

    private var permissionDeniedView: some View {
        VStack(spacing: 20) {
            Image(systemName: "camera.fill")
                .font(.system(size: 50))
                .foregroundStyle(.secondary)

            Text("Camera Access Required")
                .font(.headline)

            Text("Please enable camera access in Settings to scan QR codes")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.bordered)
        }
        .padding(40)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .padding()
    }
}

// MARK: - Scanner Corners

private struct ScannerCorners: View {
    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            let cornerLength: CGFloat = 30
            let lineWidth: CGFloat = 4

            Path { path in
                // Top-left
                path.move(to: CGPoint(x: 0, y: cornerLength))
                path.addLine(to: CGPoint(x: 0, y: 0))
                path.addLine(to: CGPoint(x: cornerLength, y: 0))

                // Top-right
                path.move(to: CGPoint(x: size.width - cornerLength, y: 0))
                path.addLine(to: CGPoint(x: size.width, y: 0))
                path.addLine(to: CGPoint(x: size.width, y: cornerLength))

                // Bottom-right
                path.move(to: CGPoint(x: size.width, y: size.height - cornerLength))
                path.addLine(to: CGPoint(x: size.width, y: size.height))
                path.addLine(to: CGPoint(x: size.width - cornerLength, y: size.height))

                // Bottom-left
                path.move(to: CGPoint(x: cornerLength, y: size.height))
                path.addLine(to: CGPoint(x: 0, y: size.height))
                path.addLine(to: CGPoint(x: 0, y: size.height - cornerLength))
            }
            .stroke(Color.blue, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        }
    }
}

// MARK: - Camera Preview

private struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.backgroundColor = .black
        view.session = session
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {
        // PreviewView handles its own layout
    }

    // Custom UIView that properly handles preview layer sizing
    class PreviewView: UIView {
        var session: AVCaptureSession? {
            didSet {
                guard let session = session else { return }
                previewLayer.session = session
            }
        }

        private lazy var previewLayer: AVCaptureVideoPreviewLayer = {
            let layer = AVCaptureVideoPreviewLayer()
            layer.videoGravity = .resizeAspectFill
            self.layer.addSublayer(layer)
            return layer
        }()

        override func layoutSubviews() {
            super.layoutSubviews()
            previewLayer.frame = bounds
        }
    }
}

// MARK: - QR Scanner Controller

@MainActor
class QRScannerController: NSObject, ObservableObject {
    @Published var scannedCode: String?
    @Published var permissionDenied = false
    @Published var isFlashOn = false

    let session = AVCaptureSession()
    private var isConfigured = false

    func startScanning() {
        guard !isConfigured else {
            if !session.isRunning {
                DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                    self?.session.startRunning()
                }
            }
            return
        }

        checkPermission()
    }

    func stopScanning() {
        if session.isRunning {
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                self?.session.stopRunning()
            }
        }
    }

    func toggleFlash() {
        guard let device = AVCaptureDevice.default(for: .video),
              device.hasTorch else { return }

        do {
            try device.lockForConfiguration()
            device.torchMode = isFlashOn ? .off : .on
            isFlashOn.toggle()
            device.unlockForConfiguration()
        } catch {
            print("Flash toggle failed: \(error)")
        }
    }

    private func checkPermission() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureSession()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                Task { @MainActor in
                    if granted {
                        self?.configureSession()
                    } else {
                        self?.permissionDenied = true
                    }
                }
            }
        default:
            permissionDenied = true
        }
    }

    private func configureSession() {
        guard !isConfigured else { return }

        session.beginConfiguration()

        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device) else {
            session.commitConfiguration()
            return
        }

        if session.canAddInput(input) {
            session.addInput(input)
        }

        let output = AVCaptureMetadataOutput()
        if session.canAddOutput(output) {
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]
        }

        session.commitConfiguration()
        isConfigured = true

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.session.startRunning()
        }
    }
}

extension QRScannerController: AVCaptureMetadataOutputObjectsDelegate {
    nonisolated func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let code = object.stringValue else { return }

        Task { @MainActor in
            if scannedCode == nil {
                scannedCode = code
            }
        }
    }
}

// MARK: - Preview

#Preview {
    QRScannerView { code in
        print("Scanned: \(code)")
    }
}
