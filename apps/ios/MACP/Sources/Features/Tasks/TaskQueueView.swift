import SwiftUI

/// View displaying an agent's task queue with status and summaries
struct TaskQueueView: View {
    @EnvironmentObject var agentStorage: AgentStorageService
    @Environment(\.dismiss) var dismiss

    let agent: LocalAgent

    @State private var selectedFilter: TaskFilter = .all

    enum TaskFilter: String, CaseIterable {
        case all = "All"
        case pending = "Pending"
        case active = "Active"
        case completed = "Completed"
    }

    private var filteredTasks: [AgentTask] {
        switch selectedFilter {
        case .all:
            return agent.tasks.sorted { $0.createdAt > $1.createdAt }
        case .pending:
            return agent.pendingTasks.sorted { $0.createdAt > $1.createdAt }
        case .active:
            return agent.activeTasks.sorted { $0.createdAt > $1.createdAt }
        case .completed:
            return agent.completedTasks.sorted { ($0.completedAt ?? $0.createdAt) > ($1.completedAt ?? $1.createdAt) }
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Filter picker
                Picker("Filter", selection: $selectedFilter) {
                    ForEach(TaskFilter.allCases, id: \.self) { filter in
                        Text(filter.rawValue).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .padding()

                if filteredTasks.isEmpty {
                    emptyStateView
                } else {
                    taskList
                }
            }
            .navigationTitle("Task Queue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: "checklist")
                .font(.system(size: 60))
                .foregroundStyle(.secondary)

            Text(emptyStateMessage)
                .font(.headline)
                .foregroundStyle(.secondary)

            Text(emptyStateSubtitle)
                .font(.subheadline)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Spacer()
        }
    }

    private var emptyStateMessage: String {
        switch selectedFilter {
        case .all:
            return "No Tasks Yet"
        case .pending:
            return "No Pending Tasks"
        case .active:
            return "No Active Tasks"
        case .completed:
            return "No Completed Tasks"
        }
    }

    private var emptyStateSubtitle: String {
        switch selectedFilter {
        case .all, .pending:
            return "Tell \(agent.name) what you need done, like \"I need reservations for 4 at 5:30 PM\""
        case .active:
            return "Tasks become active when a matching opportunity is found"
        case .completed:
            return "Completed tasks will appear here with summaries"
        }
    }

    private var taskList: some View {
        List {
            ForEach(filteredTasks) { task in
                TaskRowView(task: task, agentName: agent.name)
                    .swipeActions(edge: .trailing) {
                        if task.status == .pending {
                            Button(role: .destructive) {
                                cancelTask(task)
                            } label: {
                                Label("Cancel", systemImage: "xmark")
                            }
                        }
                    }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func cancelTask(_ task: AgentTask) {
        var updatedAgent = agent
        if let index = updatedAgent.tasks.firstIndex(where: { $0.id == task.id }) {
            updatedAgent.tasks[index].cancel()
            agentStorage.updateAgent(updatedAgent)
        }
    }
}

// MARK: - Task Row View

struct TaskRowView: View {
    let task: AgentTask
    let agentName: String

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header row
            HStack(alignment: .top, spacing: 12) {
                // Category icon
                Image(systemName: task.category.icon)
                    .font(.title3)
                    .foregroundStyle(statusColor)
                    .frame(width: 32)

                VStack(alignment: .leading, spacing: 4) {
                    // Task description
                    Text(task.description)
                        .font(.body)
                        .foregroundStyle(.primary)

                    // Status and metadata
                    HStack(spacing: 8) {
                        TaskStatusBadge(status: task.status)

                        Text(task.category.displayName)
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Spacer()

                        Text(timeAgo(task.createdAt))
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            // Expanded content for completed tasks
            if task.status == .completed, let summary = task.summary {
                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    if let hostName = task.hostAgentName {
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                            Text("Completed with \(hostName)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Text(summary)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(12)
                        .background(Color(UIColor.secondarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .padding(.leading, 44)
            }
        }
        .padding(.vertical, 4)
    }

    private var statusColor:
    Color {
        switch task.status {
        case .needsConfirmation:
            return .yellow
        case .pending:
            return .orange
        case .active:
            return .blue
        case .completed:
            return .green
        case .cancelled:
            return .secondary
        }
    }

    private func timeAgo(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Status Badge

struct TaskStatusBadge: View {
    let status: AgentTask.TaskStatus

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(statusColor)
                .frame(width: 6, height: 6)

            Text(statusText)
                .font(.caption2)
                .fontWeight(.medium)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(statusColor.opacity(0.15))
        .clipShape(Capsule())
    }

    private var statusColor: Color {
        switch status {
        case .needsConfirmation:
            return .yellow
        case .pending:
            return .orange
        case .active:
            return .blue
        case .completed:
            return .green
        case .cancelled:
            return .secondary
        }
    }

    private var statusText: String {
        switch status {
        case .needsConfirmation:
            return "Confirm"
        case .pending:
            return "Pending"
        case .active:
            return "Active"
        case .completed:
            return "Completed"
        case .cancelled:
            return "Cancelled"
        }
    }
}

// MARK: - Preview

#Preview {
    let agent = LocalAgent(
        name: "Personal Assistant",
        tasks: [
            AgentTask(
                description: "Make reservations for 4 at 5:30 PM tonight",
                keywords: ["restaurant", "reservation", "dining"],
                category: .restaurant,
                status: .pending
            ),
            AgentTask(
                description: "Find out about gluten allergy advancements",
                keywords: ["health", "allergy", "gluten", "research"],
                category: .health,
                status: .pending
            ),
            {
                var task = AgentTask(
                    description: "Check real estate market in Longwood Florida",
                    keywords: ["real estate", "property", "market", "Longwood"],
                    category: .realEstate,
                    status: .completed
                )
                task.complete(
                    summary: "The Longwood FL market is currently strong with a 5% YoY increase in home values. Median home price is $425,000. Inventory is low with homes selling in an average of 21 days.",
                    hostAgentName: "Longwood Realty Agent"
                )
                return task
            }()
        ]
    )

    TaskQueueView(agent: agent)
        .environmentObject(AgentStorageService.shared)
}
