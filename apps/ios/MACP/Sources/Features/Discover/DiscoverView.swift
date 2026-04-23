import SwiftUI

// MARK: - Add Agent View

/// Main view for adding agents - shows MACP Originals and custom agent creation
struct AddAgentView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var memoryService: MemoryService

    @State private var selectedCategory: MarketplaceCategory = .featured
    @State private var searchText = ""
    @State private var selectedAgent: MarketplaceAgent?
    @State private var showCustomAgentEditor = false

    var filteredAgents: [MarketplaceAgent] {
        let agents = MarketplaceAgent.byCategory(selectedCategory)
        if searchText.isEmpty {
            return agents
        }
        return agents.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            $0.shortDescription.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    createCustomSection
                    Divider().padding(.horizontal)
                    macpOriginalsHeader
                    categoryPills
                    agentGrid
                    Spacer(minLength: 100)
                }
                .padding(.top)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Add Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .searchable(text: $searchText, prompt: "Search agents...")
            .sheet(item: $selectedAgent) { agent in
                AgentDetailSheet(agent: agent, onDismissParent: { dismiss() })
                    .environmentObject(agentStorage)
                    .environmentObject(apiKeyService)
            }
            .sheet(isPresented: $showCustomAgentEditor) {
                ConversationalAgentCreator()
                    .environmentObject(agentStorage)
                    .environmentObject(apiKeyService)
            }
        }
    }

    // MARK: - Create Custom Section

    private var createCustomSection: some View {
        Button {
            showCustomAgentEditor = true
        } label: {
            HStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(Color.blue.opacity(0.15))
                        .frame(width: 56, height: 56)

                    Image(systemName: "plus")
                        .font(.title2)
                        .fontWeight(.semibold)
                        .foregroundStyle(.blue)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Create Custom Agent")
                        .font(.headline)
                        .foregroundStyle(.primary)

                    Text("Build your own with a custom personality")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemBackground))
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal)
    }

    // MARK: - MACP Originals Header

    private var macpOriginalsHeader: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.seal.fill")
                .font(.title3)
                .foregroundStyle(.yellow)

            VStack(alignment: .leading, spacing: 2) {
                Text("MACP Originals")
                    .font(.headline)
                    .fontWeight(.semibold)

                Text("Pre-built specialists, free to use")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()
        }
        .padding(.horizontal)
    }

    // MARK: - Category Pills

    private var categoryPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(MarketplaceCategory.allCases) { category in
                    CategoryPill(
                        category: category,
                        isSelected: selectedCategory == category
                    ) {
                        withAnimation(.spring(response: 0.3)) {
                            selectedCategory = category
                        }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 4)
        }
    }

    // MARK: - Agent Grid

    private var agentGrid: some View {
        LazyVGrid(columns: [
            GridItem(.flexible(), spacing: 12),
            GridItem(.flexible(), spacing: 12)
        ], spacing: 12) {
            ForEach(filteredAgents) { agent in
                MarketplaceAgentCard(
                    agent: agent,
                    isAdded: isAgentAdded(agent)
                ) {
                    selectedAgent = agent
                }
            }
        }
        .padding(.horizontal)
    }

    // MARK: - Helpers

    private func isAgentAdded(_ agent: MarketplaceAgent) -> Bool {
        agentStorage.agents.contains { $0.name == agent.name }
    }
}

// MARK: - Legacy DiscoverView Wrapper

struct DiscoverView: View {
    @EnvironmentObject var agentStorage: AgentStorageService
    @EnvironmentObject var apiKeyService: APIKeyService
    @EnvironmentObject var memoryService: MemoryService

    var body: some View {
        AddAgentView()
            .environmentObject(agentStorage)
            .environmentObject(apiKeyService)
            .environmentObject(memoryService)
    }
}

#Preview {
    AddAgentView()
        .environmentObject(AgentStorageService.shared)
        .environmentObject(APIKeyService.shared)
        .environmentObject(MemoryService.shared)
}
