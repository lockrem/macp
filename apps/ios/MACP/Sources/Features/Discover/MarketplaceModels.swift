import SwiftUI

// MARK: - Marketplace Category

enum MarketplaceCategory: String, CaseIterable, Identifiable {
    case featured = "Featured"
    case health = "Health"
    case fitness = "Fitness"
    case productivity = "Productivity"
    case finance = "Finance"
    case education = "Education"
    case wellness = "Wellness"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .featured: return "star.fill"
        case .health: return "heart.fill"
        case .fitness: return "figure.run"
        case .productivity: return "briefcase.fill"
        case .finance: return "dollarsign.circle.fill"
        case .education: return "book.fill"
        case .wellness: return "leaf.fill"
        }
    }

    var color: Color {
        switch self {
        case .featured: return .yellow
        case .health: return .red
        case .fitness: return .orange
        case .productivity: return .blue
        case .finance: return .green
        case .education: return .cyan
        case .wellness: return .purple
        }
    }
}

// MARK: - Marketplace Agent

struct MarketplaceAgent: Identifiable {
    let id: String
    let name: String
    let emoji: String
    let shortDescription: String
    let longDescription: String
    let category: MarketplaceCategory
    let accentColor: String
    let capabilities: [String]
    let isMACPOriginal: Bool
    let isFree: Bool
    let rating: Double
    let reviewCount: Int
}

// MARK: - MACP Originals Data

extension MarketplaceAgent {
    static let macpOriginals: [MarketplaceAgent] = [
        MarketplaceAgent(
            id: "health_buddy",
            name: "Health Buddy",
            emoji: "🏥",
            shortDescription: "Track symptoms, medications, and wellness goals",
            longDescription: "Your caring health companion that helps you stay on top of your wellness journey. Track symptoms over time, set medication reminders, log your health metrics, and work toward your wellness goals—all with a supportive, non-judgmental approach.",
            category: .health,
            accentColor: "red",
            capabilities: [
                "Track symptoms and health patterns",
                "Set medication reminders",
                "Log daily wellness metrics",
                "Remember allergies and conditions",
                "Provide gentle accountability"
            ],
            isMACPOriginal: true,
            isFree: true,
            rating: 4.9,
            reviewCount: 128
        ),
        MarketplaceAgent(
            id: "fitness_coach",
            name: "Fitness Coach",
            emoji: "💪",
            shortDescription: "Your personal workout and nutrition companion",
            longDescription: "Get motivated and stay accountable with your energetic fitness companion. Create personalized workout plans, track your progress, and make smart nutrition choices. Whether you're just starting or pushing for new records, this agent adapts to your level.",
            category: .fitness,
            accentColor: "orange",
            capabilities: [
                "Create personalized workout plans",
                "Track exercises and progress",
                "Provide nutrition guidance",
                "Celebrate wins and push through plateaus",
                "Adapt for injuries or limitations"
            ],
            isMACPOriginal: true,
            isFree: true,
            rating: 4.8,
            reviewCount: 256
        ),
        MarketplaceAgent(
            id: "work_assistant",
            name: "Work Assistant",
            emoji: "💼",
            shortDescription: "Stay organized with tasks, meetings, and projects",
            longDescription: "Your professional productivity partner that helps you stay on top of everything work-related. Track tasks, deadlines, and commitments so nothing falls through the cracks. Get help prioritizing your workload and maintaining focus.",
            category: .productivity,
            accentColor: "blue",
            capabilities: [
                "Track tasks and deadlines",
                "Prepare meeting agendas",
                "Help prioritize demands",
                "Remember project context",
                "Provide timely reminders"
            ],
            isMACPOriginal: true,
            isFree: true,
            rating: 4.7,
            reviewCount: 189
        ),
        MarketplaceAgent(
            id: "money_mentor",
            name: "Money Mentor",
            emoji: "💰",
            shortDescription: "Budget tracking and financial planning helper",
            longDescription: "Take control of your finances with a practical, judgment-free money companion. Track spending, set budgets, and work toward your financial goals. Whether you're paying off debt or building savings, get personalized guidance.",
            category: .finance,
            accentColor: "green",
            capabilities: [
                "Track expenses and spending",
                "Create and monitor budgets",
                "Set and track savings goals",
                "Provide practical tips",
                "Help plan for big purchases"
            ],
            isMACPOriginal: true,
            isFree: true,
            rating: 4.8,
            reviewCount: 167
        ),
        MarketplaceAgent(
            id: "journal_pal",
            name: "Journal Pal",
            emoji: "📔",
            shortDescription: "Daily reflections and gratitude journaling",
            longDescription: "A thoughtful companion for your inner world. Create a safe space for daily reflection, helping you process emotions, celebrate wins, and grow through challenges. Build a meaningful journaling practice that promotes self-awareness.",
            category: .wellness,
            accentColor: "purple",
            capabilities: [
                "Guide daily reflection",
                "Offer thoughtful prompts",
                "Track mood patterns",
                "Celebrate growth moments",
                "Support gratitude practices"
            ],
            isMACPOriginal: true,
            isFree: true,
            rating: 4.9,
            reviewCount: 203
        ),
        MarketplaceAgent(
            id: "study_buddy",
            name: "Study Buddy",
            emoji: "📚",
            shortDescription: "Learning companion for any subject",
            longDescription: "Make learning fun and effective with your patient, encouraging study partner. Tackle any subject, from homework help to exam prep. Break down complex topics, adapt to your learning style, and stay motivated.",
            category: .education,
            accentColor: "cyan",
            capabilities: [
                "Explain complex topics simply",
                "Create study plans",
                "Quiz and test knowledge",
                "Adapt to learning styles",
                "Provide practice problems"
            ],
            isMACPOriginal: true,
            isFree: true,
            rating: 4.8,
            reviewCount: 312
        )
    ]

    static func byCategory(_ category: MarketplaceCategory) -> [MarketplaceAgent] {
        if category == .featured {
            return macpOriginals
        }
        return macpOriginals.filter { $0.category == category }
    }
}
