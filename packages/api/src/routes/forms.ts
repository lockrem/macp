import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createForm,
  getForm,
  getFormPublic,
  listUserForms,
  updateForm,
  deleteForm,
  addField,
  updateField,
  deleteField,
  reorderFields,
  submitForm,
  getSubmission,
  listSubmissions,
  getAutoFillSuggestions,
  getFormUrl,
  type FormFieldType,
} from '../services/form-service.js';

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const createFormSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
});

const updateFormSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  isPublic: z.boolean().optional(),
});

const fieldTypeEnum = z.enum(['text', 'multiline', 'date', 'email', 'phone', 'select']);

const createFieldSchema = z.object({
  label: z.string().min(1).max(200),
  fieldType: fieldTypeEnum,
  required: z.boolean().optional(),
  placeholder: z.string().max(200).optional(),
  options: z.array(z.string()).optional(),
  displayOrder: z.number().int().optional(),
});

const updateFieldSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  fieldType: fieldTypeEnum.optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(200).optional(),
  options: z.array(z.string()).optional(),
  displayOrder: z.number().int().optional(),
});

const reorderFieldsSchema = z.object({
  fieldIds: z.array(z.string()),
});

const submitFormSchema = z.object({
  responses: z.array(z.object({
    fieldId: z.string(),
    value: z.string(),
    source: z.enum(['agent', 'user']),
  })),
  respondentName: z.string().optional(),
  respondentEmail: z.string().email().optional(),
});

const autoFillSchema = z.object({
  apiKey: z.string().min(1),
});

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export function registerFormRoutes(app: FastifyInstance): void {

  // =========================================================================
  // PUBLIC ROUTES (No authentication required)
  // =========================================================================

  // -------------------------------------------------------------------------
  // Get public form (for filling) - forms are now agents with recordType='form'
  // -------------------------------------------------------------------------
  app.get('/public/form/:formId', async (req, reply) => {
    const { formId } = req.params as { formId: string };

    try {
      const form = await getFormPublic(formId);

      if (!form) {
        reply.code(404);
        return { error: 'Form not found' };
      }

      // Map FormAgent fields to legacy Form response format for iOS compatibility
      return {
        id: form.id,
        title: form.name,  // FormAgent uses 'name', iOS expects 'title'
        description: form.description,
        emoji: form.emoji,
        accentColor: form.accentColor,
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
    } catch (error: any) {
      app.log.error({ err: error, formId }, 'Failed to get public form');
      reply.code(500);
      return { error: 'Failed to retrieve form' };
    }
  });

  // -------------------------------------------------------------------------
  // Submit form responses
  // -------------------------------------------------------------------------
  app.post('/public/form/:formId/submit', async (req, reply) => {
    const { formId } = req.params as { formId: string };

    try {
      const body = submitFormSchema.parse(req.body);

      // Get respondent user ID if authenticated
      const respondentUserId = req.user?.userId || null;

      const submission = await submitForm(formId, respondentUserId, body);

      return {
        success: true,
        submissionId: submission.id,
        status: submission.status,
        submittedAt: submission.submittedAt,
      };
    } catch (error: any) {
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

    const { formId } = req.params as { formId: string };

    try {
      const body = autoFillSchema.parse(req.body);
      const suggestions = await getAutoFillSuggestions(req.user.userId, formId, body.apiKey);

      return { suggestions };
    } catch (error: any) {
      app.log.error({ err: error, formId }, 'Failed to get auto-fill suggestions');
      reply.code(500);
      return { error: 'Failed to get suggestions' };
    }
  });

  // =========================================================================
  // AUTHENTICATED ROUTES (For form owners)
  // =========================================================================

  // -------------------------------------------------------------------------
  // Create form (creates a public agent with recordType='form')
  // -------------------------------------------------------------------------
  app.post('/api/forms', async (req, reply) => {
    if (!req.user) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    try {
      const body = createFormSchema.parse(req.body);
      const form = await createForm(req.user.userId, body);

      app.log.info({ userId: req.user.userId, formId: form.id }, 'Form created');

      // Map FormAgent to legacy Form response for iOS compatibility
      return {
        success: true,
        form: {
          id: form.id,
          title: form.name,       // FormAgent.name -> title
          description: form.description,
          isPublic: form.isActive, // FormAgent.isActive -> isPublic
          url: getFormUrl(form.id),
          fields: [],
          createdAt: form.createdAt,
        },
      };
    } catch (error: any) {
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
      const forms = await listUserForms(req.user.userId);

      // Map FormAgent to legacy Form response for iOS compatibility
      return {
        forms: forms.map(f => ({
          id: f.id,
          title: f.name,           // FormAgent.name -> title
          description: f.description,
          isPublic: f.isActive,    // FormAgent.isActive -> isPublic
          url: getFormUrl(f.id),
          fieldCount: f.fields?.length || 0,
          viewCount: f.viewCount,
          submissionCount: f.submissionCount,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        })),
        total: forms.length,
      };
    } catch (error: any) {
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

    const { formId } = req.params as { formId: string };

    try {
      const form = await getForm(formId);

      if (!form || form.ownerId !== req.user.userId) {
        reply.code(404);
        return { error: 'Form not found' };
      }

      // Map FormAgent to legacy Form response for iOS compatibility
      return {
        id: form.id,
        title: form.name,           // FormAgent.name -> title
        description: form.description,
        isPublic: form.isActive,    // FormAgent.isActive -> isPublic
        url: getFormUrl(form.id),
        fields: form.fields,
        viewCount: form.viewCount,
        submissionCount: form.submissionCount,
        createdAt: form.createdAt,
        updatedAt: form.updatedAt,
      };
    } catch (error: any) {
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

    const { formId } = req.params as { formId: string };

    try {
      const body = updateFormSchema.parse(req.body);
      const form = await updateForm(req.user.userId, formId, body);

      // Map FormAgent to legacy Form response for iOS compatibility
      return {
        success: true,
        form: {
          id: form.id,
          title: form.name,         // FormAgent.name -> title
          description: form.description,
          isPublic: form.isActive,  // FormAgent.isActive -> isPublic
          updatedAt: form.updatedAt,
        },
      };
    } catch (error: any) {
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

    const { formId } = req.params as { formId: string };

    try {
      await deleteForm(req.user.userId, formId);
      return { success: true };
    } catch (error: any) {
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

    const { formId } = req.params as { formId: string };

    try {
      const body = createFieldSchema.parse(req.body);
      const field = await addField(req.user.userId, formId, body);

      return {
        success: true,
        field,
      };
    } catch (error: any) {
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

    const { formId, fieldId } = req.params as { formId: string; fieldId: string };

    try {
      const body = updateFieldSchema.parse(req.body);
      const field = await updateField(req.user.userId, formId, fieldId, body);

      return {
        success: true,
        field,
      };
    } catch (error: any) {
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

    const { formId, fieldId } = req.params as { formId: string; fieldId: string };

    try {
      await deleteField(req.user.userId, formId, fieldId);
      return { success: true };
    } catch (error: any) {
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

    const { formId } = req.params as { formId: string };

    try {
      const body = reorderFieldsSchema.parse(req.body);
      const fields = await reorderFields(req.user.userId, formId, body.fieldIds);

      return {
        success: true,
        fields,
      };
    } catch (error: any) {
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

    const { formId } = req.params as { formId: string };

    try {
      const submissions = await listSubmissions(req.user.userId, formId);

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
    } catch (error: any) {
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

    const { formId, submissionId } = req.params as { formId: string; submissionId: string };

    try {
      const submission = await getSubmission(req.user.userId, formId, submissionId);

      if (!submission) {
        reply.code(404);
        return { error: 'Submission not found' };
      }

      // Get form for field labels
      const form = await getForm(formId);
      const fieldMap = new Map(form?.fields?.map(f => [f.id, f]) || []);

      return {
        id: submission.id,
        formId: submission.agentId,  // FormSubmission.agentId -> formId for iOS compatibility
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
    } catch (error: any) {
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
