"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIntroductionRoutes = registerIntroductionRoutes;
const introduction_service_js_1 = require("../services/introduction-service.js");
const agent_templates_js_1 = require("../services/agent-templates.js");
// -----------------------------------------------------------------------------
// Introduction Routes
// Manages the introduction flow status for user-agent pairs
// -----------------------------------------------------------------------------
function registerIntroductionRoutes(app) {
    // Get introduction status for all agents
    app.get('/api/introductions', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const status = await (0, introduction_service_js_1.getIntroductionStatus)(userId);
        // Enhance with agent metadata
        const templates = (0, agent_templates_js_1.getSystemAgentTemplates)();
        const agentsWithStatus = templates.map(template => {
            const agentStatus = status.agents[template.templateId] || {
                status: 'not_started',
                questionsAsked: [],
                questionsAnswered: [],
                factsLearned: 0,
                rulesLearned: 0,
            };
            const progress = (0, introduction_service_js_1.getIntroductionProgress)(template.templateId, agentStatus.questionsAsked);
            return {
                agentId: template.templateId,
                agentName: template.name,
                agentEmoji: template.emoji,
                introductionStatus: agentStatus.status,
                progress: {
                    questionsAsked: progress.current,
                    totalQuestions: progress.total,
                },
                factsLearned: agentStatus.factsLearned,
                rulesLearned: agentStatus.rulesLearned,
                completedAt: agentStatus.completedAt,
                needsIntroduction: agentStatus.status === 'not_started' || agentStatus.status === 'in_progress',
            };
        });
        return {
            userId: status.userId,
            agents: agentsWithStatus,
            lastUpdated: status.lastUpdated,
        };
    });
    // Get introduction status for a specific agent
    app.get('/api/introductions/:agentId', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { agentId } = req.params;
        const status = await (0, introduction_service_js_1.getAgentIntroductionStatus)(userId, agentId);
        const template = (0, agent_templates_js_1.getTemplateById)(agentId);
        const progress = (0, introduction_service_js_1.getIntroductionProgress)(agentId, status.questionsAsked);
        return {
            agentId,
            agentName: template?.name,
            agentEmoji: template?.emoji,
            introductionGreeting: template?.introductionGreeting,
            status: status.status,
            progress: {
                questionsAsked: progress.current,
                totalQuestions: progress.total,
            },
            questionsAsked: status.questionsAsked,
            questionsAnswered: status.questionsAnswered,
            factsLearned: status.factsLearned,
            rulesLearned: status.rulesLearned,
            startedAt: status.startedAt,
            completedAt: status.completedAt,
            needsIntroduction: status.status === 'not_started' || status.status === 'in_progress',
        };
    });
    // Get the introduction greeting and first question for an agent
    app.get('/api/introductions/:agentId/start-info', async (req, reply) => {
        const { agentId } = req.params;
        const template = (0, agent_templates_js_1.getTemplateById)(agentId);
        // For system agents, use the template
        if (template) {
            // Get the first question (highest priority)
            const sortedQuestions = [...template.introductionQuestions].sort((a, b) => a.priority - b.priority);
            const firstQuestion = sortedQuestions[0];
            return {
                agentId,
                agentName: template.name,
                agentEmoji: template.emoji,
                introductionGreeting: template.introductionGreeting,
                totalQuestions: template.introductionQuestions.length,
                firstQuestion: firstQuestion ? {
                    id: firstQuestion.id,
                    question: firstQuestion.question,
                } : null,
            };
        }
        // For custom agents, return a minimal response
        // The actual questions come from the client when creating the introduction
        return {
            agentId,
            agentName: null,
            agentEmoji: null,
            introductionGreeting: null,
            totalQuestions: 0,
            firstQuestion: null,
            isCustomAgent: true,
        };
    });
    // Start introduction for an agent
    app.post('/api/introductions/:agentId/start', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { agentId } = req.params;
        const status = await (0, introduction_service_js_1.startIntroduction)(userId, agentId);
        const template = (0, agent_templates_js_1.getTemplateById)(agentId);
        return {
            agentId,
            agentName: template?.name,
            status: status.status,
            startedAt: status.startedAt,
            message: 'Introduction started',
        };
    });
    // Skip introduction for an agent
    app.post('/api/introductions/:agentId/skip', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { agentId } = req.params;
        const status = await (0, introduction_service_js_1.skipIntroduction)(userId, agentId);
        const template = (0, agent_templates_js_1.getTemplateById)(agentId);
        return {
            agentId,
            agentName: template?.name,
            status: status.status,
            message: 'Introduction skipped',
        };
    });
    // Reset introduction for an agent (for testing/re-doing)
    app.post('/api/introductions/:agentId/reset', async (req, reply) => {
        const userId = req.user?.userId;
        if (!userId) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { agentId } = req.params;
        // Import the update function
        const { updateAgentIntroductionStatus } = await Promise.resolve().then(() => __importStar(require('../services/introduction-service.js')));
        await updateAgentIntroductionStatus(userId, agentId, {
            status: 'not_started',
            questionsAsked: [],
            questionsAnswered: [],
            startedAt: undefined,
            completedAt: undefined,
            factsLearned: 0,
            rulesLearned: 0,
        });
        return {
            agentId,
            status: 'not_started',
            message: 'Introduction reset',
        };
    });
}
//# sourceMappingURL=introductions.js.map