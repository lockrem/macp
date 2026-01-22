import SwiftUI
import UIKit

struct ArchivesListView: View {
    @EnvironmentObject var archiveService: ArchiveService

    @State private var selectedArchive: Archive?
    @State private var showDeleteConfirmation = false
    @State private var archiveToDelete: Archive?

    var body: some View {
        NavigationStack {
            Group {
                if archiveService.isLoading && archiveService.archives.isEmpty {
                    ProgressView("Loading archives...")
                } else if archiveService.archives.isEmpty {
                    ContentUnavailableView(
                        "No Archives",
                        systemImage: "archivebox",
                        description: Text("Archive conversations to save them here")
                    )
                } else {
                    List {
                        ForEach(archiveService.archives) { archive in
                            ArchiveRow(archive: archive)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    selectedArchive = archive
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                    Button(role: .destructive) {
                                        archiveToDelete = archive
                                        showDeleteConfirmation = true
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                        }
                    }
                    .refreshable {
                        await archiveService.fetchArchives()
                    }
                }
            }
            .navigationTitle("Archives")
            .sheet(item: $selectedArchive) { archive in
                ArchiveDetailView(archive: archive)
                    .environmentObject(archiveService)
            }
            .alert("Delete Archive?", isPresented: $showDeleteConfirmation) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    if let archive = archiveToDelete {
                        Task {
                            _ = await archiveService.deleteArchive(archive.archiveId)
                        }
                    }
                }
            } message: {
                Text("This will permanently delete this archive.")
            }
            .task {
                await archiveService.fetchArchives()
            }
        }
    }
}

// MARK: - Archive Row

struct ArchiveRow: View {
    let archive: Archive

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(archive.topic)
                    .font(.headline)

                Spacer()

                Text(formattedDate)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let goal = archive.goal, !goal.isEmpty {
                Text(goal)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            HStack(spacing: 12) {
                // Participants
                HStack(spacing: 4) {
                    ForEach(archive.participants, id: \.agentName) { participant in
                        ArchiveParticipantChip(participant: participant)
                    }
                }

                Spacer()

                // Stats
                Label("\(archive.messageCount)", systemImage: "bubble.left.and.bubble.right")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Label("\(archive.totalTurns)", systemImage: "arrow.triangle.2.circlepath")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private var formattedDate: String {
        guard let date = archive.archivedDate else { return archive.archivedAt }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

// MARK: - Participant Chip

struct ArchiveParticipantChip: View {
    let participant: ArchiveParticipant

    var providerColor: Color {
        switch participant.provider {
        case "anthropic": return .orange
        case "openai": return .green
        case "gemini": return .blue
        case "groq": return .purple
        default: return .gray
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(providerColor)
                .frame(width: 8, height: 8)
            Text(participant.agentName)
                .font(.caption)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(providerColor.opacity(0.1))
        .clipShape(Capsule())
    }
}

// MARK: - Archive Detail View

struct ArchiveDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var archiveService: ArchiveService

    let archive: Archive

    @State private var transcript: ArchiveTranscript?
    @State private var isLoading = true
    @State private var copiedToClipboard = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading transcript...")
                } else if let transcript = transcript {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 16) {
                            // Metadata Header
                            VStack(alignment: .leading, spacing: 8) {
                                if let goal = transcript.metadata.goal, !goal.isEmpty {
                                    Text("Goal: \(goal)")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }

                                HStack {
                                    Label(transcript.metadata.status.capitalized, systemImage: statusIcon)
                                    Spacer()
                                    Text("\(transcript.metadata.totalTurns) turns")
                                }
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }
                            .padding()
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 12))

                            // Messages
                            ForEach(transcript.messages) { message in
                                ArchiveMessageBubble(message: message)
                            }
                        }
                        .padding()
                    }
                } else {
                    ContentUnavailableView(
                        "Failed to Load",
                        systemImage: "exclamationmark.triangle",
                        description: Text(archiveService.error ?? "Unknown error")
                    )
                }
            }
            .navigationTitle(archive.topic)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button("Copy as Markdown", systemImage: "doc.on.doc") {
                            if let transcript = transcript {
                                UIPasteboard.general.string = generateMarkdown(transcript)
                                copiedToClipboard = true
                            }
                        }

                        Button("Copy as JSON", systemImage: "curlybraces") {
                            if let transcript = transcript,
                               let data = try? JSONEncoder().encode(transcript),
                               let json = String(data: data, encoding: .utf8) {
                                UIPasteboard.general.string = json
                                copiedToClipboard = true
                            }
                        }
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
            }
            .overlay {
                if copiedToClipboard {
                    Label("Copied to Clipboard", systemImage: "checkmark.circle.fill")
                        .padding()
                        .background(.regularMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .transition(.scale.combined(with: .opacity))
                        .onAppear {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                                withAnimation {
                                    copiedToClipboard = false
                                }
                            }
                        }
                }
            }
            .task {
                transcript = await archiveService.getTranscript(archive.archiveId)
                isLoading = false
            }
        }
    }

    private var statusIcon: String {
        switch archive.status {
        case "completed": return "checkmark.circle"
        case "paused": return "pause.circle"
        case "cancelled": return "xmark.circle"
        default: return "circle"
        }
    }

    private func generateMarkdown(_ transcript: ArchiveTranscript) -> String {
        var md = "# \(transcript.metadata.topic)\n\n"

        if let goal = transcript.metadata.goal, !goal.isEmpty {
            md += "**Goal:** \(goal)\n\n"
        }

        let participants = transcript.metadata.participants.map { $0.agentName }.joined(separator: ", ")
        md += "**Participants:** \(participants)\n"
        md += "**Status:** \(transcript.metadata.status.capitalized)\n"
        md += "**Turns:** \(transcript.metadata.totalTurns)\n\n"
        md += "---\n\n"

        for message in transcript.messages {
            let timestamp = message.timestampDate.map {
                let formatter = DateFormatter()
                formatter.dateStyle = .short
                formatter.timeStyle = .short
                return formatter.string(from: $0)
            } ?? message.timestamp

            md += "**\(message.agentName)** (Turn \(message.turnNumber)) - \(timestamp)\n\n"
            md += "\(message.content)\n\n"
            md += "---\n\n"
        }

        md += "\n*Exported from MACP Archives*"
        return md
    }
}

// MARK: - Archive Message Bubble

struct ArchiveMessageBubble: View {
    let message: TranscriptMessage

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Circle()
                    .fill(providerColor.gradient)
                    .frame(width: 32, height: 32)
                    .overlay {
                        Text(message.agentName.prefix(1))
                            .font(.caption.bold())
                            .foregroundColor(.white)
                    }

                VStack(alignment: .leading) {
                    Text(message.agentName)
                        .font(.subheadline.bold())
                    Text("Turn \(message.turnNumber)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if let date = message.timestampDate {
                    Text(date, style: .time)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Text(message.content)
                .font(.body)
                .padding()
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var providerColor: Color {
        switch message.provider {
        case "anthropic": return .orange
        case "openai": return .green
        case "gemini": return .blue
        case "groq": return .purple
        default: return .gray
        }
    }
}

#Preview {
    ArchivesListView()
        .environmentObject(ArchiveService.shared)
}
