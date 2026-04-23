import SwiftUI

/// View for listing and viewing form submissions
struct FormSubmissionsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var formService: FormService

    let form: SmartForm

    @State private var submissions: [FormSubmission] = []
    @State private var selectedSubmission: FormSubmission?
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && submissions.isEmpty {
                    ProgressView("Loading responses...")
                } else if submissions.isEmpty {
                    emptyState
                } else {
                    listView
                }
            }
            .navigationTitle("Responses")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .sheet(item: $selectedSubmission) { submission in
                SubmissionDetailView(form: form, submission: submission)
                    .environmentObject(formService)
            }
            .task {
                await loadSubmissions()
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "tray")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("No Responses Yet")
                .font(.headline)

            Text("When people submit this form, their responses will appear here.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var listView: some View {
        List {
            ForEach(submissions) { submission in
                Button {
                    selectedSubmission = submission
                } label: {
                    SubmissionRowView(submission: submission)
                }
                .buttonStyle(.plain)
            }
        }
        .listStyle(.plain)
        .refreshable {
            await loadSubmissions()
        }
    }

    private func loadSubmissions() async {
        isLoading = true
        error = nil

        do {
            submissions = try await formService.listSubmissions(formId: form.id)
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }
}

// MARK: - Submission Row

struct SubmissionRowView: View {
    let submission: FormSubmission

    var body: some View {
        HStack(spacing: 12) {
            // Avatar
            ZStack {
                Circle()
                    .fill(Color.green.opacity(0.15))
                    .frame(width: 44, height: 44)

                Image(systemName: "person.fill")
                    .foregroundColor(.green)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(submission.respondentName ?? "Anonymous")
                    .font(.headline)

                if let email = submission.respondentEmail {
                    Text(email)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                if let submittedAt = submission.submittedAt {
                    Text(submittedAt, style: .relative)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Submission Detail View

struct SubmissionDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var formService: FormService

    let form: SmartForm
    let submission: FormSubmission

    @State private var fullSubmission: FormSubmission?
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            List {
                // Respondent info
                Section {
                    if let name = (fullSubmission ?? submission).respondentName {
                        HStack {
                            Text("Name")
                                .foregroundColor(.secondary)
                            Spacer()
                            Text(name)
                        }
                    }

                    if let email = (fullSubmission ?? submission).respondentEmail {
                        HStack {
                            Text("Email")
                                .foregroundColor(.secondary)
                            Spacer()
                            Text(email)
                        }
                    }

                    if let submittedAt = (fullSubmission ?? submission).submittedAt {
                        HStack {
                            Text("Submitted")
                                .foregroundColor(.secondary)
                            Spacer()
                            Text(submittedAt.formatted(date: .abbreviated, time: .shortened))
                        }
                    }
                } header: {
                    Text("Respondent")
                }

                // Responses
                if let responses = fullSubmission?.responses {
                    Section {
                        ForEach(responses) { response in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(response.fieldLabel)
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)

                                    Spacer()

                                    // Source indicator
                                    if response.source == .agent {
                                        Label("Auto-filled", systemImage: "cpu")
                                            .font(.caption2)
                                            .foregroundColor(.purple)
                                    }
                                }

                                Text(response.value)
                                    .font(.body)
                            }
                            .padding(.vertical, 4)
                        }
                    } header: {
                        Text("Responses")
                    }
                } else if isLoading {
                    Section {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                    }
                }
            }
            .navigationTitle("Response Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .task {
                await loadFullSubmission()
            }
        }
    }

    private func loadFullSubmission() async {
        isLoading = true

        do {
            fullSubmission = try await formService.getSubmission(formId: form.id, submissionId: submission.id)
        } catch {
            print("[FormSubmissionsView] Failed to load submission: \(error)")
        }

        isLoading = false
    }
}

// MARK: - Preview

#Preview {
    FormSubmissionsView(
        form: SmartForm(
            id: "test",
            title: "Patient Intake",
            fields: []
        )
    )
    .environmentObject(FormService.shared)
}
