import SwiftUI

/// Card prompting user to start introduction flow with an agent
struct IntroductionPromptCard: View {
    let agentName: String
    let agentEmoji: String
    let greeting: String?
    let totalQuestions: Int
    let accentColor: Color
    let isLoading: Bool
    let onStart: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(accentColor.opacity(0.15))
                        .frame(width: 48, height: 48)
                    Text(agentEmoji)
                        .font(.system(size: 24))
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Get to Know You")
                        .font(.headline)

                    Text("\(totalQuestions) quick questions")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let greeting = greeting {
                Text(greeting)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else if isLoading {
                HStack {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Loading...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 12) {
                Button(action: onStart) {
                    HStack {
                        Image(systemName: "bubble.left.and.bubble.right.fill")
                        Text("Let's Chat")
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(accentColor)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                Button(action: onSkip) {
                    Text("Skip")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 12)
                        .padding(.horizontal, 16)
                }
            }
        }
        .padding(.vertical, 8)
    }
}

/// Preview of an introduction question in agent settings
struct IntroductionQuestionPreview: View {
    let question: IntroductionQuestion
    let index: Int
    let accentColor: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Q\(index)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(accentColor)
                    .clipShape(Capsule())

                Spacer()

                HStack(spacing: 8) {
                    if !question.extractsMemory.isEmpty {
                        Image(systemName: "brain.head.profile")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if question.extractsRules {
                        Image(systemName: "heart.fill")
                            .font(.caption)
                            .foregroundStyle(.pink)
                    }
                }
            }

            Text(question.question)
                .font(.subheadline)

            if let followUp = question.followUp, !followUp.isEmpty {
                Text("→ \(followUp)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if !question.extractsMemory.isEmpty {
                HStack(spacing: 4) {
                    ForEach(question.extractsMemory.prefix(3), id: \.self) { category in
                        Text(category)
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color(.systemGray5))
                            .clipShape(Capsule())
                    }
                    if question.extractsMemory.count > 3 {
                        Text("+\(question.extractsMemory.count - 3)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}

/// Badge showing introduction completion status
struct IntroductionStatusBadge: View {
    let status: IntroductionState
    let accentColor: Color

    var statusText: String {
        switch status {
        case .notStarted: return "Not Started"
        case .inProgress: return "In Progress"
        case .completed: return "Completed"
        case .skipped: return "Skipped"
        }
    }

    var statusColor: Color {
        switch status {
        case .notStarted: return .secondary
        case .inProgress: return .orange
        case .completed: return .green
        case .skipped: return .secondary
        }
    }

    var statusIcon: String {
        switch status {
        case .notStarted: return "circle"
        case .inProgress: return "circle.lefthalf.filled"
        case .completed: return "checkmark.circle.fill"
        case .skipped: return "forward.fill"
        }
    }

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: statusIcon)
                .font(.caption)
            Text(statusText)
                .font(.caption)
        }
        .foregroundStyle(statusColor)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(statusColor.opacity(0.1))
        .clipShape(Capsule())
    }
}
