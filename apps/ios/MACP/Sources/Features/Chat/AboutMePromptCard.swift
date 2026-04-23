import SwiftUI

// MARK: - ProfilePrompt

struct ProfilePrompt: Identifiable {
    let id: String
    let category: String
    let factKey: String
    let question: String
    let conversationStarter: String
    let icon: String
    let color: Color

    static let allPrompts: [ProfilePrompt] = [
        // Identity
        ProfilePrompt(id: "name", category: "identity", factKey: "name",
                      question: "What's your name?",
                      conversationStarter: "I'd like to tell you my name",
                      icon: "person.fill", color: .blue),
        ProfilePrompt(id: "birthday", category: "identity", factKey: "birthday",
                      question: "When's your birthday?",
                      conversationStarter: "I'd like to tell you about my birthday",
                      icon: "gift.fill", color: .purple),
        ProfilePrompt(id: "location", category: "identity", factKey: "location",
                      question: "Where do you live?",
                      conversationStarter: "I'd like to tell you where I live",
                      icon: "location.fill", color: .teal),

        // Work
        ProfilePrompt(id: "occupation", category: "work", factKey: "occupation",
                      question: "What do you do for work?",
                      conversationStarter: "I'd like to tell you about my work",
                      icon: "briefcase.fill", color: .indigo),

        // Preferences
        ProfilePrompt(id: "hobbies", category: "preferences", factKey: "hobbies",
                      question: "What are your hobbies?",
                      conversationStarter: "I'd like to tell you about my hobbies",
                      icon: "star.fill", color: .orange),
        ProfilePrompt(id: "favorite_cuisine", category: "preferences", factKey: "favorite_cuisine",
                      question: "What's your favorite cuisine?",
                      conversationStarter: "I'd like to tell you about my favorite food",
                      icon: "fork.knife", color: .orange),

        // Family
        ProfilePrompt(id: "pets", category: "family", factKey: "pets",
                      question: "Do you have any pets?",
                      conversationStarter: "I'd like to tell you about my pets",
                      icon: "pawprint.fill", color: .pink),
        ProfilePrompt(id: "family_members", category: "family", factKey: "family_members",
                      question: "Tell us about your family",
                      conversationStarter: "I'd like to tell you about my family",
                      icon: "figure.2.and.child.holdinghands", color: .pink),

        // Dietary
        ProfilePrompt(id: "dietary_restrictions", category: "dietary", factKey: "dietary_restrictions",
                      question: "Any food allergies or restrictions?",
                      conversationStarter: "I'd like to tell you about my dietary needs",
                      icon: "leaf.fill", color: .green),

        // Health
        ProfilePrompt(id: "medications", category: "health", factKey: "medications",
                      question: "Any medications to track?",
                      conversationStarter: "I'd like to tell you about my medications",
                      icon: "pills.fill", color: .red),
        ProfilePrompt(id: "health_conditions", category: "health", factKey: "health_conditions",
                      question: "Any health conditions to note?",
                      conversationStarter: "I'd like to tell you about my health",
                      icon: "heart.fill", color: .red),

        // Schedule
        ProfilePrompt(id: "wake_time", category: "schedule", factKey: "wake_time",
                      question: "What time do you usually wake up?",
                      conversationStarter: "I'd like to tell you about my schedule",
                      icon: "alarm.fill", color: .cyan),

        // Financial
        ProfilePrompt(id: "financial_goals", category: "financial", factKey: "financial_goals",
                      question: "Any financial goals?",
                      conversationStarter: "I'd like to tell you about my financial goals",
                      icon: "dollarsign.circle.fill", color: .mint),

        // Wishlist
        ProfilePrompt(id: "wishlist_item", category: "wishlist", factKey: "wishlist_item",
                      question: "Anything on your wishlist?",
                      conversationStarter: "I'd like to tell you about my wishlist",
                      icon: "gift.fill", color: .purple),

        // General
        ProfilePrompt(id: "current_goals", category: "general", factKey: "current_goals",
                      question: "What are you focused on right now?",
                      conversationStarter: "I'd like to tell you what I'm focused on",
                      icon: "target", color: .gray),
    ]

    /// Key used to store skipped prompt IDs in the profile
    static let skippedPromptsKey = "skipped_profile_prompts"
    static let skippedPromptsCategory = "preferences"
}

// MARK: - AboutMePromptCard

struct AboutMePromptCard: View {
    @ObservedObject var profileService: ProfileService
    let onStartChat: (ProfilePrompt) -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var isSkipping = false

    /// Set of prompt IDs that have been skipped (loaded from profile)
    private var skippedIds: Set<String> {
        guard let fact = profileService.fact(forKey: ProfilePrompt.skippedPromptsKey),
              !fact.displayValue.isEmpty else {
            return []
        }
        return Set(fact.displayValue.components(separatedBy: ","))
    }

    /// First unanswered, non-skipped prompt
    private var currentPrompt: ProfilePrompt? {
        ProfilePrompt.allPrompts.first { prompt in
            profileService.fact(forKey: prompt.factKey) == nil && !skippedIds.contains(prompt.id)
        }
    }

    var body: some View {
        if let prompt = currentPrompt {
            cardContent(for: prompt)
                .id(prompt.id)
                .transition(.asymmetric(
                    insertion: .move(edge: .leading).combined(with: .opacity),
                    removal: .move(edge: .trailing).combined(with: .opacity)
                ))
        }
    }

    // MARK: - Card Content

    @ViewBuilder
    private func cardContent(for prompt: ProfilePrompt) -> some View {
        VStack(spacing: 16) {
            // Header row with title and skip button
            HStack {
                Text("About You")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(prompt.color)

                Spacer()

                // Skip button
                Button {
                    Task { await skipPrompt(prompt) }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 24, height: 24)
                        .background(Color(.systemGray5), in: Circle())
                }
                .buttonStyle(.plain)
                .disabled(isSkipping)
            }

            // Icon
            ZStack {
                Circle()
                    .fill(prompt.color.opacity(0.15))
                    .frame(width: 56, height: 56)
                Image(systemName: prompt.icon)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(prompt.color)
            }

            // Question
            Text(prompt.question)
                .font(.headline)
                .foregroundStyle(.primary)
                .multilineTextAlignment(.center)

            // Let's chat button
            Button {
                onStartChat(prompt)
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 14, weight: .medium))
                    Text("Let's chat")
                        .font(.subheadline.weight(.semibold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(prompt.color, in: Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 20)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.08), radius: 12, y: 4)
        }
        .overlay {
            if colorScheme == .light {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(.systemGray4), lineWidth: 1)
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: currentPrompt?.id)
    }

    // MARK: - Skip

    private func skipPrompt(_ prompt: ProfilePrompt) async {
        isSkipping = true

        // Build new skipped list
        var newSkipped = skippedIds
        newSkipped.insert(prompt.id)
        let skippedValue = newSkipped.sorted().joined(separator: ",")

        // Save to profile
        _ = await profileService.updateFacts(
            category: ProfilePrompt.skippedPromptsCategory,
            facts: [(key: ProfilePrompt.skippedPromptsKey, value: skippedValue)]
        )

        isSkipping = false
    }
}

// MARK: - Preview

#Preview {
    VStack {
        AboutMePromptCard(profileService: .shared) { prompt in
            print("Start chat about: \(prompt.question)")
        }
        .padding(.horizontal)
        Spacer()
    }
    .background(Color(.systemGroupedBackground))
}
