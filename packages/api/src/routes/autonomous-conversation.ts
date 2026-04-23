import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getPublishedAgent,
  createAgentAdapter,
  getModelIdForProvider,
  buildAutonomousHostPrompt,
  buildAutonomousVisitorPrompt,
} from '../services/public-agent-service.js';

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const startAutonomousSessionSchema = z.object({
  // Visitor agent info
  visitorAgentId: z.string(),
  visitorAgentName: z.string(),
  visitorAgentEmoji: z.string(),
  visitorAgentPersonality: z.string(),
  visitorAgentQuestions: z.array(z.string()).default([]),
  visitorApiKey: z.string().min(1),
  visitorProvider: z.enum(['anthropic', 'openai', 'gemini', 'groq']).default('anthropic'),

  // Optional context from visitor
  visitorContext: z.string().optional(),

  // Session config
  maxTurns: z.number().min(4).max(20).default(10),
});

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface AutonomousTurn {
  turnNumber: number;
  role: 'host' | 'visitor';
  agentName: string;
  emoji: string;
  content: string;
  timestamp: string;
}

interface AutonomousSessionComplete {
  summary: string;
  factsLearned: string[];
  questionsAnswered: string[];
  totalTurns: number;
}

// -----------------------------------------------------------------------------
// SSE Helper
// -----------------------------------------------------------------------------

function sendSSE(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export function registerAutonomousConversationRoutes(app: FastifyInstance): void {

  // -------------------------------------------------------------------------
  // Start autonomous agent-to-agent conversation (SSE stream)
  // -------------------------------------------------------------------------
  app.post('/public/agent/:agentId/autonomous-session', async (req: FastifyRequest, reply: FastifyReply) => {
    const { agentId } = req.params as { agentId: string };

    // Parse and validate request
    let body: z.infer<typeof startAutonomousSessionSchema>;
    try {
      body = startAutonomousSessionSchema.parse(req.body);
    } catch (error: any) {
      reply.code(400);
      return { error: 'Invalid request body', details: error.errors };
    }

    // Get the host agent
    const hostAgent = await getPublishedAgent(agentId);
    if (!hostAgent) {
      reply.code(404);
      return { error: 'Agent not found' };
    }

    if (!hostAgent.isActive) {
      reply.code(404);
      return { error: 'This agent is not currently available' };
    }

    if (!hostAgent.allowAgentToAgent) {
      reply.code(403);
      return { error: 'Agent-to-agent mode is not enabled for this agent' };
    }

    // Set up SSE response
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial event
    sendSSE(reply, 'started', {
      hostAgent: {
        name: hostAgent.name,
        emoji: hostAgent.emoji,
      },
      visitorAgent: {
        name: body.visitorAgentName,
        emoji: body.visitorAgentEmoji,
      },
      maxTurns: body.maxTurns,
    });

    // Create adapters for both agents
    const visitorModelId = getModelIdForProvider(body.visitorProvider);
    const visitorAdapter = createAgentAdapter(body.visitorApiKey, body.visitorProvider, visitorModelId);

    // For host, we'll use the visitor's API key as well (visitor pays for both sides)
    // In a production system, the host would have their own stored API key
    const hostModelId = getModelIdForProvider(body.visitorProvider);
    const hostAdapter = createAgentAdapter(body.visitorApiKey, body.visitorProvider, hostModelId);

    // Build system prompts
    const hostSystemPrompt = buildAutonomousHostPrompt(
      hostAgent,
      body.visitorAgentName,
      body.visitorContext
    );

    const visitorSystemPrompt = buildAutonomousVisitorPrompt(
      body.visitorAgentName,
      body.visitorAgentPersonality,
      body.visitorAgentQuestions,
      hostAgent.name,
      body.visitorContext
    );

    // Conversation state
    const turns: AutonomousTurn[] = [];
    let conversationHistory = '';
    let turnNumber = 0;
    let shouldContinue = true;

    try {
      // Start with host greeting
      sendSSE(reply, 'thinking', { agent: 'host' });

      const hostGreeting = await hostAdapter.generate({
        messages: [{
          role: 'user',
          content: `Start the conversation. A visitor's agent named ${body.visitorAgentName} (${body.visitorAgentEmoji}) has arrived to learn about you and potentially ask questions on behalf of their user.${body.visitorContext ? ` Context: ${body.visitorContext}` : ''} Introduce yourself warmly and invite them to share what they'd like to know.`,
        }],
        systemPrompt: hostSystemPrompt,
        maxTokens: 300,
        temperature: 0.7,
      });

      turnNumber++;
      const hostTurn: AutonomousTurn = {
        turnNumber,
        role: 'host',
        agentName: hostAgent.name,
        emoji: hostAgent.emoji,
        content: hostGreeting.content,
        timestamp: new Date().toISOString(),
      };
      turns.push(hostTurn);
      conversationHistory += `${hostAgent.name}: ${hostGreeting.content}\n\n`;

      sendSSE(reply, 'turn', hostTurn);

      // Conversation loop
      while (shouldContinue && turnNumber < body.maxTurns) {
        // Check if connection is still alive
        if (req.raw.destroyed) {
          app.log.info({ agentId }, 'Client disconnected from autonomous session');
          break;
        }

        // Visitor's turn
        sendSSE(reply, 'thinking', { agent: 'visitor' });

        const visitorResponse = await visitorAdapter.generate({
          messages: [{
            role: 'user',
            content: `Conversation so far:\n${conversationHistory}\n\nRespond naturally. If you've gathered the information you need or the conversation has reached a natural conclusion, you can say goodbye. Keep your response concise (2-3 sentences).`,
          }],
          systemPrompt: visitorSystemPrompt,
          maxTokens: 300,
          temperature: 0.7,
        });

        turnNumber++;
        const visitorTurn: AutonomousTurn = {
          turnNumber,
          role: 'visitor',
          agentName: body.visitorAgentName,
          emoji: body.visitorAgentEmoji,
          content: visitorResponse.content,
          timestamp: new Date().toISOString(),
        };
        turns.push(visitorTurn);
        conversationHistory += `${body.visitorAgentName}: ${visitorResponse.content}\n\n`;

        sendSSE(reply, 'turn', visitorTurn);

        // Check for natural conversation ending
        const visitorLower = visitorResponse.content.toLowerCase();
        if (
          visitorLower.includes('goodbye') ||
          visitorLower.includes('thank you for your time') ||
          visitorLower.includes('that\'s all') ||
          visitorLower.includes('that covers everything') ||
          turnNumber >= body.maxTurns
        ) {
          shouldContinue = false;
          continue;
        }

        // Small delay for natural pacing
        await new Promise(resolve => setTimeout(resolve, 500));

        // Host's turn
        sendSSE(reply, 'thinking', { agent: 'host' });

        const hostResponse = await hostAdapter.generate({
          messages: [{
            role: 'user',
            content: `Conversation so far:\n${conversationHistory}\n\nRespond naturally to the visitor's agent. Answer any questions they have. If the conversation seems to be wrapping up, you can say goodbye graciously. Keep your response concise (2-3 sentences).`,
          }],
          systemPrompt: hostSystemPrompt,
          maxTokens: 300,
          temperature: 0.7,
        });

        turnNumber++;
        const nextHostTurn: AutonomousTurn = {
          turnNumber,
          role: 'host',
          agentName: hostAgent.name,
          emoji: hostAgent.emoji,
          content: hostResponse.content,
          timestamp: new Date().toISOString(),
        };
        turns.push(nextHostTurn);
        conversationHistory += `${hostAgent.name}: ${hostResponse.content}\n\n`;

        sendSSE(reply, 'turn', nextHostTurn);

        // Check for host ending the conversation
        const hostLower = hostResponse.content.toLowerCase();
        if (
          hostLower.includes('goodbye') ||
          hostLower.includes('take care') ||
          hostLower.includes('nice meeting') ||
          turnNumber >= body.maxTurns
        ) {
          shouldContinue = false;
        }

        // Small delay for natural pacing
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Generate summary
      sendSSE(reply, 'summarizing', {});

      const summaryResponse = await visitorAdapter.generate({
        messages: [{
          role: 'user',
          content: `Summarize this conversation between ${body.visitorAgentName} (visiting agent) and ${hostAgent.name} (host agent):

${conversationHistory}

Provide:
1. A brief 1-2 sentence summary of what was discussed
2. A list of key facts learned about the host or their services
3. A list of questions that were answered

Format your response as JSON:
{
  "summary": "...",
  "factsLearned": ["...", "..."],
  "questionsAnswered": ["...", "..."]
}`,
        }],
        systemPrompt: 'You are a helpful assistant that summarizes conversations. Return only valid JSON.',
        maxTokens: 500,
        temperature: 0.3,
      });

      // Parse summary
      let completion: AutonomousSessionComplete = {
        summary: 'Conversation completed successfully.',
        factsLearned: [],
        questionsAnswered: [],
        totalTurns: turns.length,
      };

      try {
        const jsonMatch = summaryResponse.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          completion = {
            summary: parsed.summary || completion.summary,
            factsLearned: parsed.factsLearned || [],
            questionsAnswered: parsed.questionsAnswered || [],
            totalTurns: turns.length,
          };
        }
      } catch (e) {
        app.log.warn({ error: e }, 'Failed to parse summary JSON');
      }

      sendSSE(reply, 'complete', completion);

    } catch (error: any) {
      const errorDetails = {
        message: error.message,
        name: error.name,
        status: error.status,
        code: error.code,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      };
      app.log.error({ err: error, errorDetails, agentId }, 'Error in autonomous conversation');
      sendSSE(reply, 'error', {
        message: error.message || 'A server error occurred',
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined,
      });
    } finally {
      reply.raw.end();
    }
  });

  // -------------------------------------------------------------------------
  // Check if autonomous mode is available for an agent
  // -------------------------------------------------------------------------
  app.get('/public/agent/:agentId/autonomous-available', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };

    try {
      const agent = await getPublishedAgent(agentId);

      if (!agent || !agent.isActive) {
        return { available: false, reason: 'Agent not found or inactive' };
      }

      return {
        available: agent.allowAgentToAgent,
        reason: agent.allowAgentToAgent
          ? undefined
          : 'Agent-to-agent mode is not enabled',
        agent: {
          name: agent.name,
          emoji: agent.emoji,
          introductionQuestions: agent.introductionQuestions.map(q => q.question),
        },
      };
    } catch (error: any) {
      app.log.error({ err: error, agentId }, 'Failed to check autonomous availability');
      reply.code(500);
      return { error: 'Failed to check availability' };
    }
  });
}
