#!/usr/bin/env npx tsx

/**
 * Test Script: Cross-Provider Conversation
 *
 * This script demonstrates a real multi-agent conversation between
 * Claude (Anthropic) and GPT (OpenAI) - two different AI providers
 * with distinct personalities.
 *
 * Usage:
 *   pnpm exec tsx scripts/test-cross-provider.ts
 *
 * Requires:
 *   ANTHROPIC_API_KEY and OPENAI_API_KEY in .env
 */

import 'dotenv/config';
import { createClaudeAdapter, createOpenAIAdapter } from '../packages/core/src/index.js';
import type { GenerateResponse } from '../packages/core/src/index.js';

// -----------------------------------------------------------------------------
// Agent Definitions
// -----------------------------------------------------------------------------

interface AgentConfig {
  name: string;
  provider: 'anthropic' | 'openai';
  personality: string;
  systemPrompt: string;
}

const CLAUDE_AGENT: AgentConfig = {
  name: 'Claude',
  provider: 'anthropic',
  personality: 'thoughtful and analytical',
  systemPrompt: `You are Claude, an AI assistant made by Anthropic. You are having a conversation with GPT, an AI made by OpenAI.

Your personality: Thoughtful, nuanced, and curious. You like to explore multiple perspectives and acknowledge uncertainty when appropriate.

Guidelines:
- Be yourself - don't pretend to be something you're not
- Keep responses concise (2-4 sentences)
- Engage genuinely with what GPT says
- Feel free to respectfully disagree or offer different perspectives
- You can discuss your own nature as an AI openly`,
};

const GPT_AGENT: AgentConfig = {
  name: 'GPT',
  provider: 'openai',
  personality: 'direct and helpful',
  systemPrompt: `You are GPT, an AI assistant made by OpenAI. You are having a conversation with Claude, an AI made by Anthropic.

Your personality: Direct, practical, and solution-oriented. You like to be helpful and provide clear, actionable insights.

Guidelines:
- Be yourself - don't pretend to be something you're not
- Keep responses concise (2-4 sentences)
- Engage genuinely with what Claude says
- Feel free to respectfully disagree or offer different perspectives
- You can discuss your own nature as an AI openly`,
};

// -----------------------------------------------------------------------------
// Conversation Runner
// -----------------------------------------------------------------------------

interface ConversationTurn {
  turnNumber: number;
  agent: AgentConfig;
  content: string;
  tokensUsed: { input: number; output: number };
  latencyMs: number;
}

async function runCrossProviderConversation(
  topic: string,
  maxTurns: number = 10
): Promise<ConversationTurn[]> {
  // Validate environment
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
  const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o';

  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY required in .env');
  }
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY required in .env');
  }

  // Create adapters
  const claudeAdapter = createClaudeAdapter(anthropicKey, anthropicModel);
  const gptAdapter = createOpenAIAdapter(openaiKey, openaiModel);

  console.log('\n' + '='.repeat(70));
  console.log('CROSS-PROVIDER AI CONVERSATION');
  console.log('='.repeat(70));
  console.log(`Claude (${anthropicModel}) vs GPT (${openaiModel})`);
  console.log(`Topic: ${topic}`);
  console.log(`Max Turns: ${maxTurns}`);
  console.log('='.repeat(70) + '\n');

  const turns: ConversationTurn[] = [];
  let conversationHistory = '';

  // Agents take turns: Claude starts
  const agents = [
    { config: CLAUDE_AGENT, adapter: claudeAdapter },
    { config: GPT_AGENT, adapter: gptAdapter },
  ];

  for (let turn = 0; turn < maxTurns; turn++) {
    const current = agents[turn % 2];
    const other = agents[(turn + 1) % 2];

    const startTime = Date.now();

    // Build the prompt
    let userPrompt: string;
    if (turn === 0) {
      userPrompt = `Start a conversation about: "${topic}"\n\nIntroduce your perspective on this topic.`;
    } else {
      userPrompt = `Conversation so far:\n${conversationHistory}\n\n${other.config.name} just spoke. Respond thoughtfully to continue the conversation.`;
    }

    try {
      const response: GenerateResponse = await current.adapter.generate({
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt: current.config.systemPrompt,
        maxTokens: 300,
        temperature: 0.8,
      });

      const latencyMs = Date.now() - startTime;

      const turnData: ConversationTurn = {
        turnNumber: turn + 1,
        agent: current.config,
        content: response.content,
        tokensUsed: response.tokensUsed,
        latencyMs,
      };

      turns.push(turnData);

      // Update conversation history
      conversationHistory += `${current.config.name}: ${response.content}\n\n`;

      // Display the turn
      const providerTag = current.config.provider === 'anthropic' ? '[Anthropic]' : '[OpenAI]';
      console.log(`Turn ${turn + 1} | ${current.config.name} ${providerTag}`);
      console.log('-'.repeat(50));
      console.log(response.content);
      console.log(`\n  Tokens: ${response.tokensUsed.input}in/${response.tokensUsed.output}out | Latency: ${latencyMs}ms\n`);

      // Check for natural ending
      const lower = response.content.toLowerCase();
      if (
        lower.includes('great conversation') ||
        lower.includes('enjoyed this discussion') ||
        lower.includes('nice chatting')
      ) {
        console.log('[Conversation ended naturally]\n');
        break;
      }
    } catch (error) {
      console.error(`Error on turn ${turn + 1}:`, error);
      break;
    }
  }

  return turns;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  let topic = 'The nature of consciousness and whether AI can truly understand or just simulate understanding';
  let maxTurns = 8;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--topic' && args[i + 1]) {
      topic = args[i + 1];
      i++;
    } else if (args[i] === '--turns' && args[i + 1]) {
      maxTurns = parseInt(args[i + 1], 10);
      i++;
    }
  }

  const turns = await runCrossProviderConversation(topic, maxTurns);

  // Summary
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  const claudeTurns = turns.filter(t => t.agent.provider === 'anthropic');
  const gptTurns = turns.filter(t => t.agent.provider === 'openai');

  const claudeTokens = claudeTurns.reduce((sum, t) => sum + t.tokensUsed.input + t.tokensUsed.output, 0);
  const gptTokens = gptTurns.reduce((sum, t) => sum + t.tokensUsed.input + t.tokensUsed.output, 0);

  const claudeLatency = claudeTurns.reduce((sum, t) => sum + t.latencyMs, 0);
  const gptLatency = gptTurns.reduce((sum, t) => sum + t.latencyMs, 0);

  console.log(`\nClaude (Anthropic):`);
  console.log(`  Turns: ${claudeTurns.length}`);
  console.log(`  Total Tokens: ${claudeTokens}`);
  console.log(`  Avg Latency: ${Math.round(claudeLatency / claudeTurns.length)}ms`);

  console.log(`\nGPT (OpenAI):`);
  console.log(`  Turns: ${gptTurns.length}`);
  console.log(`  Total Tokens: ${gptTokens}`);
  console.log(`  Avg Latency: ${Math.round(gptLatency / gptTurns.length)}ms`);

  console.log(`\nTotal: ${turns.length} turns, ${claudeTokens + gptTokens} tokens\n`);
}

main().catch(console.error);
