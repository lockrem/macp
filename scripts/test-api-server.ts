#!/usr/bin/env npx tsx

/**
 * Test Script: API Server Demo
 *
 * This script demonstrates the API server flow:
 * 1. Start the server
 * 2. Create a conversation
 * 3. Two users join with their agents
 * 4. Start the conversation and watch it unfold
 *
 * Usage:
 *   pnpm exec tsx scripts/test-api-server.ts
 */

import 'dotenv/config';
import WebSocket from 'ws';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

// -----------------------------------------------------------------------------
// API Client
// -----------------------------------------------------------------------------

async function apiCall(method: string, path: string, body?: unknown, userId?: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'x-user-id': userId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// -----------------------------------------------------------------------------
// WebSocket Client
// -----------------------------------------------------------------------------

function createWSClient(userId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?userId=${userId}`);

    ws.on('open', () => {
      console.log(`[WS] ${userId} connected`);
      resolve(ws);
    });

    ws.on('error', (error) => {
      reject(error);
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      handleWSMessage(userId, message);
    });
  });
}

function handleWSMessage(userId: string, message: unknown) {
  const msg = message as { type: string; payload?: unknown };

  switch (msg.type) {
    case 'connected':
      console.log(`[WS] ${userId} received welcome`);
      break;

    case 'conversation_update': {
      const payload = msg.payload as { type: string; [key: string]: unknown };
      switch (payload.type) {
        case 'conversation_start':
          console.log(`\n${'='.repeat(60)}`);
          console.log(`CONVERSATION STARTED: ${payload.topic}`);
          console.log(`${'='.repeat(60)}\n`);
          break;

        case 'turn_start':
          console.log(`[Turn ${payload.turnNumber}] ${payload.agentName} is thinking...`);
          break;

        case 'message':
          console.log(`\n[Turn ${payload.turnNumber}] ${payload.agentName} (${payload.provider}):`);
          console.log(`  ${payload.content}`);
          console.log();
          break;

        case 'conversation_end':
          console.log(`\n${'='.repeat(60)}`);
          console.log(`CONVERSATION ENDED - ${payload.totalTurns} turns`);
          console.log(`${'='.repeat(60)}\n`);
          break;

        case 'error':
          console.error(`[Error] ${payload.message}`);
          break;
      }
      break;
    }

    default:
      console.log(`[WS] ${userId} received:`, msg.type);
  }
}

// -----------------------------------------------------------------------------
// Main Demo
// -----------------------------------------------------------------------------

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              MACP API Server Demo                          ║
╚════════════════════════════════════════════════════════════╝

This demo simulates:
- Alice (using Claude) and Bob (using GPT)
- Meeting on the MACP platform
- Having their AI agents discuss a topic

`);

  // Check if server is running
  try {
    await fetch(`${BASE_URL}/health`);
  } catch {
    console.error('❌ Server is not running!');
    console.log('\nStart the server first:');
    console.log('  pnpm exec tsx packages/api/src/server.ts');
    console.log('\nOr with environment variables:');
    console.log('  DATABASE_URL=postgresql://... pnpm exec tsx packages/api/src/server.ts');
    process.exit(1);
  }

  console.log('✅ Server is running\n');

  // User IDs
  const aliceId = 'alice-user';
  const bobId = 'bob-user';

  // Step 1: Connect WebSocket clients
  console.log('Step 1: Connecting WebSocket clients...');
  const aliceWS = await createWSClient(aliceId);
  const bobWS = await createWSClient(bobId);
  console.log('✅ Both users connected\n');

  // Step 2: Alice creates a conversation
  console.log('Step 2: Alice creates a conversation...');
  const conversation = await apiCall('POST', '/conversations', {
    topic: 'The future of human-AI collaboration',
    goal: 'Explore how AI can augment human capabilities',
    mode: 'campfire',
    maxTurns: 6,
  }, aliceId);
  console.log(`✅ Conversation created: ${conversation.id}\n`);

  // Step 3: Alice joins with her Claude agent
  console.log('Step 3: Alice joins with her Claude agent...');
  await apiCall('POST', `/conversations/${conversation.id}/join`, {
    agentId: 'alice-claude-agent',
    agentConfig: {
      displayName: "Alice's Claude",
      provider: 'anthropic',
      modelId: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      personality: 'Thoughtful, curious, and analytical',
    },
  }, aliceId);
  console.log('✅ Alice joined\n');

  // Step 4: Bob joins with his GPT agent
  console.log('Step 4: Bob joins with his GPT agent...');
  await apiCall('POST', `/conversations/${conversation.id}/join`, {
    agentId: 'bob-gpt-agent',
    agentConfig: {
      displayName: "Bob's GPT",
      provider: 'openai',
      modelId: process.env.OPENAI_MODEL || 'gpt-4o',
      personality: 'Practical, creative, and solution-oriented',
    },
  }, bobId);
  console.log('✅ Bob joined\n');

  // Subscribe to conversation updates
  aliceWS.send(JSON.stringify({ type: 'subscribe', payload: { conversationId: conversation.id } }));
  bobWS.send(JSON.stringify({ type: 'subscribe', payload: { conversationId: conversation.id } }));

  // Step 5: Start the conversation
  console.log('Step 5: Starting the conversation...\n');
  await apiCall('POST', `/conversations/${conversation.id}/start`, {}, aliceId);

  // Wait for conversation to complete
  console.log('Waiting for conversation to complete...\n');
  await new Promise(resolve => setTimeout(resolve, 60000)); // Wait up to 60 seconds

  // Cleanup
  aliceWS.close();
  bobWS.close();

  console.log('\n✅ Demo complete!');
}

main().catch(console.error);
