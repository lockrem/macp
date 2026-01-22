#!/usr/bin/env npx tsx

/**
 * Test Script: P2P Conversation
 *
 * This script demonstrates a P2P conversation between two mock agents.
 * It doesn't require any API keys or external services.
 *
 * Usage:
 *   npx tsx scripts/test-p2p-conversation.ts
 *
 * Options:
 *   --turns <n>     Number of turns (default: 10)
 *   --verbose       Show detailed output
 *   --real          Use real Claude API (requires ANTHROPIC_API_KEY)
 */

import 'dotenv/config';
import { createMockAdapter, createClaudeAdapter } from '../packages/core/src/index.js';
import type { Agent, AgentCapability } from '../packages/shared/src/index.js';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

interface TestConfig {
  maxTurns: number;
  verbose: boolean;
  useRealApi: boolean;
  topic: string;
  goal: string;
}

function parseArgs(): TestConfig {
  const args = process.argv.slice(2);
  const config: TestConfig = {
    maxTurns: 10,
    verbose: false,
    useRealApi: false,
    topic: 'The future of AI collaboration',
    goal: 'Explore how AI agents can work together effectively',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--turns' && args[i + 1]) {
      config.maxTurns = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--verbose') {
      config.verbose = true;
    } else if (args[i] === '--real') {
      config.useRealApi = true;
    } else if (args[i] === '--topic' && args[i + 1]) {
      config.topic = args[i + 1];
      i++;
    }
  }

  return config;
}

// -----------------------------------------------------------------------------
// Test Agents
// -----------------------------------------------------------------------------

function createTestAgent(id: string, name: string, personality: string): Agent {
  const capabilities: AgentCapability[] = [
    {
      domain: 'general',
      expertiseLevel: 0.8,
      languages: ['en'],
      specializations: ['discussion', 'analysis'],
    },
  ];

  return {
    id,
    ownerId: 'test-user',
    displayName: name,
    provider: 'custom',
    modelConfig: {
      modelId: 'mock-model',
      temperature: 0.7,
      maxTokens: 1000,
    },
    capabilities,
    preferences: {
      communicationStyle: 'casual',
      verbosity: 'balanced',
      proactivity: 'balanced',
    },
    status: 'online',
    createdAt: new Date(),
    lastActiveAt: new Date(),
  };
}

// -----------------------------------------------------------------------------
// Simple Conversation Runner (No Redis Required)
// -----------------------------------------------------------------------------

interface ConversationTurn {
  turnNumber: number;
  agentId: string;
  agentName: string;
  content: string;
  tokensUsed: number;
  latencyMs: number;
}

interface ConversationResult {
  turns: ConversationTurn[];
  totalTokens: number;
  totalDurationMs: number;
  terminationReason: string;
}

async function runSimpleP2PConversation(
  agent1: Agent,
  agent2: Agent,
  adapter1: ReturnType<typeof createMockAdapter>,
  adapter2: ReturnType<typeof createMockAdapter>,
  config: TestConfig
): Promise<ConversationResult> {
  const turns: ConversationTurn[] = [];
  let totalTokens = 0;
  const startTime = Date.now();

  const agents = [
    { agent: agent1, adapter: adapter1 },
    { agent: agent2, adapter: adapter2 },
  ];

  // Build conversation context
  let conversationHistory = `Topic: ${config.topic}\nGoal: ${config.goal}\n\n`;

  console.log('\n' + '='.repeat(60));
  console.log(`Starting P2P Conversation`);
  console.log(`Topic: ${config.topic}`);
  console.log(`Goal: ${config.goal}`);
  console.log(`Max Turns: ${config.maxTurns}`);
  console.log('='.repeat(60) + '\n');

  for (let turn = 0; turn < config.maxTurns; turn++) {
    const currentAgent = agents[turn % 2];
    const otherAgent = agents[(turn + 1) % 2];

    const turnStart = Date.now();

    // Build prompt for this turn
    const prompt = turn === 0
      ? `You are ${currentAgent.agent.displayName}. Start a conversation about: ${config.topic}. Goal: ${config.goal}. Be concise (2-3 sentences).`
      : `You are ${currentAgent.agent.displayName} in a conversation with ${otherAgent.agent.displayName}.\n\nConversation so far:\n${conversationHistory}\n\nRespond thoughtfully and concisely (2-3 sentences). Build on what was said.`;

    try {
      const response = await currentAgent.adapter.generate({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 200,
      });

      const latencyMs = Date.now() - turnStart;
      const tokensUsed = response.tokensUsed.input + response.tokensUsed.output;
      totalTokens += tokensUsed;

      const turnData: ConversationTurn = {
        turnNumber: turn + 1,
        agentId: currentAgent.agent.id,
        agentName: currentAgent.agent.displayName,
        content: response.content,
        tokensUsed,
        latencyMs,
      };

      turns.push(turnData);

      // Update conversation history
      conversationHistory += `${currentAgent.agent.displayName}: ${response.content}\n\n`;

      // Print turn
      console.log(`[Turn ${turn + 1}] ${currentAgent.agent.displayName}:`);
      console.log(`  ${response.content}`);
      if (config.verbose) {
        console.log(`  (${tokensUsed} tokens, ${latencyMs}ms)`);
      }
      console.log();

      // Check for natural conclusion
      const lowerContent = response.content.toLowerCase();
      if (
        lowerContent.includes('in conclusion') ||
        lowerContent.includes('to summarize') ||
        lowerContent.includes("that's a great point to end on")
      ) {
        return {
          turns,
          totalTokens,
          totalDurationMs: Date.now() - startTime,
          terminationReason: 'natural_conclusion',
        };
      }
    } catch (error) {
      console.error(`Error on turn ${turn + 1}:`, error);
      return {
        turns,
        totalTokens,
        totalDurationMs: Date.now() - startTime,
        terminationReason: 'error',
      };
    }
  }

  return {
    turns,
    totalTokens,
    totalDurationMs: Date.now() - startTime,
    terminationReason: 'max_turns',
  };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const config = parseArgs();

  console.log('\n🤖 MACP P2P Conversation Test\n');

  // Create test agents
  const agent1 = createTestAgent('alice-agent', 'Alice', 'thoughtful and analytical');
  const agent2 = createTestAgent('bob-agent', 'Bob', 'creative and enthusiastic');

  // Create adapters
  let adapter1: ReturnType<typeof createMockAdapter>;
  let adapter2: ReturnType<typeof createMockAdapter>;

  if (config.useRealApi) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    if (!apiKey) {
      console.error('Error: ANTHROPIC_API_KEY environment variable required for --real mode');
      process.exit(1);
    }
    console.log(`Using real Claude API (${model})...\n`);
    adapter1 = createClaudeAdapter(apiKey, model) as any;
    adapter2 = createClaudeAdapter(apiKey, model) as any;
  } else {
    console.log('Using mock adapters (no API calls)...\n');
    adapter1 = createMockAdapter({
      responseDelayMs: 50,
      responses: [
        "I think AI collaboration is fascinating. The ability for different AI systems to work together could unlock capabilities that neither could achieve alone. What aspects interest you most?",
        "That's a great point. I believe the key challenge is establishing common protocols and shared understanding. Without that foundation, collaboration becomes difficult.",
        "Absolutely. Trust and verification are crucial. We need mechanisms to validate that collaborating agents are behaving as expected and producing reliable outputs.",
        "I agree that transparency is essential. Perhaps we should also consider how human oversight fits into these collaborative systems.",
        "To summarize our discussion: effective AI collaboration requires common protocols, trust mechanisms, and human oversight. These foundations will enable powerful multi-agent systems.",
      ],
    });
    adapter2 = createMockAdapter({
      responseDelayMs: 50,
      responses: [
        "I'm particularly interested in emergent behaviors. When multiple AI agents interact, they might develop solutions that weren't explicitly programmed. That's exciting!",
        "You raise an important point about protocols. I think we also need to consider how agents can learn from each other and improve over time.",
        "Trust is definitely key. I wonder if reputation systems or cryptographic verification could help establish trust between unfamiliar agents.",
        "Human oversight is crucial, especially in the early stages. But I hope we can eventually develop systems that are trustworthy enough for more autonomous operation.",
        "Great conversation! I think we've covered the essential elements: protocols, learning, trust, and oversight. The future of AI collaboration looks promising.",
      ],
    });
  }

  // Run conversation
  const result = await runSimpleP2PConversation(
    agent1,
    agent2,
    adapter1,
    adapter2,
    config
  );

  // Print summary
  console.log('='.repeat(60));
  console.log('Conversation Summary');
  console.log('='.repeat(60));
  console.log(`Total Turns: ${result.turns.length}`);
  console.log(`Total Tokens: ${result.totalTokens}`);
  console.log(`Total Duration: ${result.totalDurationMs}ms`);
  console.log(`Termination: ${result.terminationReason}`);

  if (config.verbose) {
    console.log('\nToken Breakdown:');
    result.turns.forEach((turn) => {
      console.log(`  Turn ${turn.turnNumber} (${turn.agentName}): ${turn.tokensUsed} tokens`);
    });
  }

  console.log('\n✅ Test completed successfully!\n');
}

main().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
