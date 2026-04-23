import SwiftUI

/// Sheet for sharing a form via QR code
struct FormShareSheet: View {
    @Environment(\.dismiss) private var dismiss

    let form: SmartForm

    var formUrl: String {
        form.url ?? "https://macp.io/\(form.id)"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                // Form info
                VStack(spacing: 8) {
                    Image(systemName: "doc.text.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.accentColor)

                    Text(form.title)
                        .font(.title2)
                        .fontWeight(.semibold)

                    if let description = form.description {
                        Text(description)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                }
                .padding(.top, 20)

                // QR Code
                if form.isPublic {
                    QRCodeView(content: formUrl, size: 200)
                        .padding()
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .shadow(color: .black.opacity(0.1), radius: 10)

                    Text("Scan to fill out form")
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    // Copy link button
                    Button {
                        UIPasteboard.general.string = formUrl
                    } label: {
                        Label("Copy Link", systemImage: "doc.on.doc")
                            .font(.headline)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 12)
                            .background(Color.accentColor.opacity(0.1))
                            .foregroundColor(.accentColor)
                            .clipShape(Capsule())
                    }
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 40))
                            .foregroundColor(.secondary)

                        Text("Form is Private")
                            .font(.headline)

                        Text("Enable sharing to generate a QR code")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.vertical, 40)
                }

                Spacer()

                // Stats
                if form.isPublic {
                    HStack(spacing: 24) {
                        VStack {
                            Text("\(form.viewCount ?? 0)")
                                .font(.title2)
                                .fontWeight(.bold)
                            Text("Views")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }

                        Divider()
                            .frame(height: 40)

                        VStack {
                            Text("\(form.submissionCount ?? 0)")
                                .font(.title2)
                                .fontWeight(.bold)
                            Text("Responses")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.bottom, 20)
                }
            }
            .navigationTitle("Share Form")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - Preview

#Preview {
    FormShareSheet(
        form: SmartForm(
            id: "test123",
            title: "Patient Intake Form",
            description: "Please fill out before your appointment",
            isPublic: true,
            viewCount: 42,
            submissionCount: 12
        )
    )
}
