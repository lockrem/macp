import SwiftUI
import UIKit
import CoreImage.CIFilterBuiltins

/// A view that displays a QR code for a given string
struct QRCodeView: View {
    let content: String
    let size: CGFloat
    let foregroundColor: Color
    let backgroundColor: Color

    init(
        content: String,
        size: CGFloat = 200,
        foregroundColor: Color = .black,
        backgroundColor: Color = .white
    ) {
        self.content = content
        self.size = size
        self.foregroundColor = foregroundColor
        self.backgroundColor = backgroundColor
    }

    var body: some View {
        if let image = generateQRCode() {
            Image(uiImage: image)
                .interpolation(.none)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
        } else {
            Rectangle()
                .fill(Color.gray.opacity(0.2))
                .frame(width: size, height: size)
                .overlay {
                    Image(systemName: "qrcode")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                }
        }
    }

    private func generateQRCode() -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()

        // Set the input message
        filter.setValue(content.data(using: .utf8), forKey: "inputMessage")

        // Set error correction level (H = high, about 30% can be restored)
        filter.setValue("H", forKey: "inputCorrectionLevel")

        guard let outputImage = filter.outputImage else {
            return nil
        }

        // Scale up the QR code (it's generated very small)
        let scaleX = size / outputImage.extent.size.width
        let scaleY = size / outputImage.extent.size.height
        let scaledImage = outputImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

        // Apply colors if not default black/white
        let coloredImage: CIImage
        if foregroundColor != .black || backgroundColor != .white {
            coloredImage = applyColors(to: scaledImage)
        } else {
            coloredImage = scaledImage
        }

        // Convert to UIImage
        guard let cgImage = context.createCGImage(coloredImage, from: coloredImage.extent) else {
            return nil
        }

        return UIImage(cgImage: cgImage)
    }

    private func applyColors(to image: CIImage) -> CIImage {
        // Create a color filter to replace black/white with custom colors
        let colorFilter = CIFilter.falseColor()
        colorFilter.inputImage = image
        colorFilter.color0 = CIColor(color: UIColor(foregroundColor))
        colorFilter.color1 = CIColor(color: UIColor(backgroundColor))

        return colorFilter.outputImage ?? image
    }
}

// MARK: - QR Code Card

/// A styled card containing a QR code with optional label and share button
struct QRCodeCard: View {
    let content: String
    let title: String
    let subtitle: String?
    let accentColor: Color
    let onShare: (() -> Void)?

    init(
        content: String,
        title: String,
        subtitle: String? = nil,
        accentColor: Color = .blue,
        onShare: (() -> Void)? = nil
    ) {
        self.content = content
        self.title = title
        self.subtitle = subtitle
        self.accentColor = accentColor
        self.onShare = onShare
    }

    var body: some View {
        VStack(spacing: 16) {
            // QR Code
            QRCodeView(content: content, size: 180)
                .padding(16)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.1), radius: 4, x: 0, y: 2)

            // Title
            VStack(spacing: 4) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)

                if let subtitle = subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
            }

            // Share Button
            if let onShare = onShare {
                Button(action: onShare) {
                    Label("Share", systemImage: "square.and.arrow.up")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 10)
                        .background(accentColor)
                        .clipShape(Capsule())
                }
            }
        }
        .padding(20)
        .background(Color(UIColor.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

// MARK: - Preview

#Preview("QR Code") {
    VStack(spacing: 32) {
        QRCodeView(content: "macp://agent/test-slug-abc123")

        QRCodeView(
            content: "macp://agent/test-slug-abc123",
            size: 150,
            foregroundColor: .blue,
            backgroundColor: .white
        )
    }
    .padding()
}

#Preview("QR Card") {
    QRCodeCard(
        content: "macp://agent/dr-smith-intake-abc123",
        title: "Dr. Smith's Intake Form",
        subtitle: "Scan to start your appointment intake",
        accentColor: .blue
    ) {
        print("Share tapped")
    }
    .padding()
    .background(Color(.systemGroupedBackground))
}
