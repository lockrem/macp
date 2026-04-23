"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProfileRoutes = registerProfileRoutes;
const zod_1 = require("zod");
const user_memory_service_js_1 = require("../services/user-memory-service.js");
// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
function registerProfileRoutes(app) {
    // -------------------------------------------------------------------------
    // GET /api/profile - User's profile (facts grouped by category)
    // -------------------------------------------------------------------------
    app.get('/api/profile', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        try {
            const profile = await (0, user_memory_service_js_1.getUserProfile)(userId);
            return profile;
        }
        catch (error) {
            app.log.error({ err: error, userId }, 'Failed to get user profile');
            reply.code(500);
            return { error: 'Failed to retrieve profile' };
        }
    });
    // -------------------------------------------------------------------------
    // PATCH /api/profile/:category - Manual edit: upsert facts in a category
    // -------------------------------------------------------------------------
    app.patch('/api/profile/:category', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { category } = req.params;
        const body = zod_1.z.object({
            facts: zod_1.z.array(zod_1.z.object({
                key: zod_1.z.string(),
                value: zod_1.z.union([
                    zod_1.z.string(),
                    zod_1.z.number(),
                    zod_1.z.array(zod_1.z.string()),
                    zod_1.z.record(zod_1.z.unknown()),
                ]),
            })),
        }).parse(req.body);
        try {
            const saved = await (0, user_memory_service_js_1.upsertProfileFacts)(userId, category, body.facts);
            // Return updated profile
            const profile = await (0, user_memory_service_js_1.getUserProfile)(userId);
            return {
                saved,
                profile,
            };
        }
        catch (error) {
            app.log.error({ err: error, userId, category }, 'Failed to update profile');
            reply.code(500);
            return { error: 'Failed to update profile' };
        }
    });
    // -------------------------------------------------------------------------
    // DELETE /api/profile/facts/:factId - Delete a specific fact
    // -------------------------------------------------------------------------
    app.delete('/api/profile/facts/:factId', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const userId = req.user.userId;
        const { factId } = req.params;
        try {
            await (0, user_memory_service_js_1.deleteFact)(userId, factId);
            // Return updated profile
            const profile = await (0, user_memory_service_js_1.getUserProfile)(userId);
            return {
                success: true,
                profile,
            };
        }
        catch (error) {
            app.log.error({ err: error, userId, factId }, 'Failed to delete fact');
            reply.code(500);
            return { error: 'Failed to delete fact' };
        }
    });
}
//# sourceMappingURL=profile.js.map