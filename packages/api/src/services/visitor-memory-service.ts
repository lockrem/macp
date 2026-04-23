/**
 * Visitor Memory Service
 *
 * Manages per-visitor memories for public agents.
 * Each public agent can remember facts about individual visitors,
 * enabling personalized experiences on return visits.
 *
 * Storage structure: visitor-memories/{agentId}/{visitorId}.json
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { createClaudeAdapter } from '@macp/core';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const MEMORY_BUCKET = process.env.MEMORY_BUCKET || 'macp-dev-memories';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface VisitorMemory {
  visitorId: string;
  agentId: string;
  displayName?: string;  // Optional name the visitor shared
  memories: VisitorMemoryEntry[];
  preferences: Record<string, string>;  // Key-value preferences
  visitCount: number;
  firstVisit: string;
  lastVisit: string;
  updatedAt: string;
}

export interface VisitorMemoryEntry {
  id: string;
  content: string;
  category: string;  // e.g., "dietary", "seating", "health", "personal"
  confidence: 'high' | 'medium' | 'low';
  source: 'conversation' | 'explicit' | 'inferred';
  createdAt: string;
  sessionId?: string;  // Which session this came from
}

// -----------------------------------------------------------------------------
// Storage Operations
// -----------------------------------------------------------------------------

/**
 * Gets visitor memory for a specific visitor at a specific public agent
 */
export async function getVisitorMemory(
  agentId: string,
  visitorId: string
): Promise<VisitorMemory | null> {
  const key = `visitor-memories/${agentId}/${visitorId}.json`;

  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: MEMORY_BUCKET,
      Key: key,
    }));

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return JSON.parse(body) as VisitorMemory;
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      return null;
    }
    console.error(`[VisitorMemory] Failed to get memory for ${visitorId} at ${agentId}:`, error);
    return null;
  }
}

/**
 * Saves visitor memory
 */
export async function saveVisitorMemory(memory: VisitorMemory): Promise<void> {
  const key = `visitor-memories/${memory.agentId}/${memory.visitorId}.json`;

  await s3Client.send(new PutObjectCommand({
    Bucket: MEMORY_BUCKET,
    Key: key,
    Body: JSON.stringify(memory, null, 2),
    ContentType: 'application/json',
    ServerSideEncryption: 'AES256',
    Metadata: {
      'agent-id': memory.agentId,
      'visitor-id': memory.visitorId,
      'visit-count': memory.visitCount.toString(),
    },
  }));

  console.log(`[VisitorMemory] Saved ${memory.memories.length} memories for visitor ${memory.visitorId} at agent ${memory.agentId}`);
}

/**
 * Creates or updates visitor memory with new entries from a conversation
 */
export async function updateVisitorMemoryFromSession(
  agentId: string,
  visitorId: string,
  sessionId: string,
  extractedMemories: string[],
  extractedPreferences: Record<string, string>,
  visitorName?: string
): Promise<VisitorMemory> {
  const now = new Date().toISOString();

  // Get existing memory or create new
  let memory = await getVisitorMemory(agentId, visitorId);

  if (!memory) {
    memory = {
      visitorId,
      agentId,
      displayName: visitorName,
      memories: [],
      preferences: {},
      visitCount: 0,
      firstVisit: now,
      lastVisit: now,
      updatedAt: now,
    };
  }

  // Update visit tracking
  memory.visitCount++;
  memory.lastVisit = now;
  memory.updatedAt = now;

  if (visitorName && !memory.displayName) {
    memory.displayName = visitorName;
  }

  // Add new memories (avoid exact duplicates)
  const existingContents = new Set(memory.memories.map(m => m.content.toLowerCase()));

  for (const memoryContent of extractedMemories) {
    if (!existingContents.has(memoryContent.toLowerCase())) {
      memory.memories.push({
        id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: memoryContent,
        category: inferMemoryCategory(memoryContent),
        confidence: 'high',
        source: 'conversation',
        createdAt: now,
        sessionId,
      });
      existingContents.add(memoryContent.toLowerCase());
    }
  }

  // Merge preferences (newer values override)
  memory.preferences = {
    ...memory.preferences,
    ...extractedPreferences,
  };

  // Limit memories to prevent unbounded growth (keep most recent 50)
  if (memory.memories.length > 50) {
    memory.memories = memory.memories.slice(-50);
  }

  await saveVisitorMemory(memory);
  return memory;
}

/**
 * Infers a category for a memory based on its content
 */
function inferMemoryCategory(content: string): string {
  const lower = content.toLowerCase();

  const categoryPatterns: [string, string[]][] = [
    ['dietary', ['allergy', 'allergic', 'vegetarian', 'vegan', 'gluten', 'dairy', 'nut', 'shellfish', 'kosher', 'halal', 'diet']],
    ['seating', ['seat', 'table', 'booth', 'patio', 'window', 'quiet', 'corner']],
    ['health', ['health', 'medical', 'condition', 'medication', 'symptom', 'pain', 'doctor', 'treatment']],
    ['schedule', ['morning', 'afternoon', 'evening', 'weekend', 'appointment', 'time', 'schedule', 'available']],
    ['contact', ['phone', 'email', 'address', 'contact', 'call', 'reach']],
    ['family', ['family', 'spouse', 'wife', 'husband', 'children', 'kids', 'parent']],
    ['work', ['work', 'job', 'company', 'profession', 'career', 'business', 'office']],
    ['preferences', ['prefer', 'like', 'enjoy', 'favorite', 'love', 'hate', 'dislike']],
  ];

  for (const [category, keywords] of categoryPatterns) {
    if (keywords.some(kw => lower.includes(kw))) {
      return category;
    }
  }

  return 'general';
}

/**
 * Formats visitor memory as context for the host agent
 */
export function formatVisitorMemoryAsContext(memory: VisitorMemory): string {
  if (!memory || (memory.memories.length === 0 && Object.keys(memory.preferences).length === 0)) {
    return '';
  }

  let context = `\n## Returning Visitor Information\n`;

  if (memory.displayName) {
    context += `Name: ${memory.displayName}\n`;
  }

  context += `Visit #${memory.visitCount} (first visit: ${new Date(memory.firstVisit).toLocaleDateString()})\n\n`;

  // Group memories by category
  const byCategory = new Map<string, VisitorMemoryEntry[]>();
  for (const mem of memory.memories) {
    const entries = byCategory.get(mem.category) || [];
    entries.push(mem);
    byCategory.set(mem.category, entries);
  }

  // Format memories by category
  if (byCategory.size > 0) {
    context += `### What we know about this visitor:\n`;
    for (const [category, entries] of byCategory) {
      context += `**${category.charAt(0).toUpperCase() + category.slice(1)}:**\n`;
      for (const entry of entries.slice(-5)) { // Show most recent 5 per category
        context += `- ${entry.content}\n`;
      }
    }
    context += '\n';
  }

  // Format preferences
  if (Object.keys(memory.preferences).length > 0) {
    context += `### Preferences:\n`;
    for (const [key, value] of Object.entries(memory.preferences)) {
      context += `- ${key}: ${value}\n`;
    }
    context += '\n';
  }

  context += `\nUse this information to provide a personalized, VIP experience. Reference their preferences naturally without being creepy about it.\n`;

  return context;
}

// -----------------------------------------------------------------------------
// Smart Memory Distribution (for user's agents)
// -----------------------------------------------------------------------------

const MEMORY_DISTRIBUTION_PROMPT = `You are a memory distribution system. Given facts learned about a user during a conversation, determine which of their personal AI agents should store each fact.

Each agent has specific domains they track. Match facts to the most appropriate agent(s).

IMPORTANT RULES:
1. A fact can be assigned to multiple agents if relevant to both
2. Some facts may not belong to any agent - that's okay, skip them
3. Focus on facts that would be useful for the agent to remember in future conversations
4. Don't assign generic chitchat or temporary context

Return JSON only:
{
  "distributions": [
    {
      "fact": "The original fact text",
      "agentId": "uuid-of-agent",
      "agentName": "Name of agent",
      "category": "suggested memory category",
      "reasoning": "Brief reason why this agent should store this"
    }
  ]
}`;

export interface MemoryDistribution {
  fact: string;
  agentId: string;
  agentName: string;
  category: string;
  reasoning: string;
}

/**
 * Determines which of the user's agents should store each extracted fact
 */
export async function distributeMemoriesToAgents(
  facts: string[],
  userAgents: Array<{
    id: string;
    name: string;
    description?: string;
    intents: string[];
    memoryCategories?: string[];
  }>,
  apiKey: string
): Promise<MemoryDistribution[]> {
  if (facts.length === 0 || userAgents.length === 0) {
    return [];
  }

  const adapter = createClaudeAdapter(apiKey, 'claude-sonnet-4-5-20250929');

  // Build agent profiles
  const agentProfiles = userAgents.map(a =>
    `- ${a.name} (ID: ${a.id}): ${a.description || a.intents.join(', ')}. Tracks: ${a.memoryCategories?.join(', ') || a.intents.join(', ')}`
  ).join('\n');

  const prompt = `## User's Personal Agents:
${agentProfiles}

## Facts learned about the user:
${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Distribute these facts to the appropriate agents. Return JSON only.`;

  try {
    const response = await adapter.generate({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: MEMORY_DISTRIBUTION_PROMPT,
      maxTokens: 1500,
      temperature: 0.1,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[VisitorMemory] No JSON found in distribution response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.distributions || [];
  } catch (error) {
    console.error('[VisitorMemory] Failed to distribute memories:', error);
    return [];
  }
}
