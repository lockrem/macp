#!/usr/bin/env npx ts-node
/**
 * AI Utilities Test Script
 *
 * Tests all AI utility endpoints with comprehensive test cases.
 * Run with: npx ts-node scripts/test-ai-utilities.ts
 *
 * Options:
 *   --endpoint=<name>  Run tests for specific endpoint only
 *   --local            Test against local server (default: production)
 */

const API_URL = process.argv.includes('--local')
  ? 'http://localhost:3000'
  : 'https://mmfhsdeuze.execute-api.us-east-1.amazonaws.com';

// -----------------------------------------------------------------------------
// Test Cases
// -----------------------------------------------------------------------------

const extractTaskTests = [
  // Clear tasks
  { id: 'task-001', input: { message: 'Book a table for 4 at 7pm' }, expected: { isTask: true } },
  { id: 'task-002', input: { message: 'Ask Jane what time the dinner reservation is' }, expected: { isTask: true } },
  { id: 'task-003', input: { message: 'Find out when mom\'s flight lands' }, expected: { isTask: true } },
  { id: 'task-004', input: { message: 'Schedule a dentist appointment for next week' }, expected: { isTask: true } },
  { id: 'task-005', input: { message: 'Order flowers for Sarah\'s birthday' }, expected: { isTask: true } },
  { id: 'task-006', input: { message: 'Check with John about the meeting time' }, expected: { isTask: true } },
  { id: 'task-007', input: { message: 'Research the best restaurants in downtown' }, expected: { isTask: true } },
  { id: 'task-008', input: { message: 'Remind me to call the insurance company' }, expected: { isTask: true } },
  { id: 'task-009', input: { message: 'Find out Mary\'s birthday' }, expected: { isTask: true } },
  { id: 'task-010', input: { message: 'Ask my sister if she can babysit Friday' }, expected: { isTask: true } },

  // Not tasks (conversation)
  { id: 'conv-001', input: { message: 'How are you today?' }, expected: { isTask: false } },
  { id: 'conv-002', input: { message: 'What\'s the weather like?' }, expected: { isTask: false } },
  { id: 'conv-003', input: { message: 'Tell me a joke' }, expected: { isTask: false } },
  { id: 'conv-004', input: { message: 'I had a great day today' }, expected: { isTask: false } },
  { id: 'conv-005', input: { message: 'What do you think about AI?' }, expected: { isTask: false } },
  { id: 'conv-006', input: { message: 'Thanks for your help!' }, expected: { isTask: false } },
  { id: 'conv-007', input: { message: 'I\'m feeling tired' }, expected: { isTask: false } },
  { id: 'conv-008', input: { message: 'Good morning!' }, expected: { isTask: false } },

  // Edge cases
  { id: 'edge-001', input: { message: 'I need to remember to call John' }, expected: { isTask: true } },
  { id: 'edge-002', input: { message: 'Can you help me plan a trip?' }, expected: { isTask: false } }, // General request, not specific task
  { id: 'edge-003', input: { message: 'What should I get for dinner?' }, expected: { isTask: false } },
  { id: 'edge-004', input: { message: 'Let me know when Sarah responds' }, expected: { isTask: true } },
  { id: 'edge-005', input: { message: 'Book flights to Tokyo for next month' }, expected: { isTask: true } }, // Specific task
];

const extractNamesTests = [
  { id: 'name-001', input: { text: 'Ask Jane about the party' }, expected: { hasNames: true } },
  { id: 'name-002', input: { text: 'Call my mom tomorrow' }, expected: { hasNames: true } },
  { id: 'name-003', input: { text: 'Meet John and Sarah at the coffee shop' }, expected: { hasNames: true } },
  { id: 'name-004', input: { text: 'Book a table for tonight' }, expected: { hasNames: false } },
  { id: 'name-005', input: { text: 'Dr. Smith\'s office called' }, expected: { hasNames: true } },
  { id: 'name-006', input: { text: 'The Amazon package arrived' }, expected: { hasNames: true } }, // Amazon is an org
  { id: 'name-007', input: { text: 'Meeting at Google headquarters' }, expected: { hasNames: true } },
  { id: 'name-008', input: { text: 'My girlfriend wants to go to Paris' }, expected: { hasNames: true } }, // Paris is a place
  { id: 'name-009', input: { text: 'Check with my sister about Thanksgiving' }, expected: { hasNames: true } }, // Thanksgiving is a holiday name
  { id: 'name-010', input: { text: 'Emily and her brother are coming' }, expected: { hasNames: true } },
];

const matchContactTests = [
  {
    id: 'match-001',
    input: {
      personName: 'Jane',
      contacts: [
        { id: '1', name: 'Jane Smith', relationship: 'girlfriend' },
        { id: '2', name: 'John Doe', relationship: 'friend' },
      ],
    },
    expected: { matched: true, contactId: '1' },
  },
  // Ambiguous name tests - should match with lower confidence
  {
    id: 'match-ambig-001',
    input: {
      personName: 'Matthew',
      contacts: [
        { id: '1', name: 'Matthew Johnson', relationship: 'son' },
        { id: '2', name: 'Matthew Williams', relationship: 'friend' },
      ],
    },
    expected: { matched: true, lowConfidence: true }, // Should match but with lower confidence
  },
  {
    id: 'match-ambig-002',
    input: {
      personName: 'Sarah',
      contacts: [
        { id: '1', name: 'Sarah Miller', relationship: 'sister' },
        { id: '2', name: 'Sarah Davis', relationship: 'coworker' },
        { id: '3', name: 'Sarah Brown', relationship: 'neighbor' },
      ],
    },
    expected: { matched: true, lowConfidence: true }, // Multiple Sarahs = ambiguous
  },
  {
    id: 'match-002',
    input: {
      personName: 'Johnny',
      contacts: [
        { id: '1', name: 'John Smith', aliases: ['Johnny', 'John-boy'] },
        { id: '2', name: 'Jane Doe' },
      ],
    },
    expected: { matched: true, contactId: '1' },
  },
  {
    id: 'match-003',
    input: {
      personName: 'Bob',
      contacts: [
        { id: '1', name: 'Jane Smith' },
        { id: '2', name: 'John Doe' },
      ],
    },
    expected: { matched: false },
  },
  {
    id: 'match-004',
    input: {
      personName: 'Mom',
      contacts: [
        { id: '1', name: 'Susan Miller', aliases: ['Mom', 'Mother'] },
        { id: '2', name: 'John Doe' },
      ],
    },
    expected: { matched: true, contactId: '1' },
  },
  {
    id: 'match-005',
    input: {
      personName: 'Dr. Johnson',
      contacts: [
        { id: '1', name: 'Robert Johnson', relationship: 'doctor' },
        { id: '2', name: 'Emily Johnson', relationship: 'friend' },
      ],
    },
    expected: { matched: true, contactId: '1' },
  },
];

const detectCompletionTests = [
  {
    id: 'complete-001',
    input: {
      taskDescription: 'Book a table for 4 at 7pm',
      agentResponse: 'I\'ve made a reservation for 4 people at 7pm at La Trattoria. Confirmation number: 12345.',
    },
    expected: { completed: true },
  },
  {
    id: 'complete-002',
    input: {
      taskDescription: 'Find out Jane\'s birthday',
      agentResponse: 'Jane\'s birthday is March 15th.',
    },
    expected: { completed: true },
  },
  {
    id: 'complete-003',
    input: {
      taskDescription: 'Schedule a dentist appointment',
      agentResponse: 'I\'ll need to check the available times. What day works best for you?',
    },
    expected: { completed: false },
  },
  {
    id: 'complete-004',
    input: {
      taskDescription: 'Order flowers for Sarah',
      agentResponse: 'Your order has been placed! A bouquet of roses will be delivered to Sarah tomorrow.',
    },
    expected: { completed: true },
  },
  {
    id: 'complete-005',
    input: {
      taskDescription: 'Check flight status',
      agentResponse: 'I\'m sorry, I couldn\'t find any flights matching that description. Could you provide more details?',
    },
    expected: { completed: false },
  },
];

const extractFactsTests = [
  {
    id: 'facts-001',
    input: {
      conversation: [
        { role: 'user', content: 'I\'m allergic to shellfish' },
        { role: 'assistant', content: 'I\'ll make a note of that. Is there anything else I should know about your dietary restrictions?' },
      ],
    },
    expected: { hasFacts: true },
  },
  {
    id: 'facts-002',
    input: {
      conversation: [
        { role: 'user', content: 'My favorite color is blue and I love Italian food' },
        { role: 'assistant', content: 'Great choices!' },
      ],
    },
    expected: { hasFacts: true },
  },
  {
    id: 'facts-003',
    input: {
      conversation: [
        { role: 'user', content: 'Hello, how are you?' },
        { role: 'assistant', content: 'I\'m doing well, thank you!' },
      ],
    },
    expected: { hasFacts: false },
  },
  {
    id: 'facts-004',
    input: {
      conversation: [
        { role: 'user', content: 'I work at Google as a software engineer' },
        { role: 'assistant', content: 'That sounds interesting!' },
        { role: 'user', content: 'Yes, I\'ve been there for 5 years now' },
      ],
    },
    expected: { hasFacts: true },
  },
];

// -----------------------------------------------------------------------------
// Test Runner
// -----------------------------------------------------------------------------

interface TestResult {
  id: string;
  passed: boolean;
  expected: any;
  actual: any;
  error?: string;
  durationMs: number;
}

async function runTest(endpoint: string, testCase: any): Promise<TestResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${API_URL}/api/ai/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testCase.input),
    });

    const result = await response.json() as any;
    const durationMs = Date.now() - start;

    // Validate based on expected values
    let passed = true;
    const expected = testCase.expected;

    if (endpoint === 'extract-task') {
      passed = result.isTask === expected.isTask;
    } else if (endpoint === 'extract-names') {
      const hasNames = result.names && result.names.length > 0;
      passed = hasNames === expected.hasNames;
    } else if (endpoint === 'match-contact') {
      passed = result.matched === expected.matched;
      if (expected.contactId && result.matched) {
        passed = passed && result.contactId === expected.contactId;
      }
      // For ambiguous matches, verify confidence is appropriately lower
      if (expected.lowConfidence && result.matched) {
        passed = passed && result.confidence < 0.8;
      }
    } else if (endpoint === 'detect-completion') {
      passed = result.completed === expected.completed;
    } else if (endpoint === 'extract-facts') {
      const hasFacts = result.facts && result.facts.length > 0;
      passed = hasFacts === expected.hasFacts;
    }

    return {
      id: testCase.id,
      passed,
      expected,
      actual: result,
      durationMs,
    };
  } catch (error) {
    return {
      id: testCase.id,
      passed: false,
      expected: testCase.expected,
      actual: null,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
}

async function runTestSuite(name: string, endpoint: string, tests: any[]) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`Endpoint: /api/ai/${endpoint}`);
  console.log(`Tests: ${tests.length}`);
  console.log('='.repeat(60));

  const results: TestResult[] = [];

  for (const test of tests) {
    const result = await runTest(endpoint, test);
    results.push(result);

    const status = result.passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${status} ${result.id} (${result.durationMs}ms)`);

    if (!result.passed) {
      console.log(`       Expected: ${JSON.stringify(result.expected)}`);
      if (result.error) {
        console.log(`       Error: ${result.error}`);
      } else {
        const relevantActual = endpoint === 'extract-task'
          ? { isTask: result.actual?.isTask, confidence: result.actual?.confidence }
          : endpoint === 'extract-names'
          ? { names: result.actual?.names?.map((n: any) => n.name) }
          : endpoint === 'match-contact'
          ? { matched: result.actual?.matched, contactId: result.actual?.contactId }
          : endpoint === 'detect-completion'
          ? { completed: result.actual?.completed, outcome: result.actual?.outcome }
          : { factCount: result.actual?.facts?.length };
        console.log(`       Actual: ${JSON.stringify(relevantActual)}`);
      }
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const avgDuration = Math.round(results.reduce((sum, r) => sum + r.durationMs, 0) / results.length);

  console.log(`\nSummary: ${passed}/${tests.length} passed, ${failed} failed`);
  console.log(`Average response time: ${avgDuration}ms`);

  return { name, passed, failed, total: tests.length, avgDuration };
}

async function main() {
  console.log('AI Utilities Test Suite');
  console.log(`API: ${API_URL}`);
  console.log(`Time: ${new Date().toISOString()}`);

  const targetEndpoint = process.argv.find(a => a.startsWith('--endpoint='))?.split('=')[1];

  const allResults = [];

  if (!targetEndpoint || targetEndpoint === 'extract-task') {
    allResults.push(await runTestSuite('Extract Task', 'extract-task', extractTaskTests));
  }

  if (!targetEndpoint || targetEndpoint === 'extract-names') {
    allResults.push(await runTestSuite('Extract Names', 'extract-names', extractNamesTests));
  }

  if (!targetEndpoint || targetEndpoint === 'match-contact') {
    allResults.push(await runTestSuite('Match Contact', 'match-contact', matchContactTests));
  }

  if (!targetEndpoint || targetEndpoint === 'detect-completion') {
    allResults.push(await runTestSuite('Detect Completion', 'detect-completion', detectCompletionTests));
  }

  if (!targetEndpoint || targetEndpoint === 'extract-facts') {
    allResults.push(await runTestSuite('Extract Facts', 'extract-facts', extractFactsTests));
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));

  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;

  for (const result of allResults) {
    const status = result.failed === 0 ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`${status} ${result.name}: ${result.passed}/${result.total} (avg ${result.avgDuration}ms)`);
    totalPassed += result.passed;
    totalFailed += result.failed;
    totalTests += result.total;
  }

  console.log(`\nTotal: ${totalPassed}/${totalTests} passed`);

  if (totalFailed > 0) {
    console.log(`\x1b[31m${totalFailed} tests failed\x1b[0m`);
    process.exit(1);
  } else {
    console.log('\x1b[32mAll tests passed!\x1b[0m');
  }
}

main().catch(console.error);
