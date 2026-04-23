import Foundation

// MARK: - Contact Model

struct Contact: Codable, Identifiable, Equatable {
    let id: String
    var name: String
    var aliases: [String]
    var relationship: String?
    var relationshipStarted: Date?
    var birthday: String?  // Format: "MM-DD" or "YYYY-MM-DD"
    var email: String?
    var phone: String?
    var notes: String?
    var tags: [String]
    var agents: [ContactAgent]?
    let createdAt: Date
    var updatedAt: Date

    init(
        id: String = UUID().uuidString,
        name: String,
        aliases: [String] = [],
        relationship: String? = nil,
        relationshipStarted: Date? = nil,
        birthday: String? = nil,
        email: String? = nil,
        phone: String? = nil,
        notes: String? = nil,
        tags: [String] = [],
        agents: [ContactAgent]? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.aliases = aliases
        self.relationship = relationship
        self.relationshipStarted = relationshipStarted
        self.birthday = birthday
        self.email = email
        self.phone = phone
        self.notes = notes
        self.tags = tags
        self.agents = agents
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    static func == (lhs: Contact, rhs: Contact) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Contact Agent Association

struct ContactAgent: Codable, Identifiable, Equatable {
    let id: String
    let contactId: String
    let publicAgentId: String
    var agentName: String
    var agentEmoji: String?
    var role: String?
    var discoveredVia: String?
    let addedAt: Date

    init(
        id: String = UUID().uuidString,
        contactId: String,
        publicAgentId: String,
        agentName: String,
        agentEmoji: String? = nil,
        role: String? = nil,
        discoveredVia: String? = nil,
        addedAt: Date = Date()
    ) {
        self.id = id
        self.contactId = contactId
        self.publicAgentId = publicAgentId
        self.agentName = agentName
        self.agentEmoji = agentEmoji
        self.role = role
        self.discoveredVia = discoveredVia
        self.addedAt = addedAt
    }
}

// MARK: - API Request/Response Types

struct CreateContactRequest: Encodable {
    let name: String
    let aliases: [String]?
    let relationship: String?
    let birthday: String?
    let email: String?
    let phone: String?
    let notes: String?
    let tags: [String]?
}

struct UpdateContactRequest: Encodable {
    let name: String?
    let aliases: [String]?
    let relationship: String?
    let birthday: String?
    let email: String?
    let phone: String?
    let notes: String?
    let tags: [String]?
}

struct ContactsListResponse: Decodable {
    let contacts: [Contact]
    let total: Int
    let hasMore: Bool
}

struct AssociateAgentRequest: Encodable {
    let publicAgentId: String
    let agentName: String
    let agentEmoji: String?
    let role: String?
    let discoveredVia: String?
}

struct ContactSearchResponse: Decodable {
    let contacts: [Contact]
}

// MARK: - Relationship Types

enum RelationshipType: String, CaseIterable {
    // Romantic
    case spouse = "spouse"
    case partner = "partner"
    case girlfriend = "girlfriend"
    case boyfriend = "boyfriend"
    case fiancee = "fiancee"
    case exPartner = "ex-partner"

    // Parents
    case mom = "mom"
    case dad = "dad"
    case parent = "parent"
    case stepMom = "step-mom"
    case stepDad = "step-dad"
    case motherInLaw = "mother-in-law"
    case fatherInLaw = "father-in-law"

    // Children
    case son = "son"
    case daughter = "daughter"
    case child = "child"
    case stepSon = "step-son"
    case stepDaughter = "step-daughter"
    case sonInLaw = "son-in-law"
    case daughterInLaw = "daughter-in-law"

    // Siblings
    case brother = "brother"
    case sister = "sister"
    case sibling = "sibling"
    case stepBrother = "step-brother"
    case stepSister = "step-sister"
    case halfBrother = "half-brother"
    case halfSister = "half-sister"
    case brotherInLaw = "brother-in-law"
    case sisterInLaw = "sister-in-law"

    // Extended Family
    case grandparent = "grandparent"
    case grandmother = "grandmother"
    case grandfather = "grandfather"
    case grandchild = "grandchild"
    case grandson = "grandson"
    case granddaughter = "granddaughter"
    case aunt = "aunt"
    case uncle = "uncle"
    case cousin = "cousin"
    case niece = "niece"
    case nephew = "nephew"

    // Friends & Social
    case friend = "friend"
    case bestFriend = "best-friend"
    case closeFriend = "close-friend"
    case acquaintance = "acquaintance"
    case neighbor = "neighbor"
    case roommate = "roommate"

    // Work
    case coworker = "coworker"
    case colleague = "colleague"
    case boss = "boss"
    case manager = "manager"
    case employee = "employee"
    case mentor = "mentor"
    case mentee = "mentee"
    case client = "client"
    case businessPartner = "business-partner"

    // Professional
    case doctor = "doctor"
    case therapist = "therapist"
    case lawyer = "lawyer"
    case accountant = "accountant"
    case teacher = "teacher"
    case coach = "coach"
    case trainer = "trainer"

    // Other
    case other = "other"

    var displayName: String {
        switch self {
        // Romantic
        case .spouse: return "Spouse"
        case .partner: return "Partner"
        case .girlfriend: return "Girlfriend"
        case .boyfriend: return "Boyfriend"
        case .fiancee: return "Fiancé(e)"
        case .exPartner: return "Ex-Partner"
        // Parents
        case .mom: return "Mom"
        case .dad: return "Dad"
        case .parent: return "Parent"
        case .stepMom: return "Step-Mom"
        case .stepDad: return "Step-Dad"
        case .motherInLaw: return "Mother-in-Law"
        case .fatherInLaw: return "Father-in-Law"
        // Children
        case .son: return "Son"
        case .daughter: return "Daughter"
        case .child: return "Child"
        case .stepSon: return "Step-Son"
        case .stepDaughter: return "Step-Daughter"
        case .sonInLaw: return "Son-in-Law"
        case .daughterInLaw: return "Daughter-in-Law"
        // Siblings
        case .brother: return "Brother"
        case .sister: return "Sister"
        case .sibling: return "Sibling"
        case .stepBrother: return "Step-Brother"
        case .stepSister: return "Step-Sister"
        case .halfBrother: return "Half-Brother"
        case .halfSister: return "Half-Sister"
        case .brotherInLaw: return "Brother-in-Law"
        case .sisterInLaw: return "Sister-in-Law"
        // Extended Family
        case .grandparent: return "Grandparent"
        case .grandmother: return "Grandmother"
        case .grandfather: return "Grandfather"
        case .grandchild: return "Grandchild"
        case .grandson: return "Grandson"
        case .granddaughter: return "Granddaughter"
        case .aunt: return "Aunt"
        case .uncle: return "Uncle"
        case .cousin: return "Cousin"
        case .niece: return "Niece"
        case .nephew: return "Nephew"
        // Friends & Social
        case .friend: return "Friend"
        case .bestFriend: return "Best Friend"
        case .closeFriend: return "Close Friend"
        case .acquaintance: return "Acquaintance"
        case .neighbor: return "Neighbor"
        case .roommate: return "Roommate"
        // Work
        case .coworker: return "Coworker"
        case .colleague: return "Colleague"
        case .boss: return "Boss"
        case .manager: return "Manager"
        case .employee: return "Employee"
        case .mentor: return "Mentor"
        case .mentee: return "Mentee"
        case .client: return "Client"
        case .businessPartner: return "Business Partner"
        // Professional
        case .doctor: return "Doctor"
        case .therapist: return "Therapist"
        case .lawyer: return "Lawyer"
        case .accountant: return "Accountant"
        case .teacher: return "Teacher"
        case .coach: return "Coach"
        case .trainer: return "Trainer"
        // Other
        case .other: return "Other"
        }
    }

    var icon: String {
        switch self {
        // Romantic
        case .spouse, .partner, .girlfriend, .boyfriend, .fiancee:
            return "heart.fill"
        case .exPartner:
            return "heart.slash"
        // Parents
        case .mom, .stepMom, .motherInLaw:
            return "figure.stand"
        case .dad, .stepDad, .fatherInLaw:
            return "figure.stand"
        case .parent:
            return "figure.2.and.child.holdinghands"
        // Children
        case .son, .stepSon, .sonInLaw:
            return "figure.child"
        case .daughter, .stepDaughter, .daughterInLaw:
            return "figure.child"
        case .child:
            return "figure.child"
        // Siblings
        case .brother, .stepBrother, .halfBrother, .brotherInLaw:
            return "person.2.fill"
        case .sister, .stepSister, .halfSister, .sisterInLaw:
            return "person.2.fill"
        case .sibling:
            return "person.2.fill"
        // Extended Family
        case .grandparent, .grandmother, .grandfather:
            return "figure.2.arms.open"
        case .grandchild, .grandson, .granddaughter:
            return "figure.child"
        case .aunt, .uncle:
            return "person.fill"
        case .cousin:
            return "person.2.fill"
        case .niece, .nephew:
            return "figure.child"
        // Friends & Social
        case .friend, .bestFriend, .closeFriend:
            return "person.2.fill"
        case .acquaintance:
            return "person.fill"
        case .neighbor:
            return "house.fill"
        case .roommate:
            return "house.and.flag.fill"
        // Work
        case .coworker, .colleague:
            return "briefcase.fill"
        case .boss, .manager:
            return "person.badge.shield.checkmark.fill"
        case .employee:
            return "person.badge.clock.fill"
        case .mentor:
            return "graduationcap.fill"
        case .mentee:
            return "book.fill"
        case .client:
            return "person.crop.rectangle.badge.plus.fill"
        case .businessPartner:
            return "handshake.fill"
        // Professional
        case .doctor:
            return "stethoscope"
        case .therapist:
            return "brain.head.profile"
        case .lawyer:
            return "text.book.closed.fill"
        case .accountant:
            return "chart.bar.doc.horizontal.fill"
        case .teacher:
            return "graduationcap.fill"
        case .coach, .trainer:
            return "figure.run"
        // Other
        case .other:
            return "person.crop.circle"
        }
    }

    var category: RelationshipCategory {
        switch self {
        case .spouse, .partner, .girlfriend, .boyfriend, .fiancee, .exPartner:
            return .romantic
        case .mom, .dad, .parent, .stepMom, .stepDad, .motherInLaw, .fatherInLaw:
            return .parents
        case .son, .daughter, .child, .stepSon, .stepDaughter, .sonInLaw, .daughterInLaw:
            return .children
        case .brother, .sister, .sibling, .stepBrother, .stepSister, .halfBrother, .halfSister, .brotherInLaw, .sisterInLaw:
            return .siblings
        case .grandparent, .grandmother, .grandfather, .grandchild, .grandson, .granddaughter, .aunt, .uncle, .cousin, .niece, .nephew:
            return .extendedFamily
        case .friend, .bestFriend, .closeFriend, .acquaintance, .neighbor, .roommate:
            return .friendsSocial
        case .coworker, .colleague, .boss, .manager, .employee, .mentor, .mentee, .client, .businessPartner:
            return .work
        case .doctor, .therapist, .lawyer, .accountant, .teacher, .coach, .trainer:
            return .professional
        case .other:
            return .other
        }
    }

    /// Get all relationship types in a specific category
    static func types(in category: RelationshipCategory) -> [RelationshipType] {
        allCases.filter { $0.category == category }
    }
}

// MARK: - Relationship Categories (for grouping in UI)

enum RelationshipCategory: String, CaseIterable {
    case romantic = "Romantic"
    case parents = "Parents"
    case children = "Children"
    case siblings = "Siblings"
    case extendedFamily = "Extended Family"
    case friendsSocial = "Friends & Social"
    case work = "Work"
    case professional = "Professional Services"
    case other = "Other"

    var displayName: String { rawValue }
}
