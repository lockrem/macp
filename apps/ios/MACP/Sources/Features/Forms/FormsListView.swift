import SwiftUI

/// List of user's forms, displayed in Settings
struct FormsListView: View {
    @StateObject private var formService = FormService.shared
    @State private var showCreateForm = false
    @State private var selectedForm: SmartForm?

    var body: some View {
        List {
            if formService.isLoading && formService.forms.isEmpty {
                Section {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                }
            } else if formService.forms.isEmpty {
                Section {
                    emptyState
                }
            } else {
                Section {
                    ForEach(formService.forms) { form in
                        FormRowView(form: form) {
                            selectedForm = form
                        }
                    }
                    .onDelete(perform: deleteForms)
                } header: {
                    Text("Your Forms")
                } footer: {
                    Text("Tap a form to edit. Swipe to delete.")
                }
            }
        }
        .navigationTitle("Forms")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showCreateForm = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showCreateForm) {
            CreateFormSheet()
                .environmentObject(formService)
        }
        .sheet(item: $selectedForm) { form in
            FormEditorView(form: form)
                .environmentObject(formService)
        }
        .refreshable {
            await formService.fetchForms()
        }
        .task {
            if formService.forms.isEmpty {
                await formService.fetchForms()
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "doc.text")
                .font(.system(size: 48))
                .foregroundColor(.secondary)

            Text("No Forms Yet")
                .font(.headline)

            Text("Create forms to collect information from customers and clients.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button {
                showCreateForm = true
            } label: {
                Label("Create Form", systemImage: "plus")
                    .font(.headline)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Color.accentColor)
                    .foregroundColor(.white)
                    .clipShape(Capsule())
            }
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    private func deleteForms(at offsets: IndexSet) {
        for index in offsets {
            let form = formService.forms[index]
            Task {
                try? await formService.deleteForm(form.id)
            }
        }
    }
}

// MARK: - Form Row

struct FormRowView: View {
    let form: SmartForm
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Icon
                ZStack {
                    Circle()
                        .fill(Color.accentColor.opacity(0.15))
                        .frame(width: 44, height: 44)

                    Image(systemName: "doc.text.fill")
                        .font(.system(size: 18))
                        .foregroundColor(.accentColor)
                }

                // Info
                VStack(alignment: .leading, spacing: 2) {
                    Text(form.title)
                        .font(.headline)
                        .foregroundColor(.primary)

                    if let description = form.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }

                    // Stats
                    HStack(spacing: 12) {
                        Label("\(form.fieldCount ?? form.fields?.count ?? 0) fields", systemImage: "list.bullet")
                        Label("\(form.submissionCount ?? 0) responses", systemImage: "tray.full")
                    }
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Create Form Sheet

struct CreateFormSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var formService: FormService

    @State private var title = ""
    @State private var description = ""
    @State private var isCreating = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Form Title", text: $title)
                        .textContentType(.none)

                    TextField("Description (optional)", text: $description, axis: .vertical)
                        .lineLimit(2...4)
                } header: {
                    Text("Form Details")
                }

                if let error = error {
                    Section {
                        Text(error)
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("New Form")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        createForm()
                    }
                    .disabled(title.isEmpty || isCreating)
                }
            }
        }
    }

    private func createForm() {
        isCreating = true
        error = nil

        Task {
            do {
                _ = try await formService.createForm(
                    title: title.trimmingCharacters(in: .whitespaces),
                    description: description.isEmpty ? nil : description.trimmingCharacters(in: .whitespaces)
                )
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            isCreating = false
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        FormsListView()
    }
}
