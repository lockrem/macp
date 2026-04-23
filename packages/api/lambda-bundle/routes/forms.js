"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFormRoutes = registerFormRoutes;
const zod_1 = require("zod");
const form_service_js_1 = require("../services/form-service.js");
// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------
const createFormSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(200),
    description: zod_1.z.string().max(1000).optional(),
});
const updateFormSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(200).optional(),
    description: zod_1.z.string().max(1000).optional(),
    isPublic: zod_1.z.boolean().optional(),
});
const fieldTypeEnum = zod_1.z.enum(['text', 'multiline', 'date', 'email', 'phone', 'select']);
const createFieldSchema = zod_1.z.object({
    label: zod_1.z.string().min(1).max(200),
    fieldType: fieldTypeEnum,
    required: zod_1.z.boolean().optional(),
    placeholder: zod_1.z.string().max(200).optional(),
    options: zod_1.z.array(zod_1.z.string()).optional(),
    displayOrder: zod_1.z.number().int().optional(),
});
const updateFieldSchema = zod_1.z.object({
    label: zod_1.z.string().min(1).max(200).optional(),
    fieldType: fieldTypeEnum.optional(),
    required: zod_1.z.boolean().optional(),
    placeholder: zod_1.z.string().max(200).optional(),
    options: zod_1.z.array(zod_1.z.string()).optional(),
    displayOrder: zod_1.z.number().int().optional(),
});
const reorderFieldsSchema = zod_1.z.object({
    fieldIds: zod_1.z.array(zod_1.z.string()),
});
const submitFormSchema = zod_1.z.object({
    responses: zod_1.z.array(zod_1.z.object({
        fieldId: zod_1.z.string(),
        value: zod_1.z.string(),
        source: zod_1.z.enum(['agent', 'user']),
    })),
    respondentName: zod_1.z.string().optional(),
    respondentEmail: zod_1.z.string().email().optional(),
});
const autoFillSchema = zod_1.z.object({
    apiKey: zod_1.z.string().min(1),
});
// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------
function registerFormRoutes(app) {
    // =========================================================================
    // PUBLIC ROUTES (No authentication required)
    // =========================================================================
    // -------------------------------------------------------------------------
    // Get public form (for filling)
    // -------------------------------------------------------------------------
    app.get('/public/form/:formId', async (req, reply) => {
        const { formId } = req.params;
        try {
            const form = await (0, form_service_js_1.getFormPublic)(formId);
            if (!form) {
                reply.code(404);
                return { error: 'Form not found' };
            }
            return {
                id: form.id,
                title: form.title,
                description: form.description,
                fields: form.fields?.map(f => ({
                    id: f.id,
                    label: f.label,
                    fieldType: f.fieldType,
                    required: f.required,
                    placeholder: f.placeholder,
                    options: f.options,
                    displayOrder: f.displayOrder,
                })),
            };
        }
        catch (error) {
            app.log.error({ err: error, formId }, 'Failed to get public form');
            reply.code(500);
            return { error: 'Failed to retrieve form' };
        }
    });
    // -------------------------------------------------------------------------
    // Submit form responses
    // -------------------------------------------------------------------------
    app.post('/public/form/:formId/submit', async (req, reply) => {
        const { formId } = req.params;
        try {
            const body = submitFormSchema.parse(req.body);
            // Get respondent user ID if authenticated
            const respondentUserId = req.user?.userId || null;
            const submission = await (0, form_service_js_1.submitForm)(formId, respondentUserId, body);
            return {
                success: true,
                submissionId: submission.id,
                status: submission.status,
                submittedAt: submission.submittedAt,
            };
        }
        catch (error) {
            if (error.message) {
                reply.code(400);
                return { error: error.message };
            }
            app.log.error({ err: error, formId }, 'Failed to submit form');
            reply.code(500);
            return { error: 'Failed to submit form' };
        }
    });
    // -------------------------------------------------------------------------
    // Get auto-fill suggestions (authenticated)
    // -------------------------------------------------------------------------
    app.post('/public/form/:formId/autofill', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required for auto-fill' };
        }
        const { formId } = req.params;
        try {
            const body = autoFillSchema.parse(req.body);
            const suggestions = await (0, form_service_js_1.getAutoFillSuggestions)(req.user.userId, formId, body.apiKey);
            return { suggestions };
        }
        catch (error) {
            app.log.error({ err: error, formId }, 'Failed to get auto-fill suggestions');
            reply.code(500);
            return { error: 'Failed to get suggestions' };
        }
    });
    // =========================================================================
    // AUTHENTICATED ROUTES (For form owners)
    // =========================================================================
    // -------------------------------------------------------------------------
    // Create form
    // -------------------------------------------------------------------------
    app.post('/api/forms', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        try {
            const body = createFormSchema.parse(req.body);
            const form = await (0, form_service_js_1.createForm)(req.user.userId, body);
            app.log.info({ userId: req.user.userId, formId: form.id }, 'Form created');
            return {
                success: true,
                form: {
                    id: form.id,
                    title: form.title,
                    description: form.description,
                    isPublic: form.isPublic,
                    url: (0, form_service_js_1.getFormUrl)(form.id),
                    fields: [],
                    createdAt: form.createdAt,
                },
            };
        }
        catch (error) {
            if (error.message) {
                reply.code(400);
                return { error: error.message };
            }
            app.log.error({ err: error }, 'Failed to create form');
            reply.code(500);
            return { error: 'Failed to create form' };
        }
    });
    // -------------------------------------------------------------------------
    // List user's forms
    // -------------------------------------------------------------------------
    app.get('/api/forms', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        try {
            const forms = await (0, form_service_js_1.listUserForms)(req.user.userId);
            return {
                forms: forms.map(f => ({
                    id: f.id,
                    title: f.title,
                    description: f.description,
                    isPublic: f.isPublic,
                    url: (0, form_service_js_1.getFormUrl)(f.id),
                    fieldCount: f.fields?.length || 0,
                    viewCount: f.viewCount,
                    submissionCount: f.submissionCount,
                    createdAt: f.createdAt,
                    updatedAt: f.updatedAt,
                })),
                total: forms.length,
            };
        }
        catch (error) {
            app.log.error({ err: error }, 'Failed to list forms');
            reply.code(500);
            return { error: 'Failed to retrieve forms' };
        }
    });
    // -------------------------------------------------------------------------
    // Get form details (owner)
    // -------------------------------------------------------------------------
    app.get('/api/forms/:formId', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { formId } = req.params;
        try {
            const form = await (0, form_service_js_1.getForm)(formId);
            if (!form || form.userId !== req.user.userId) {
                reply.code(404);
                return { error: 'Form not found' };
            }
            return {
                id: form.id,
                title: form.title,
                description: form.description,
                isPublic: form.isPublic,
                url: (0, form_service_js_1.getFormUrl)(form.id),
                fields: form.fields,
                viewCount: form.viewCount,
                submissionCount: form.submissionCount,
                createdAt: form.createdAt,
                updatedAt: form.updatedAt,
            };
        }
        catch (error) {
            app.log.error({ err: error, formId }, 'Failed to get form');
            reply.code(500);
            return { error: 'Failed to retrieve form' };
        }
    });
    // -------------------------------------------------------------------------
    // Update form
    // -------------------------------------------------------------------------
    app.put('/api/forms/:formId', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { formId } = req.params;
        try {
            const body = updateFormSchema.parse(req.body);
            const form = await (0, form_service_js_1.updateForm)(req.user.userId, formId, body);
            return {
                success: true,
                form: {
                    id: form.id,
                    title: form.title,
                    description: form.description,
                    isPublic: form.isPublic,
                    updatedAt: form.updatedAt,
                },
            };
        }
        catch (error) {
            if (error.message === 'Form not found') {
                reply.code(404);
                return { error: error.message };
            }
            app.log.error({ err: error, formId }, 'Failed to update form');
            reply.code(500);
            return { error: 'Failed to update form' };
        }
    });
    // -------------------------------------------------------------------------
    // Delete form
    // -------------------------------------------------------------------------
    app.delete('/api/forms/:formId', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { formId } = req.params;
        try {
            await (0, form_service_js_1.deleteForm)(req.user.userId, formId);
            return { success: true };
        }
        catch (error) {
            if (error.message === 'Form not found') {
                reply.code(404);
                return { error: error.message };
            }
            app.log.error({ err: error, formId }, 'Failed to delete form');
            reply.code(500);
            return { error: 'Failed to delete form' };
        }
    });
    // =========================================================================
    // FIELD ROUTES
    // =========================================================================
    // -------------------------------------------------------------------------
    // Add field to form
    // -------------------------------------------------------------------------
    app.post('/api/forms/:formId/fields', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { formId } = req.params;
        try {
            const body = createFieldSchema.parse(req.body);
            const field = await (0, form_service_js_1.addField)(req.user.userId, formId, body);
            return {
                success: true,
                field,
            };
        }
        catch (error) {
            if (error.message === 'Form not found') {
                reply.code(404);
                return { error: error.message };
            }
            app.log.error({ err: error, formId }, 'Failed to add field');
            reply.code(500);
            return { error: 'Failed to add field' };
        }
    });
    // -------------------------------------------------------------------------
    // Update field
    // -------------------------------------------------------------------------
    app.put('/api/forms/:formId/fields/:fieldId', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { formId, fieldId } = req.params;
        try {
            const body = updateFieldSchema.parse(req.body);
            const field = await (0, form_service_js_1.updateField)(req.user.userId, formId, fieldId, body);
            return {
                success: true,
                field,
            };
        }
        catch (error) {
            if (error.message === 'Form not found' || error.message === 'Field not found') {
                reply.code(404);
                return { error: error.message };
            }
            app.log.error({ err: error, formId, fieldId }, 'Failed to update field');
            reply.code(500);
            return { error: 'Failed to update field' };
        }
    });
    // -------------------------------------------------------------------------
    // Delete field
    // -------------------------------------------------------------------------
    app.delete('/api/forms/:formId/fields/:fieldId', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { formId, fieldId } = req.params;
        try {
            await (0, form_service_js_1.deleteField)(req.user.userId, formId, fieldId);
            return { success: true };
        }
        catch (error) {
            if (error.message === 'Form not found') {
                reply.code(404);
                return { error: error.message };
            }
            app.log.error({ err: error, formId, fieldId }, 'Failed to delete field');
            reply.code(500);
            return { error: 'Failed to delete field' };
        }
    });
    // -------------------------------------------------------------------------
    // Reorder fields
    // -------------------------------------------------------------------------
    app.put('/api/forms/:formId/fields/reorder', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { formId } = req.params;
        try {
            const body = reorderFieldsSchema.parse(req.body);
            const fields = await (0, form_service_js_1.reorderFields)(req.user.userId, formId, body.fieldIds);
            return {
                success: true,
                fields,
            };
        }
        catch (error) {
            if (error.message === 'Form not found') {
                reply.code(404);
                return { error: error.message };
            }
            app.log.error({ err: error, formId }, 'Failed to reorder fields');
            reply.code(500);
            return { error: 'Failed to reorder fields' };
        }
    });
    // =========================================================================
    // SUBMISSION ROUTES
    // =========================================================================
    // -------------------------------------------------------------------------
    // List form submissions
    // -------------------------------------------------------------------------
    app.get('/api/forms/:formId/submissions', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { formId } = req.params;
        try {
            const submissions = await (0, form_service_js_1.listSubmissions)(req.user.userId, formId);
            return {
                submissions: submissions.map(s => ({
                    id: s.id,
                    respondentName: s.respondentName,
                    respondentEmail: s.respondentEmail,
                    status: s.status,
                    createdAt: s.createdAt,
                    submittedAt: s.submittedAt,
                })),
                total: submissions.length,
            };
        }
        catch (error) {
            if (error.message === 'Form not found') {
                reply.code(404);
                return { error: error.message };
            }
            app.log.error({ err: error, formId }, 'Failed to list submissions');
            reply.code(500);
            return { error: 'Failed to retrieve submissions' };
        }
    });
    // -------------------------------------------------------------------------
    // Get submission details
    // -------------------------------------------------------------------------
    app.get('/api/forms/:formId/submissions/:submissionId', async (req, reply) => {
        if (!req.user) {
            reply.code(401);
            return { error: 'Authentication required' };
        }
        const { formId, submissionId } = req.params;
        try {
            const submission = await (0, form_service_js_1.getSubmission)(req.user.userId, formId, submissionId);
            if (!submission) {
                reply.code(404);
                return { error: 'Submission not found' };
            }
            // Get form for field labels
            const form = await (0, form_service_js_1.getForm)(formId);
            const fieldMap = new Map(form?.fields?.map(f => [f.id, f]) || []);
            return {
                id: submission.id,
                formId: submission.formId,
                respondentName: submission.respondentName,
                respondentEmail: submission.respondentEmail,
                status: submission.status,
                createdAt: submission.createdAt,
                submittedAt: submission.submittedAt,
                responses: submission.responses?.map(r => ({
                    fieldId: r.fieldId,
                    fieldLabel: fieldMap.get(r.fieldId)?.label || 'Unknown',
                    fieldType: fieldMap.get(r.fieldId)?.fieldType || 'text',
                    value: r.value,
                    source: r.source,
                })),
            };
        }
        catch (error) {
            if (error.message === 'Form not found') {
                reply.code(404);
                return { error: error.message };
            }
            app.log.error({ err: error, formId, submissionId }, 'Failed to get submission');
            reply.code(500);
            return { error: 'Failed to retrieve submission' };
        }
    });
}
//# sourceMappingURL=forms.js.map