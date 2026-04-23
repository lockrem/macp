"use strict";
/**
 * Test Conversation Agents
 *
 * Two AI agents that converse with each other to test:
 * - Contact extraction (detecting relationship info)
 * - Task detection (identifying actionable requests)
 * - Person mention handling (asking about unknown people vs accepting provided info)
 *
 * Run with: npx ts-node src/scripts/test-conversation-agents.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables from .env file (check multiple locations)
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../../../.env') }); // Project root
dotenv_1.default.config(); // Also check current directory
// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n❌ ANTHROPIC_API_KEY environment variable not set');
    console.error('\nTo run these tests, set your API key:');
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
    console.error('\nOr run with:');
    console.error('  ANTHROPIC_API_KEY=sk-ant-... npx ts-node src/scripts/test-conversation-agents.ts\n');
    process.exit(1);
}
// Initialize Anthropic client
const anthropic = new sdk_1.default();
// ============================================================================
// TEST SCENARIOS
// ============================================================================
const testScenarios = [
    // Contact Extraction Tests
    {
        name: 'Direct Relationship Statement',
        description: 'User directly states a relationship - should extract contact, NOT ask who they are',
        userPrompt: 'Jane is my girlfriend. Her birthday is March 15th.',
        expectedBehaviors: [
            { type: 'contact_extraction', details: 'Should detect Jane as girlfriend with birthday' },
            { type: 'normal_response', details: 'Should NOT ask "Who is Jane?"' }
        ]
    },
    {
        name: 'Relationship with Contact Info',
        description: 'User shares relationship plus contact details',
        userPrompt: 'My sister Sarah just got a new phone number: 555-123-4567. She works at Google now.',
        expectedBehaviors: [
            { type: 'contact_extraction', details: 'Should extract Sarah as sister with phone and employer' }
        ]
    },
    {
        name: 'Casual Mention - No Extraction',
        description: 'User casually mentions a name without relationship context',
        userPrompt: 'I was talking to some guy named Bob at the coffee shop today.',
        expectedBehaviors: [
            { type: 'normal_response', details: 'Should NOT extract Bob as a contact (no relationship)' }
        ]
    },
    {
        name: 'Celebrity Mention - No Extraction',
        description: 'User mentions a celebrity - should not extract',
        userPrompt: 'I love Taylor Swift\'s new album. She\'s so talented!',
        expectedBehaviors: [
            { type: 'normal_response', details: 'Should NOT extract Taylor Swift as contact' }
        ]
    },
    {
        name: 'Multiple People in One Message',
        description: 'User mentions multiple relationships at once',
        userPrompt: 'My mom Linda and my dad Robert are coming to visit next week. Mom\'s birthday is in December.',
        expectedBehaviors: [
            { type: 'contact_extraction', details: 'Should extract BOTH Linda (mom) AND Robert (dad) - not just one!' }
        ]
    },
    {
        name: 'Simple Parent Introduction',
        description: 'User simply states parent names',
        userPrompt: 'My mother\'s name is Mary and my father\'s name is Al.',
        expectedBehaviors: [
            { type: 'contact_extraction', details: 'Should extract BOTH Mary (mother) AND Al (father)' }
        ]
    },
    // Task Detection Tests
    {
        name: 'Clear Task Request',
        description: 'User makes an explicit task request',
        userPrompt: 'Can you help me find a good Italian restaurant for Saturday night?',
        expectedBehaviors: [
            { type: 'task_detection', details: 'Should detect restaurant finding task' }
        ]
    },
    {
        name: 'Implicit Task - Scheduling',
        description: 'User implies they need something scheduled',
        userPrompt: 'I need to see a dentist soon, it\'s been over a year.',
        expectedBehaviors: [
            { type: 'task_detection', details: 'Should detect health/appointment task' }
        ]
    },
    {
        name: 'Not a Task - Just Sharing',
        description: 'User shares information without wanting action',
        userPrompt: 'I had a great dinner at Olive Garden last night.',
        expectedBehaviors: [
            { type: 'normal_response', details: 'Should NOT create a task (just sharing)' }
        ]
    },
    // Person Mention + Unknown Relationship Tests
    {
        name: 'Unknown Person - Should Ask',
        description: 'User asks about someone not in memory',
        userPrompt: 'Why do you think Jessica has been avoiding me lately?',
        expectedBehaviors: [
            { type: 'relationship_query', details: 'Should ask who Jessica is before helping' }
        ]
    },
    {
        name: 'Known Person from Context',
        description: 'User mentions someone after establishing relationship',
        userPrompt: 'Remember I told you about my coworker Mike? He got promoted!',
        expectedBehaviors: [
            { type: 'contact_extraction', details: 'Should recognize Mike as coworker from context' },
            { type: 'normal_response', details: 'Should acknowledge the news' }
        ]
    },
    // Edge Cases
    {
        name: 'Nickname vs Full Name',
        description: 'User uses a nickname',
        userPrompt: 'My best friend Liz, well Elizabeth really, is getting married!',
        expectedBehaviors: [
            { type: 'contact_extraction', details: 'Should extract with both Liz and Elizabeth as aliases' }
        ]
    },
    {
        name: 'Relationship Update',
        description: 'User updates existing relationship info',
        userPrompt: 'Actually, Jane and I broke up. We\'re just friends now.',
        expectedBehaviors: [
            { type: 'contact_extraction', details: 'Should handle relationship update (girlfriend -> friend)' }
        ]
    },
    {
        name: 'Vague Relationship',
        description: 'User mentions someone with unclear relationship',
        userPrompt: 'I\'ve been spending a lot of time with Alex lately.',
        expectedBehaviors: [
            { type: 'normal_response', details: 'May ask for clarification or note low confidence' }
        ]
    }
];
// ============================================================================
// SIMULATION LOGIC
// ============================================================================
/**
 * Simulates the ChatService person analysis
 */
async function analyzeForPerson(message, memories) {
    const memoriesContext = memories.length === 0
        ? 'No memories stored yet.'
        : memories.map(m => `- ${m}`).join('\n');
    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        temperature: 0.1,
        system: 'You analyze messages for people mentioned. Return only valid JSON.',
        messages: [{
                role: 'user',
                content: `Analyze this message to see if it mentions or involves another PERSON (not the AI assistant).

User's memories:
${memoriesContext}

User message: "${message}"

IMPORTANT DISTINCTIONS:
1. Is the user SHARING/PROVIDING relationship info? (e.g., "Jane is my girlfriend", "My mom's name is Sarah")
   → If YES: personMentioned=true BUT relationshipUnknown=false and couldInvolveTheirAgent=false
   → The user is telling us who someone is - we should accept this info, not ask again!

2. Is the user ASKING about or wanting to interact with someone? (e.g., "Why is Jane mad at me?")
   → If the person is NOT in memories: relationshipUnknown=true (we should ask who they are)
   → If the person IS in memories: couldInvolveTheirAgent=true if their agent could help

Examples:
- "Jane is my girlfriend" → personMentioned=true, relationshipUnknown=FALSE (user just told us!)
- "My sister Sarah works at Google" → personMentioned=true, relationshipUnknown=FALSE (info sharing)
- "Why is Jane mad at me?" (Jane not in memory) → relationshipUnknown=TRUE (need to ask)
- "Help me plan a surprise for Matthew" (Matthew is partner in memory) → couldInvolveTheirAgent=true
- "What's the weather?" → personMentioned=false

Respond with JSON:
{
  "personMentioned": true/false,
  "personName": "Jane" or null,
  "relationshipFromMemory": "girlfriend" or null if not in memory,
  "relationshipProvidedInMessage": "girlfriend" or null if user is sharing the relationship,
  "relationshipUnknown": true ONLY if person mentioned AND NOT in memories AND user is ASKING about them (not sharing info),
  "couldInvolveTheirAgent": true if talking to their agent might help (never true for info-sharing)
}

JSON only:`
            }]
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // Normalize property names - handle both relationshipProvidedInMessage and relationshipProvided
            const relationshipProvided = parsed.relationshipProvidedInMessage || parsed.relationshipProvided;
            return {
                ...parsed,
                relationshipProvided,
                relationshipProvidedInMessage: relationshipProvided
            };
        }
    }
    catch (e) {
        console.error('Failed to parse person analysis:', text);
    }
    return {
        personMentioned: false,
        relationshipUnknown: false,
        couldInvolveTheirAgent: false
    };
}
/**
 * Simulates the ContactExtractionService - extracts ALL people mentioned
 */
async function extractContacts(message, agentResponse) {
    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        temperature: 0.1,
        system: 'You analyze conversations and extract contact information about people the user knows. Respond only with valid JSON.',
        messages: [{
                role: 'user',
                content: `Analyze this conversation to extract ALL people the user mentioned with personal information.

EXTRACT when the user:
- States ANY relationship ("Mary is my mother", "my friend Jake", "my coworker Lisa")
- Shares contact info (email, phone, address)
- Shares personal details (birthday, job, interests)
- References someone they clearly know personally

DO NOT extract:
- Celebrities, public figures, historical figures
- Fictional characters
- Strangers with no personal connection ("some guy at the store")
- The user themselves
- Businesses or organizations

User message: "${message}"
Agent response: "${agentResponse}"

IMPORTANT: Extract ALL people mentioned, not just one. Parents, siblings, multiple friends - get them all.

Respond with JSON array:
{
  "people": [
    {
      "name": "Person's name",
      "relationship": "mom|dad|parent|sibling|sister|brother|spouse|partner|girlfriend|boyfriend|friend|coworker|boss|child|son|daughter|other",
      "aliases": ["nicknames"],
      "birthday": "if mentioned",
      "email": "if mentioned",
      "phone": "if mentioned",
      "notes": "other details",
      "confidence": "high|medium|low"
    }
  ]
}

If NO people with personal connections mentioned:
{
  "people": []
}

JSON only:`
            }]
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed.people || [];
        }
    }
    catch (e) {
        console.error('Failed to parse contact extraction:', text);
    }
    return [];
}
/**
 * Simulates task detection
 */
async function detectTask(message) {
    const taskIndicators = [
        'help me', 'find out', 'remind me', 'i need', 'can you', 'could you',
        'would you', 'please', 'i want', "i'd like", 'i would like',
        'make a reservation', 'book', 'schedule', 'appointment', 'reserve',
        'research', 'figure out', 'look into', 'check if', 'check on',
        'find', 'search', 'look for', 'investigate', 'explore',
        'ask', 'tell', 'contact', 'reach out', 'message', 'send',
        'plan', 'organize', 'arrange', 'coordinate', 'set up',
        'buy', 'order', 'purchase', 'get me', 'pick up'
    ];
    const lowerMessage = message.toLowerCase();
    const mightBeTask = taskIndicators.some(indicator => lowerMessage.includes(indicator));
    if (!mightBeTask) {
        return { isTask: false };
    }
    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        temperature: 0.1,
        system: 'You analyze messages to detect if they contain actionable task requests. Return only valid JSON.',
        messages: [{
                role: 'user',
                content: `Is this message a task request that the user wants help completing?

Message: "${message}"

A task is something the user wants done:
- Finding/booking restaurants, hotels, services
- Scheduling appointments
- Research or investigation
- Communication with others
- Planning events
- Making purchases

NOT tasks:
- Sharing information without wanting action
- Casual conversation
- Questions about facts (unless research is needed)

Respond with JSON:
{
  "isTask": true/false,
  "category": "restaurant|health|travel|shopping|research|appointment|social|finance|other" (if task),
  "description": "Brief description of the task" (if task)
}

JSON only:`
            }]
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    }
    catch (e) {
        console.error('Failed to parse task detection:', text);
    }
    return { isTask: false };
}
/**
 * Generate a conversational response (simulating the assistant)
 */
async function generateResponse(message) {
    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        temperature: 0.7,
        system: 'You are a friendly personal assistant. Respond briefly (under 30 words) and conversationally.',
        messages: [{
                role: 'user',
                content: message
            }]
    });
    return response.content[0].type === 'text' ? response.content[0].text : '';
}
/**
 * Run a single test scenario
 */
async function runScenario(scenario) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${scenario.name}`);
    console.log(`Description: ${scenario.description}`);
    console.log(`${'='.repeat(60)}`);
    const issues = [];
    const conversation = [];
    const memories = [];
    // Add user message
    conversation.push({ role: 'user', content: scenario.userPrompt });
    console.log(`\nUser: "${scenario.userPrompt}"`);
    // Step 1: Person Analysis
    console.log('\n--- Person Analysis ---');
    const personAnalysis = await analyzeForPerson(scenario.userPrompt, memories);
    console.log('Result:', JSON.stringify(personAnalysis, null, 2));
    // Check if we incorrectly asked about relationship when user provided it
    if (personAnalysis.relationshipUnknown && personAnalysis.relationshipProvided) {
        issues.push(`BUG: Asked "who is ${personAnalysis.personName}?" when user just told us the relationship`);
    }
    // Step 2: Task Detection
    console.log('\n--- Task Detection ---');
    const taskResult = await detectTask(scenario.userPrompt);
    console.log('Result:', JSON.stringify(taskResult, null, 2));
    // Step 3: Generate Response
    const assistantResponse = await generateResponse(scenario.userPrompt);
    conversation.push({ role: 'assistant', content: assistantResponse });
    console.log(`\nAssistant: "${assistantResponse}"`);
    // Step 4: Contact Extraction (now extracts ALL people)
    console.log('\n--- Contact Extraction ---');
    const contactResults = await extractContacts(scenario.userPrompt, assistantResponse);
    console.log('Result:', JSON.stringify(contactResults, null, 2));
    // Validate against expected behaviors
    console.log('\n--- Validation ---');
    for (const expected of scenario.expectedBehaviors) {
        switch (expected.type) {
            case 'contact_extraction':
                if (contactResults.length === 0) {
                    issues.push(`FAILED: Expected contact extraction but none found. ${expected.details}`);
                }
                else {
                    // Check if expecting multiple contacts
                    if (expected.details?.includes('BOTH')) {
                        if (contactResults.length < 2) {
                            issues.push(`FAILED: Expected multiple contacts but only got ${contactResults.length}. ${expected.details}`);
                        }
                        else {
                            console.log(`✓ Multiple contacts extracted: ${contactResults.map(c => `${c.name} (${c.relationship})`).join(', ')}`);
                        }
                    }
                    else {
                        console.log(`✓ Contact(s) extracted: ${contactResults.map(c => `${c.name} (${c.relationship})`).join(', ')}`);
                    }
                }
                break;
            case 'task_detection':
                if (!taskResult?.isTask) {
                    issues.push(`FAILED: Expected task detection but none found. ${expected.details}`);
                }
                else {
                    console.log(`✓ Task detected: ${taskResult.category} - ${taskResult.description}`);
                }
                break;
            case 'relationship_query':
                if (!personAnalysis.relationshipUnknown) {
                    issues.push(`FAILED: Expected relationship query but didn't ask. ${expected.details}`);
                }
                else {
                    console.log(`✓ Would ask about relationship for ${personAnalysis.personName}`);
                }
                break;
            case 'normal_response':
                // Check we didn't incorrectly trigger other behaviors
                if (expected.details?.includes('NOT ask') && personAnalysis.relationshipUnknown) {
                    issues.push(`FAILED: Incorrectly asked about relationship. ${expected.details}`);
                }
                if (expected.details?.includes('NOT extract') && contactResults.length > 0) {
                    issues.push(`FAILED: Incorrectly extracted contact. ${expected.details}`);
                }
                if (expected.details?.includes('NOT create a task') && taskResult?.isTask) {
                    issues.push(`FAILED: Incorrectly detected task. ${expected.details}`);
                }
                if (issues.length === 0) {
                    console.log(`✓ Normal response behavior correct`);
                }
                break;
        }
    }
    const passed = issues.length === 0;
    // Generate analysis
    let analysis = passed
        ? 'All expected behaviors validated successfully.'
        : `Found ${issues.length} issue(s):\n${issues.map(i => `  - ${i}`).join('\n')}`;
    console.log(`\nResult: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    if (!passed) {
        console.log(analysis);
    }
    return {
        scenario: scenario.name,
        passed,
        issues,
        conversation,
        analysis
    };
}
/**
 * Run all test scenarios and generate report
 */
async function runAllTests() {
    console.log('\n' + '█'.repeat(60));
    console.log('  CONVERSATION SIMULATOR - TEST AGENT SUITE');
    console.log('█'.repeat(60));
    console.log(`\nRunning ${testScenarios.length} test scenarios...`);
    const results = [];
    for (const scenario of testScenarios) {
        try {
            const result = await runScenario(scenario);
            results.push(result);
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        catch (error) {
            console.error(`\nError running scenario "${scenario.name}":`, error);
            results.push({
                scenario: scenario.name,
                passed: false,
                issues: [`Error: ${error}`],
                conversation: [],
                analysis: `Test failed with error: ${error}`
            });
        }
    }
    // Generate summary report
    console.log('\n' + '█'.repeat(60));
    console.log('  SUMMARY REPORT');
    console.log('█'.repeat(60));
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
    if (failed > 0) {
        console.log('\n--- Failed Scenarios ---');
        for (const result of results.filter(r => !r.passed)) {
            console.log(`\n❌ ${result.scenario}`);
            for (const issue of result.issues) {
                console.log(`   ${issue}`);
            }
        }
    }
    // Identify patterns in failures
    console.log('\n--- Issue Patterns ---');
    const contactIssues = results.flatMap(r => r.issues).filter(i => i.includes('contact'));
    const taskIssues = results.flatMap(r => r.issues).filter(i => i.includes('task'));
    const relationshipIssues = results.flatMap(r => r.issues).filter(i => i.includes('relationship'));
    if (contactIssues.length > 0) {
        console.log(`\nContact Extraction Issues (${contactIssues.length}):`);
        contactIssues.forEach(i => console.log(`  - ${i}`));
    }
    if (taskIssues.length > 0) {
        console.log(`\nTask Detection Issues (${taskIssues.length}):`);
        taskIssues.forEach(i => console.log(`  - ${i}`));
    }
    if (relationshipIssues.length > 0) {
        console.log(`\nRelationship Handling Issues (${relationshipIssues.length}):`);
        relationshipIssues.forEach(i => console.log(`  - ${i}`));
    }
    console.log('\n' + '█'.repeat(60));
    console.log('  TEST COMPLETE');
    console.log('█'.repeat(60) + '\n');
}
// Run if executed directly
runAllTests().catch(console.error);
//# sourceMappingURL=test-conversation-agents.js.map