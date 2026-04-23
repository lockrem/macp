import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getTemplateById } from './agent-templates.js';

// -----------------------------------------------------------------------------
// Introduction Service
// Manages the introduction flow state for each user-agent pair
// Stores status in S3 at introductions/{userId}/_status.json
// -----------------------------------------------------------------------------

export type IntroductionState = 'not_started' | 'in_progress' | 'completed' | 'skipped';

export interface AgentIntroductionStatus {
  agentId: string;
  status: IntroductionState;
  questionsAsked: string[];       // IDs of questions that have been asked
  questionsAnswered: string[];    // IDs of questions that have been answered
  startedAt?: string;
  completedAt?: string;
  factsLearned: number;
  rulesLearned: number;
}

export interface IntroductionStatus {
  userId: string;
  agents: Record<string, AgentIntroductionStatus>;
  lastUpdated: string;
}

export interface IntroductionSummary {
  agentId: string;
  agentName: string;
  factsLearned: number;
  rulesLearned: number;
  completedAt: string;
}

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET = process.env.MEMORY_BUCKET || 'macp-dev-memories';

/**
 * Gets the introduction status for all agents for a user
 */
export async function getIntroductionStatus(userId: string): Promise<IntroductionStatus> {
  const key = `introductions/${userId}/_status.json`;

  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }));

    const body = await response.Body?.transformToString();
    if (body) {
      return JSON.parse(body);
    }
  } catch (error: any) {
    // File doesn't exist, return default status
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return createDefaultStatus(userId);
    }
    throw error;
  }

  return createDefaultStatus(userId);
}

/**
 * Gets introduction status for a specific agent
 */
export async function getAgentIntroductionStatus(
  userId: string,
  agentId: string
): Promise<AgentIntroductionStatus> {
  const status = await getIntroductionStatus(userId);

  if (status.agents[agentId]) {
    return status.agents[agentId];
  }

  // Return default for this agent
  return {
    agentId,
    status: 'not_started',
    questionsAsked: [],
    questionsAnswered: [],
    factsLearned: 0,
    rulesLearned: 0,
  };
}

/**
 * Updates introduction status for a specific agent
 */
export async function updateAgentIntroductionStatus(
  userId: string,
  agentId: string,
  update: Partial<AgentIntroductionStatus>
): Promise<IntroductionStatus> {
  const status = await getIntroductionStatus(userId);
  const now = new Date().toISOString();

  // Initialize agent status if it doesn't exist
  if (!status.agents[agentId]) {
    status.agents[agentId] = {
      agentId,
      status: 'not_started',
      questionsAsked: [],
      questionsAnswered: [],
      factsLearned: 0,
      rulesLearned: 0,
    };
  }

  // Apply update
  status.agents[agentId] = {
    ...status.agents[agentId],
    ...update,
  };
  status.lastUpdated = now;

  // Save to S3
  await saveIntroductionStatus(userId, status);

  return status;
}

/**
 * Marks introduction as started for an agent
 */
export async function startIntroduction(
  userId: string,
  agentId: string
): Promise<AgentIntroductionStatus> {
  const now = new Date().toISOString();

  await updateAgentIntroductionStatus(userId, agentId, {
    status: 'in_progress',
    startedAt: now,
  });

  return getAgentIntroductionStatus(userId, agentId);
}

/**
 * Marks a question as asked in the introduction
 */
export async function markQuestionAsked(
  userId: string,
  agentId: string,
  questionId: string
): Promise<void> {
  const status = await getAgentIntroductionStatus(userId, agentId);

  if (!status.questionsAsked.includes(questionId)) {
    await updateAgentIntroductionStatus(userId, agentId, {
      questionsAsked: [...status.questionsAsked, questionId],
    });
  }
}

/**
 * Marks a question as answered in the introduction
 */
export async function markQuestionAnswered(
  userId: string,
  agentId: string,
  questionId: string
): Promise<void> {
  const status = await getAgentIntroductionStatus(userId, agentId);

  if (!status.questionsAnswered.includes(questionId)) {
    await updateAgentIntroductionStatus(userId, agentId, {
      questionsAnswered: [...status.questionsAnswered, questionId],
    });
  }
}

/**
 * Marks introduction as completed for an agent
 */
export async function completeIntroduction(
  userId: string,
  agentId: string,
  factsLearned: number,
  rulesLearned: number
): Promise<IntroductionSummary> {
  const now = new Date().toISOString();
  const template = getTemplateById(agentId);

  await updateAgentIntroductionStatus(userId, agentId, {
    status: 'completed',
    completedAt: now,
    factsLearned,
    rulesLearned,
  });

  return {
    agentId,
    agentName: template?.name || agentId,
    factsLearned,
    rulesLearned,
    completedAt: now,
  };
}

/**
 * Skips introduction for an agent
 */
export async function skipIntroduction(
  userId: string,
  agentId: string
): Promise<AgentIntroductionStatus> {
  const now = new Date().toISOString();

  await updateAgentIntroductionStatus(userId, agentId, {
    status: 'skipped',
    completedAt: now,
  });

  return getAgentIntroductionStatus(userId, agentId);
}

/**
 * Checks if an agent needs introduction
 */
export async function needsIntroduction(
  userId: string,
  agentId: string
): Promise<boolean> {
  const status = await getAgentIntroductionStatus(userId, agentId);
  return status.status === 'not_started' || status.status === 'in_progress';
}

/**
 * Gets the next question to ask during introduction
 */
export function getNextQuestion(
  agentId: string,
  questionsAsked: string[]
): { id: string; question: string; followUp?: string } | null {
  const template = getTemplateById(agentId);
  if (!template) return null;

  // Sort questions by priority and find the first unanswered one
  const sortedQuestions = [...template.introductionQuestions].sort(
    (a, b) => a.priority - b.priority
  );

  for (const q of sortedQuestions) {
    if (!questionsAsked.includes(q.id)) {
      return {
        id: q.id,
        question: q.question,
        followUp: q.followUp,
      };
    }
  }

  return null;
}

/**
 * Checks if all questions have been asked
 */
export function isIntroductionComplete(
  agentId: string,
  questionsAsked: string[]
): boolean {
  const template = getTemplateById(agentId);
  if (!template) return true;

  return questionsAsked.length >= template.introductionQuestions.length;
}

/**
 * Gets introduction progress (e.g., "2 of 5")
 */
export function getIntroductionProgress(
  agentId: string,
  questionsAsked: string[]
): { current: number; total: number } {
  const template = getTemplateById(agentId);
  if (!template) return { current: 0, total: 0 };

  return {
    current: questionsAsked.length,
    total: template.introductionQuestions.length,
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function createDefaultStatus(userId: string): IntroductionStatus {
  return {
    userId,
    agents: {},
    lastUpdated: new Date().toISOString(),
  };
}

async function saveIntroductionStatus(
  userId: string,
  status: IntroductionStatus
): Promise<void> {
  const key = `introductions/${userId}/_status.json`;

  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: JSON.stringify(status, null, 2),
    ContentType: 'application/json',
    ServerSideEncryption: 'AES256',
  }));

  console.log(`[IntroductionService] Saved introduction status for user ${userId}`);
}
