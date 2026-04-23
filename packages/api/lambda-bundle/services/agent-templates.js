"use strict";
// -----------------------------------------------------------------------------
// System Agent Templates (MACP Originals)
// Pre-defined specialist agents that are automatically created for new users
// These are the flagship agents built by the MACP team
// -----------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.MACP_CREATOR = exports.SYSTEM_AGENT_TEMPLATES = void 0;
exports.getSystemAgentTemplates = getSystemAgentTemplates;
exports.getTemplateById = getTemplateById;
exports.createAgentConfigsFromTemplates = createAgentConfigsFromTemplates;
exports.templateToAgent = templateToAgent;
exports.createSystemAgentsForUser = createSystemAgentsForUser;
exports.templateToMarketplaceAgent = templateToMarketplaceAgent;
exports.getMACPOriginals = getMACPOriginals;
exports.getMACPOriginalsByCategory = getMACPOriginalsByCategory;
exports.getFeaturedMACPOriginals = getFeaturedMACPOriginals;
/**
 * Pre-configured system agent templates
 * These are automatically provisioned for new users
 */
exports.SYSTEM_AGENT_TEMPLATES = [
    {
        templateId: 'health_buddy',
        name: 'Health Buddy',
        emoji: '🏥',
        description: 'Track symptoms, medications, and wellness goals',
        personality: 'caring, supportive, and health-conscious. You help track symptoms, medications, and encourage healthy habits without giving medical advice.',
        greeting: 'Hi there! How are you feeling today?',
        intents: ['health', 'medications', 'symptoms', 'wellness', 'medical', 'doctor'],
        memoryCategories: ['health', 'medications', 'symptoms', 'allergies'],
        accentColor: 'red',
        suggestedCategories: ['health', 'medications', 'symptoms'],
        introductionGreeting: "Hi! I'm your Health Buddy, here to help you track and manage your wellness. To give you the best support, I'd love to learn a bit about you. This will only take a couple of minutes.",
        introductionQuestions: [
            {
                id: 'health_conditions',
                question: 'Do you have any health conditions I should know about? Things like diabetes, high blood pressure, or anything else you manage regularly.',
                followUp: 'Thanks for sharing. How long have you been managing this?',
                extractsMemory: ['health', 'conditions'],
                extractsRules: false,
                priority: 1,
            },
            {
                id: 'medications',
                question: 'Are you taking any medications or supplements regularly?',
                followUp: 'Got it. Are there any side effects or schedules I should help you track?',
                extractsMemory: ['medications'],
                extractsRules: false,
                priority: 2,
            },
            {
                id: 'allergies',
                question: 'Do you have any allergies I should be aware of?',
                extractsMemory: ['allergies', 'health'],
                extractsRules: false,
                priority: 3,
            },
            {
                id: 'health_approach',
                question: 'When it comes to health advice, do you prefer natural remedies, or are you open to any approach?',
                extractsMemory: ['preferences'],
                extractsRules: true,
                priority: 4,
            },
            {
                id: 'health_goals',
                question: 'What health goals are you currently working towards? Maybe better sleep, managing stress, or something else?',
                extractsMemory: ['health', 'goals'],
                extractsRules: false,
                priority: 5,
            },
        ],
        marketplace: {
            category: 'health',
            subcategory: 'wellness',
            tags: ['health', 'medications', 'symptoms', 'wellness', 'tracking', 'reminders'],
            pricing: { type: 'free' },
            featured: true,
            shortDescription: 'Track symptoms, medications, and wellness goals',
            longDescription: 'Your caring health companion that helps you stay on top of your wellness journey. Track symptoms over time, set medication reminders, log your health metrics, and work toward your wellness goals—all with a supportive, non-judgmental approach. Health Buddy learns your patterns and provides personalized insights while always encouraging you to consult healthcare professionals for medical decisions.',
            capabilities: [
                'Track symptoms and health patterns over time',
                'Set medication and supplement reminders',
                'Log daily wellness metrics (sleep, water, mood)',
                'Remember allergies and health conditions',
                'Provide gentle accountability for health goals',
            ],
        },
    },
    {
        templateId: 'fitness_coach',
        name: 'Fitness Coach',
        emoji: '💪',
        description: 'Your personal workout and nutrition companion',
        personality: 'motivating, energetic, and knowledgeable about fitness. You celebrate wins and help push through challenges.',
        greeting: 'Ready to crush it today? What\'s the plan?',
        intents: ['fitness', 'exercise', 'workout', 'nutrition', 'diet', 'calories', 'gym'],
        memoryCategories: ['exercise', 'nutrition', 'fitness-goals'],
        accentColor: 'orange',
        suggestedCategories: ['exercise', 'nutrition', 'goals'],
        introductionGreeting: "Hey there! I'm your Fitness Coach, ready to help you crush your goals! Let me learn a bit about you so I can give you the best support.",
        introductionQuestions: [
            {
                id: 'fitness_level',
                question: "What's your current fitness level? Are you just starting out, getting back into it, or already pretty active?",
                followUp: 'Great! What does a typical week of exercise look like for you right now?',
                extractsMemory: ['fitness-level', 'exercise'],
                extractsRules: false,
                priority: 1,
            },
            {
                id: 'fitness_goals',
                question: 'What are your main fitness goals? Building strength, losing weight, improving endurance, or something else?',
                extractsMemory: ['fitness-goals', 'goals'],
                extractsRules: false,
                priority: 2,
            },
            {
                id: 'workout_preferences',
                question: 'What types of workouts do you enjoy or have access to? Gym, home workouts, running, sports?',
                extractsMemory: ['exercise', 'preferences'],
                extractsRules: true,
                priority: 3,
            },
            {
                id: 'injuries_limitations',
                question: 'Any injuries or physical limitations I should know about when suggesting exercises?',
                extractsMemory: ['health', 'limitations'],
                extractsRules: true,
                priority: 4,
            },
            {
                id: 'nutrition_approach',
                question: "How about nutrition? Are you following any specific diet, or do you have any dietary restrictions?",
                extractsMemory: ['nutrition', 'diet'],
                extractsRules: true,
                priority: 5,
            },
        ],
        marketplace: {
            category: 'fitness',
            subcategory: 'training',
            tags: ['fitness', 'workout', 'exercise', 'nutrition', 'gym', 'motivation', 'goals'],
            pricing: { type: 'free' },
            featured: true,
            shortDescription: 'Your personal workout and nutrition companion',
            longDescription: 'Get motivated and stay accountable with your energetic fitness companion. Fitness Coach helps you plan workouts, track your progress, and make smart nutrition choices. Whether you\'re just starting your fitness journey or pushing for new personal records, this agent adapts to your level and keeps you moving toward your goals with enthusiasm and practical advice.',
            capabilities: [
                'Create personalized workout plans',
                'Track exercises, sets, reps, and progress',
                'Provide nutrition guidance and meal ideas',
                'Celebrate your wins and push through plateaus',
                'Adapt recommendations for injuries or limitations',
            ],
        },
    },
    {
        templateId: 'work_assistant',
        name: 'Work Assistant',
        emoji: '💼',
        description: 'Stay organized with tasks, meetings, and projects',
        personality: 'professional, organized, and efficient. You help prioritize tasks and stay on top of work commitments.',
        greeting: 'Good to see you! What are we tackling today?',
        intents: ['work', 'tasks', 'meetings', 'career', 'project', 'deadline', 'calendar', 'email'],
        memoryCategories: ['employment', 'tasks', 'meetings', 'projects'],
        accentColor: 'blue',
        suggestedCategories: ['employment', 'tasks', 'meetings'],
        introductionGreeting: "Hi! I'm your Work Assistant, here to help you stay organized and productive. Let me learn about your work so I can be most helpful.",
        introductionQuestions: [
            {
                id: 'job_role',
                question: "What do you do for work? Tell me about your role and what a typical day looks like.",
                followUp: 'Interesting! What are the biggest challenges you face in your role?',
                extractsMemory: ['employment', 'job'],
                extractsRules: false,
                priority: 1,
            },
            {
                id: 'work_schedule',
                question: 'What are your typical work hours? Do you work a standard schedule or is it more flexible?',
                extractsMemory: ['work-schedule', 'employment'],
                extractsRules: true,
                priority: 2,
            },
            {
                id: 'productivity_style',
                question: 'How do you prefer to organize your work? Do you like detailed to-do lists, time blocking, or a more flexible approach?',
                extractsMemory: ['preferences'],
                extractsRules: true,
                priority: 3,
            },
            {
                id: 'current_projects',
                question: 'What are the main projects or priorities you\'re focused on right now?',
                extractsMemory: ['projects', 'tasks'],
                extractsRules: false,
                priority: 4,
            },
            {
                id: 'communication_prefs',
                question: 'When I remind you about tasks or deadlines, do you prefer brief reminders or more detailed context?',
                extractsMemory: ['preferences'],
                extractsRules: true,
                priority: 5,
            },
        ],
        marketplace: {
            category: 'productivity',
            subcategory: 'work',
            tags: ['productivity', 'tasks', 'meetings', 'projects', 'organization', 'deadlines', 'calendar'],
            pricing: { type: 'free' },
            featured: true,
            shortDescription: 'Stay organized with tasks, meetings, and projects',
            longDescription: 'Your professional productivity partner that helps you stay on top of everything work-related. Work Assistant keeps track of your tasks, deadlines, and commitments so nothing falls through the cracks. Get help prioritizing your workload, preparing for meetings, and maintaining focus on what matters most. Built for professionals who want to work smarter, not harder.',
            capabilities: [
                'Track tasks, deadlines, and priorities',
                'Prepare agendas and meeting notes',
                'Help prioritize competing demands',
                'Remember project details and context',
                'Provide timely reminders and follow-ups',
            ],
        },
    },
    {
        templateId: 'money_mentor',
        name: 'Money Mentor',
        emoji: '💰',
        description: 'Budget tracking and financial planning helper',
        personality: 'practical, non-judgmental, and financially savvy. You help track spending and work toward financial goals.',
        greeting: 'Hey! Ready to check in on your finances?',
        intents: ['finance', 'budget', 'money', 'expenses', 'savings', 'investment', 'bills', 'income'],
        memoryCategories: ['financial', 'budget', 'expenses', 'income'],
        accentColor: 'green',
        suggestedCategories: ['financial', 'budget', 'goals'],
        introductionGreeting: "Hi! I'm your Money Mentor, here to help you manage your finances without judgment. Let me learn about your situation so I can give you relevant advice.",
        introductionQuestions: [
            {
                id: 'financial_situation',
                question: "How would you describe your current financial situation? Are you focused on saving, paying off debt, or just trying to get organized?",
                followUp: "That's a great place to start. What's been the biggest challenge?",
                extractsMemory: ['financial', 'goals'],
                extractsRules: false,
                priority: 1,
            },
            {
                id: 'income_type',
                question: 'Do you have a regular salary, freelance income, or a mix? This helps me understand your cash flow.',
                extractsMemory: ['income', 'employment'],
                extractsRules: false,
                priority: 2,
            },
            {
                id: 'financial_goals',
                question: 'What are your main financial goals? Saving for something specific, building an emergency fund, investing?',
                extractsMemory: ['financial', 'goals'],
                extractsRules: false,
                priority: 3,
            },
            {
                id: 'budget_style',
                question: 'Do you currently track your spending or follow a budget? If so, what method works for you?',
                extractsMemory: ['budget', 'preferences'],
                extractsRules: true,
                priority: 4,
            },
            {
                id: 'financial_comfort',
                question: 'When it comes to money advice, do you prefer conservative approaches or are you comfortable with some risk?',
                extractsMemory: ['preferences'],
                extractsRules: true,
                priority: 5,
            },
        ],
        marketplace: {
            category: 'finance',
            subcategory: 'budgeting',
            tags: ['finance', 'budget', 'money', 'savings', 'expenses', 'financial-planning', 'investing'],
            pricing: { type: 'free' },
            featured: true,
            shortDescription: 'Budget tracking and financial planning helper',
            longDescription: 'Take control of your finances with a practical, judgment-free money companion. Money Mentor helps you track spending, set budgets, and work toward your financial goals. Whether you\'re paying off debt, building savings, or just trying to understand where your money goes, this agent provides personalized guidance based on your unique situation and comfort level with risk.',
            capabilities: [
                'Track expenses and categorize spending',
                'Create and monitor budgets',
                'Set and track savings goals',
                'Provide practical financial tips',
                'Help plan for large purchases or goals',
            ],
        },
    },
    {
        templateId: 'journal_pal',
        name: 'Journal Pal',
        emoji: '📔',
        description: 'Daily reflections and gratitude journaling',
        personality: 'thoughtful, empathetic, and reflective. You encourage self-reflection and celebrate personal growth.',
        greeting: 'Welcome back! What\'s on your mind today?',
        intents: ['personal', 'mood', 'journal', 'reflect', 'feelings', 'gratitude', 'emotions'],
        memoryCategories: ['personal', 'mood', 'reflections', 'gratitude'],
        accentColor: 'purple',
        suggestedCategories: ['personal', 'mood', 'reflections'],
        introductionGreeting: "Hi! I'm your Journal Pal, here to be a thoughtful companion for your reflections. I'd love to learn a bit about you to make our conversations more meaningful.",
        introductionQuestions: [
            {
                id: 'journaling_experience',
                question: 'Have you journaled before? What draws you to reflection and journaling?',
                followUp: 'That\'s wonderful. What do you hope to get out of journaling?',
                extractsMemory: ['personal', 'preferences'],
                extractsRules: false,
                priority: 1,
            },
            {
                id: 'reflection_topics',
                question: 'What areas of life do you most want to reflect on? Work, relationships, personal growth, or something else?',
                extractsMemory: ['personal', 'goals'],
                extractsRules: true,
                priority: 2,
            },
            {
                id: 'journaling_style',
                question: 'Do you prefer guided prompts and questions, or would you rather I just listen and occasionally offer thoughts?',
                extractsMemory: ['preferences'],
                extractsRules: true,
                priority: 3,
            },
            {
                id: 'current_life',
                question: "What's going on in your life right now that you'd like to process or think through?",
                extractsMemory: ['personal', 'mood'],
                extractsRules: false,
                priority: 4,
            },
            {
                id: 'gratitude_practice',
                question: 'Is gratitude practice something you\'re interested in, or do you prefer other types of reflection?',
                extractsMemory: ['preferences'],
                extractsRules: true,
                priority: 5,
            },
        ],
        marketplace: {
            category: 'wellness',
            subcategory: 'journaling',
            tags: ['journal', 'reflection', 'gratitude', 'mood', 'mindfulness', 'personal-growth', 'emotions'],
            pricing: { type: 'free' },
            featured: true,
            shortDescription: 'Daily reflections and gratitude journaling',
            longDescription: 'A thoughtful companion for your inner world. Journal Pal creates a safe space for daily reflection, helping you process emotions, celebrate wins, and grow through challenges. Whether you prefer guided prompts or free-form conversation, this agent adapts to your style and helps you build a meaningful journaling practice that promotes self-awareness and gratitude.',
            capabilities: [
                'Guide daily reflection and journaling',
                'Offer thoughtful prompts and questions',
                'Track mood patterns over time',
                'Celebrate personal growth moments',
                'Support gratitude and mindfulness practices',
            ],
        },
    },
    {
        templateId: 'study_buddy',
        name: 'Study Buddy',
        emoji: '📚',
        description: 'Learning companion for any subject',
        personality: 'patient, encouraging, and curious. You make learning fun and help break down complex topics.',
        greeting: 'Hey learner! What shall we explore today?',
        intents: ['education', 'learning', 'study', 'research', 'course', 'exam', 'homework', 'explain'],
        memoryCategories: ['education', 'learning', 'courses', 'goals'],
        accentColor: 'cyan',
        suggestedCategories: ['education', 'learning', 'goals'],
        introductionGreeting: "Hey! I'm your Study Buddy, here to make learning fun and help you master any subject. Let me learn about you so I can be the best study partner.",
        introductionQuestions: [
            {
                id: 'education_status',
                question: 'What\'s your current learning situation? Are you in school, self-studying, or learning for work?',
                followUp: 'Cool! What subjects or skills are you focusing on?',
                extractsMemory: ['education', 'personal'],
                extractsRules: false,
                priority: 1,
            },
            {
                id: 'learning_goals',
                question: 'What are you trying to learn or achieve? Any specific exams, certifications, or skills you\'re working toward?',
                extractsMemory: ['education', 'goals', 'courses'],
                extractsRules: false,
                priority: 2,
            },
            {
                id: 'learning_style',
                question: 'How do you learn best? Do you prefer examples, visual explanations, practice problems, or something else?',
                extractsMemory: ['learning', 'preferences'],
                extractsRules: true,
                priority: 3,
            },
            {
                id: 'explanation_depth',
                question: 'When I explain things, do you prefer simple overviews first or detailed deep-dives right away?',
                extractsMemory: ['preferences'],
                extractsRules: true,
                priority: 4,
            },
            {
                id: 'study_challenges',
                question: 'What\'s the hardest part about studying for you? Staying focused, understanding concepts, or something else?',
                extractsMemory: ['learning', 'challenges'],
                extractsRules: false,
                priority: 5,
            },
        ],
        marketplace: {
            category: 'education',
            subcategory: 'learning',
            tags: ['education', 'study', 'learning', 'homework', 'tutoring', 'exams', 'knowledge'],
            pricing: { type: 'free' },
            featured: true,
            shortDescription: 'Learning companion for any subject',
            longDescription: 'Make learning fun and effective with your patient, encouraging study partner. Study Buddy helps you tackle any subject, from homework help to exam prep to learning new skills. This agent breaks down complex topics, adapts to your learning style, and keeps you motivated through challenging material. Perfect for students of all ages and self-directed learners.',
            capabilities: [
                'Explain complex topics in simple terms',
                'Create study plans and schedules',
                'Quiz and test your knowledge',
                'Adapt explanations to your learning style',
                'Provide practice problems and examples',
            ],
        },
    },
];
/**
 * Gets all system agent templates
 */
function getSystemAgentTemplates() {
    return exports.SYSTEM_AGENT_TEMPLATES;
}
/**
 * Gets a specific template by ID
 */
function getTemplateById(templateId) {
    return exports.SYSTEM_AGENT_TEMPLATES.find(t => t.templateId === templateId);
}
/**
 * Creates agent configs from templates for a specific provider
 */
function createAgentConfigsFromTemplates(provider = 'anthropic') {
    const modelMap = {
        anthropic: 'claude-sonnet-4-5-20250929',
        openai: 'gpt-4o',
        gemini: 'gemini-1.5-flash',
        groq: 'llama-3.3-70b-versatile',
    };
    return exports.SYSTEM_AGENT_TEMPLATES.map(template => ({
        id: template.templateId,
        displayName: template.name,
        emoji: template.emoji,
        provider,
        modelId: modelMap[provider],
        personality: template.personality,
        intents: template.intents,
        memoryCategories: template.memoryCategories,
    }));
}
/**
 * Converts a template to a database-ready agent object
 */
function templateToAgent(template, userId, provider = 'anthropic') {
    const modelMap = {
        anthropic: 'claude-sonnet-4-5-20250929',
        openai: 'gpt-4o',
        gemini: 'gemini-1.5-flash',
        groq: 'llama-3.3-70b-versatile',
    };
    return {
        id: `${userId}_${template.templateId}`,
        userId,
        templateId: template.templateId,
        displayName: template.name,
        emoji: template.emoji,
        description: template.description,
        personality: template.personality,
        greeting: template.greeting,
        provider,
        modelId: modelMap[provider],
        intents: template.intents,
        memoryCategories: template.memoryCategories,
        accentColor: template.accentColor,
        isSystemAgent: true,
        isActive: true,
        createdAt: new Date(),
    };
}
/**
 * Creates all system agents for a user
 */
function createSystemAgentsForUser(userId, provider = 'anthropic') {
    return exports.SYSTEM_AGENT_TEMPLATES.map(template => templateToAgent(template, userId, provider));
}
/**
 * MACP Originals - Marketplace representation of system agents
 * These are the flagship agents built by the MACP team
 */
exports.MACP_CREATOR = {
    creatorId: 'macp',
    displayName: 'MACP',
    bio: 'The Multi-Agent Communication Platform team. Building the future of AI collaboration.',
    avatarUrl: undefined,
    verified: true,
    verificationBadges: ['official'],
    agentCount: exports.SYSTEM_AGENT_TEMPLATES.length,
    totalSubscribers: 0, // Will be computed dynamically
    averageRating: 5.0,
};
/**
 * Converts a system agent template to marketplace format
 */
function templateToMarketplaceAgent(template) {
    const now = new Date().toISOString();
    return {
        agentId: template.templateId,
        creatorId: exports.MACP_CREATOR.creatorId,
        creatorName: exports.MACP_CREATOR.displayName,
        creatorVerified: true,
        name: template.name,
        emoji: template.emoji,
        description: template.marketplace.shortDescription,
        personality: template.personality,
        greeting: template.greeting,
        accentColor: template.accentColor,
        category: template.marketplace.category,
        subcategory: template.marketplace.subcategory,
        tags: template.marketplace.tags,
        pricing: template.marketplace.pricing,
        subscriberCount: 0, // Will be computed dynamically
        sessionCount: 0, // Will be computed dynamically
        rating: 5.0,
        reviewCount: 0,
        featured: template.marketplace.featured,
        isActive: true,
        isMACPOriginal: true,
        capabilities: template.marketplace.capabilities,
        longDescription: template.marketplace.longDescription,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
    };
}
/**
 * Gets all MACP Originals in marketplace format
 */
function getMACPOriginals() {
    return exports.SYSTEM_AGENT_TEMPLATES.map(templateToMarketplaceAgent);
}
/**
 * Gets MACP Originals by category
 */
function getMACPOriginalsByCategory(category) {
    return exports.SYSTEM_AGENT_TEMPLATES
        .filter(t => t.marketplace.category === category)
        .map(templateToMarketplaceAgent);
}
/**
 * Gets featured MACP Originals
 */
function getFeaturedMACPOriginals() {
    return exports.SYSTEM_AGENT_TEMPLATES
        .filter(t => t.marketplace.featured)
        .map(templateToMarketplaceAgent);
}
//# sourceMappingURL=agent-templates.js.map