"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIntroductionStatus = getIntroductionStatus;
exports.getAgentIntroductionStatus = getAgentIntroductionStatus;
exports.updateAgentIntroductionStatus = updateAgentIntroductionStatus;
exports.startIntroduction = startIntroduction;
exports.markQuestionAsked = markQuestionAsked;
exports.markQuestionAnswered = markQuestionAnswered;
exports.completeIntroduction = completeIntroduction;
exports.skipIntroduction = skipIntroduction;
exports.needsIntroduction = needsIntroduction;
exports.getNextQuestion = getNextQuestion;
exports.isIntroductionComplete = isIntroductionComplete;
exports.getIntroductionProgress = getIntroductionProgress;
const client_s3_1 = require("@aws-sdk/client-s3");
const agent_templates_js_1 = require("./agent-templates.js");
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
});
const BUCKET = process.env.MEMORY_BUCKET || 'macp-dev-memories';
/**
 * Gets the introduction status for all agents for a user
 */
async function getIntroductionStatus(userId) {
    const key = `introductions/${userId}/_status.json`;
    try {
        const response = await s3Client.send(new client_s3_1.GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        }));
        const body = await response.Body?.transformToString();
        if (body) {
            return JSON.parse(body);
        }
    }
    catch (error) {
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
async function getAgentIntroductionStatus(userId, agentId) {
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
async function updateAgentIntroductionStatus(userId, agentId, update) {
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
async function startIntroduction(userId, agentId) {
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
async function markQuestionAsked(userId, agentId, questionId) {
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
async function markQuestionAnswered(userId, agentId, questionId) {
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
async function completeIntroduction(userId, agentId, factsLearned, rulesLearned) {
    const now = new Date().toISOString();
    const template = (0, agent_templates_js_1.getTemplateById)(agentId);
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
async function skipIntroduction(userId, agentId) {
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
async function needsIntroduction(userId, agentId) {
    const status = await getAgentIntroductionStatus(userId, agentId);
    return status.status === 'not_started' || status.status === 'in_progress';
}
/**
 * Gets the next question to ask during introduction
 */
function getNextQuestion(agentId, questionsAsked) {
    const template = (0, agent_templates_js_1.getTemplateById)(agentId);
    if (!template)
        return null;
    // Sort questions by priority and find the first unanswered one
    const sortedQuestions = [...template.introductionQuestions].sort((a, b) => a.priority - b.priority);
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
function isIntroductionComplete(agentId, questionsAsked) {
    const template = (0, agent_templates_js_1.getTemplateById)(agentId);
    if (!template)
        return true;
    return questionsAsked.length >= template.introductionQuestions.length;
}
/**
 * Gets introduction progress (e.g., "2 of 5")
 */
function getIntroductionProgress(agentId, questionsAsked) {
    const template = (0, agent_templates_js_1.getTemplateById)(agentId);
    if (!template)
        return { current: 0, total: 0 };
    return {
        current: questionsAsked.length,
        total: template.introductionQuestions.length,
    };
}
// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function createDefaultStatus(userId) {
    return {
        userId,
        agents: {},
        lastUpdated: new Date().toISOString(),
    };
}
async function saveIntroductionStatus(userId, status) {
    const key = `introductions/${userId}/_status.json`;
    await s3Client.send(new client_s3_1.PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: JSON.stringify(status, null, 2),
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
    }));
    console.log(`[IntroductionService] Saved introduction status for user ${userId}`);
}
//# sourceMappingURL=introduction-service.js.map