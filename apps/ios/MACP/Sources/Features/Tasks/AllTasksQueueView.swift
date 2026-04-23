import SwiftUI

/// View displaying tasks from ALL agents combined
struct AllTasksQueueView: View {
    @EnvironmentObject var agentStorage: AgentStorageService
    @Environment(\.dismiss) var dismiss

    @State private var selectedFilter: TaskFilter = .pending
    @State private var showAddTask = false
    @State private var selectedAgentForTask: LocalAgent?

    enum TaskFilter: String, CaseIterable {
        case pending = "Pending"
        case active = "Active"
        case completed = "Completed"
    }

    /// All tasks from all agents with their agent info
    private var allTasksWithAgents: [(task: AgentTask, agent: LocalAgent)] {
        agentStorage.agents.flatMap { agent in
            agent.tasks.map { (task: $0, agent: agent) }
        }
    }

    private var filteredTasks: [(task: AgentTask, agent: LocalAgent)] {
        let filtered: [(task: AgentTask, agent: LocalAgent)]
        switch selectedFilter {
        case .pending:
            // Include both pending and needsConfirmation tasks in "Pending" view
            filtered = allTasksWithAgents.filter { $0.task.status == .pending || $0.task.status == .needsConfirmation }
        case .active:
            filtered = allTasksWithAgents.filter { $0.task.status == .active }
        case .completed:
            filtered = allTasksWithAgents.filter { $0.task.status == .completed }
        }
        return filtered.sorted { $0.task.createdAt > $1.task.createdAt }
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

                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        ForEach(agentStorage.agents) { agent in
                            Button {
                                selectedAgentForTask = agent
                                showAddTask = true
                            } label: {
                                Label("\(agent.emoji) \(agent.name)", systemImage: "plus")
                            }
                        }
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                    .disabled(agentStorage.agents.isEmpty)
                }
            }
            .sheet(isPresented: $showAddTask) {
                if let agent = selectedAgentForTask {
                    AddTaskView(agent: agent)
                        .environmentObject(agentStorage)
                }
            }
        }
    }

    private var pendingCount: Int {
        allTasksWithAgents.filter { $0.task.status == .pending || $0.task.status == .needsConfirmation }.count
    }

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Spacer()

            Image(systemName: selectedFilter == .pending ? "checklist" : "checkmark.circle")
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

            if selectedFilter == .pending && !agentStorage.agents.isEmpty {
                Button {
                    selectedAgentForTask = agentStorage.agents.first
                    showAddTask = true
                } label: {
                    Label("Add a Task", systemImage: "plus")
                        .font(.headline)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(Color.orange)
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                }
                .padding(.top, 8)
            }

            Spacer()
        }
    }

    private var emptyStateMessage: String {
        switch selectedFilter {
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
        case .pending:
            return "Add tasks like \"Make reservations for 4 at 5:30 PM\" and your agents will find opportunities to complete them"
        case .active:
            return "Tasks become active when a matching opportunity is found"
        case .completed:
            return "Completed tasks will appear here with summaries"
        }
    }

    private var taskList: some View {
        List {
            ForEach(filteredTasks, id: \.task.id) { item in
                NavigationLink {
                    TaskDetailView(task: item.task, agent: item.agent)
                        .environmentObject(agentStorage)
                } label: {
                    TaskRowWithAgentView(task: item.task, agent: item.agent)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        deleteTask(item.task, from: item.agent)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }

                    if item.task.status == .pending || item.task.status == .needsConfirmation {
                        Button {
                            cancelTask(item.task, from: item.agent)
                        } label: {
                            Label("Cancel", systemImage: "xmark")
                        }
                        .tint(.orange)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func cancelTask(_ task: AgentTask, from agent: LocalAgent) {
        var updatedAgent = agent
        if let index = updatedAgent.tasks.firstIndex(where: { $0.id == task.id }) {
            updatedAgent.tasks[index].cancel()
            agentStorage.updateAgent(updatedAgent)
        }
    }

    private func deleteTask(_ task: AgentTask, from agent: LocalAgent) {
        var updatedAgent = agent
        updatedAgent.tasks.removeAll { $0.id == task.id }
        agentStorage.updateAgent(updatedAgent)
    }
}

// MARK: - Task Row with Agent Info

struct TaskRowWithAgentView: View {
    let task: AgentTask
    let agent: LocalAgent

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header with agent info
            HStack(spacing: 8) {
                Text(agent.emoji)
                    .font(.title3)

                VStack(alignment: .leading, spacing: 2) {
                    Text(task.description)
                        .font(.body)
                        .foregroundStyle(.primary)
                        .lineLimit(2)

                    HStack(spacing: 8) {
                        // Agent name
                        Text(agent.name)
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Text("•")
                            .foregroundStyle(.tertiary)

                        // Category
                        Label(task.category.displayName, systemImage: task.category.icon)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                TaskStatusBadge(status: task.status)
            }

            // Summary for completed tasks
            if task.status == .completed, let summary = task.summary {
                Text(summary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(8)
                    .background(Color(UIColor.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Task Detail View

struct TaskDetailView: View {
    @EnvironmentObject var agentStorage: AgentStorageService
    @Environment(\.dismiss) var dismiss

    let task: AgentTask
    let agent: LocalAgent

    @State private var isEditing = false
    @State private var showDeleteConfirmation = false

    // Edit state
    @State private var editedDescription: String = ""
    @State private var editedCategory: AgentTask.TaskCategory = .other
    @State private var editedKeywords: String = ""

    var body: some View {
        List {
            // Task Info Section
            Section {
                HStack(spacing: 12) {
                    Text(agent.emoji)
                        .font(.largeTitle)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(agent.name)
                            .font(.headline)
                        Text("Assigned Agent")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
            }

            // Description Section
            Section("Task Description") {
                if isEditing {
                    TextField("What do you need done?", text: $editedDescription, axis: .vertical)
                        .lineLimit(3...6)
                } else {
                    Text(task.description)
                        .font(.body)
                }
            }

            // Category Section
            Section("Category") {
                if isEditing {
                    Picker("Category", selection: $editedCategory) {
                        ForEach(AgentTask.TaskCategory.allCases, id: \.self) { category in
                            Label(category.displayName, systemImage: category.icon)
                                .tag(category)
                        }
                    }
                } else {
                    Label(task.category.displayName, systemImage: task.category.icon)
                        .font(.body)
                }
            }

            // Keywords Section
            Section {
                if isEditing {
                    TextField("Additional keywords (comma separated)", text: $editedKeywords)
                } else if !task.keywords.isEmpty {
                    FlowLayout(spacing: 8) {
                        ForEach(task.keywords, id: \.self) { keyword in
                            Text(keyword)
                                .font(.caption)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.orange.opacity(0.2))
                                .foregroundStyle(.orange)
                                .clipShape(Capsule())
                        }
                    }
                } else {
                    Text("No keywords")
                        .foregroundStyle(.secondary)
                }
            } header: {
                Text("Keywords")
            } footer: {
                Text("Keywords help match this task with relevant agents")
            }

            // Status Section
            Section("Status") {
                HStack {
                    TaskStatusBadge(status: task.status)
                    Spacer()
                    Text(statusDescription)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                // Created date
                HStack {
                    Text("Created")
                    Spacer()
                    Text(task.createdAt, style: .relative)
                        .foregroundStyle(.secondary)
                }

                // Completed date if applicable
                if let completedAt = task.completedAt {
                    HStack {
                        Text("Completed")
                        Spacer()
                        Text(completedAt, style: .relative)
                            .foregroundStyle(.secondary)
                    }
                }

                // Host agent if applicable
                if let hostName = task.hostAgentName {
                    HStack {
                        Text("Completed with")
                        Spacer()
                        Text(hostName)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Summary Section (for completed tasks)
            if task.status == .completed, let summary = task.summary {
                Section("Completion Summary") {
                    Text(summary)
                        .font(.body)
                }
            }

            // Actions Section
            if !isEditing {
                Section {
                    if task.status == .pending || task.status == .needsConfirmation {
                        Button {
                            cancelTask()
                        } label: {
                            Label("Cancel Task", systemImage: "xmark.circle")
                                .foregroundStyle(.orange)
                        }
                    }

                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        Label("Delete Task", systemImage: "trash")
                    }
                }
            }
        }
        .navigationTitle("Task Details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if isEditing {
                    Button("Save") {
                        saveChanges()
                    }
                    .disabled(editedDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } else if task.status == .pending || task.status == .needsConfirmation {
                    Button("Edit") {
                        startEditing()
                    }
                }
            }

            if isEditing {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        isEditing = false
                    }
                }
            }
        }
        .alert("Delete Task?", isPresented: $showDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                deleteTask()
            }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("This action cannot be undone.")
        }
    }

    private var statusDescription: String {
        switch task.status {
        case .needsConfirmation:
            return "Waiting for your confirmation"
        case .pending:
            return "Looking for opportunities"
        case .active:
            return "Currently being worked on"
        case .completed:
            return "Task finished"
        case .cancelled:
            return "Task was cancelled"
        }
    }

    private func startEditing() {
        editedDescription = task.description
        editedCategory = task.category
        editedKeywords = task.keywords.joined(separator: ", ")
        isEditing = true
    }

    private func saveChanges() {
        var updatedAgent = agent
        if let index = updatedAgent.tasks.firstIndex(where: { $0.id == task.id }) {
            updatedAgent.tasks[index].description = editedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
            updatedAgent.tasks[index].category = editedCategory
            updatedAgent.tasks[index].keywords = editedKeywords
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
            agentStorage.updateAgent(updatedAgent)
        }
        isEditing = false
    }

    private func cancelTask() {
        var updatedAgent = agent
        if let index = updatedAgent.tasks.firstIndex(where: { $0.id == task.id }) {
            updatedAgent.tasks[index].cancel()
            agentStorage.updateAgent(updatedAgent)
        }
        dismiss()
    }

    private func deleteTask() {
        var updatedAgent = agent
        updatedAgent.tasks.removeAll { $0.id == task.id }
        agentStorage.updateAgent(updatedAgent)
        dismiss()
    }
}

// MARK: - Add Task View

struct AddTaskView: View {
    @EnvironmentObject var agentStorage: AgentStorageService
    @Environment(\.dismiss) var dismiss

    let agent: LocalAgent

    @State private var taskDescription = ""
    @State private var selectedCategory: AgentTask.TaskCategory = .other
    @State private var customKeywords = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text(agent.emoji)
                            .font(.title)
                        VStack(alignment: .leading) {
                            Text(agent.name)
                                .font(.headline)
                            Text("will look for opportunities to complete this task")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    TextField("What do you need done?", text: $taskDescription, axis: .vertical)
                        .lineLimit(3...6)
                } header: {
                    Text("Task Description")
                } footer: {
                    Text("Example: \"Make reservations for 4 at 5:30 PM tonight\"")
                }

                Section {
                    Picker("Category", selection: $selectedCategory) {
                        ForEach(AgentTask.TaskCategory.allCases, id: \.self) { category in
                            Label(category.displayName, systemImage: category.icon)
                                .tag(category)
                        }
                    }
                } header: {
                    Text("Category")
                } footer: {
                    Text("Helps match this task with the right agents")
                }

                Section {
                    TextField("Additional keywords (comma separated)", text: $customKeywords)
                } header: {
                    Text("Keywords (Optional)")
                } footer: {
                    Text("Add specific terms like location names or special requirements")
                }
            }
            .navigationTitle("Add Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        addTask()
                    }
                    .disabled(taskDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }

    private func addTask() {
        let keywords = customKeywords
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        let task = AgentTask(
            description: taskDescription.trimmingCharacters(in: .whitespacesAndNewlines),
            keywords: keywords,
            category: selectedCategory,
            status: .pending
        )

        var updatedAgent = agent
        updatedAgent.tasks.append(task)
        agentStorage.updateAgent(updatedAgent)

        dismiss()
    }
}

// MARK: - Preview

#Preview {
    AllTasksQueueView()
        .environmentObject(AgentStorageService.shared)
}
