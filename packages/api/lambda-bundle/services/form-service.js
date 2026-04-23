"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createForm = createForm;
exports.getForm = getForm;
exports.getFormPublic = getFormPublic;
exports.listUserForms = listUserForms;
exports.updateForm = updateForm;
exports.deleteForm = deleteForm;
exports.addField = addField;
exports.updateField = updateField;
exports.deleteField = deleteField;
exports.reorderFields = reorderFields;
exports.submitForm = submitForm;
exports.getSubmission = getSubmission;
exports.listSubmissions = listSubmissions;
exports.getAutoFillSuggestions = getAutoFillSuggestions;
exports.lookupPublicResource = lookupPublicResource;
exports.getFormUrl = getFormUrl;
const core_1 = require("@macp/core");
const drizzle_orm_1 = require("drizzle-orm");
const ulid_1 = require("ulid");
const core_2 = require("@macp/core");
// -----------------------------------------------------------------------------
// Form CRUD
// -----------------------------------------------------------------------------
async function createForm(userId, input) {
    const db = (0, core_1.getDatabase)();
    const id = (0, ulid_1.ulid)();
    const now = new Date();
    const [form] = await db.insert(core_1.forms).values({
        id,
        userId,
        title: input.title,
        description: input.description,
        isPublic: true,
        createdAt: now,
        updatedAt: now,
    }).returning();
    console.log(`[FormService] Created form: ${form.title} (id: ${id})`);
    return {
        ...form,
        fields: [],
    };
}
async function getForm(formId) {
    const db = (0, core_1.getDatabase)();
    const [form] = await db.select().from(core_1.forms).where((0, drizzle_orm_1.eq)(core_1.forms.id, formId));
    if (!form)
        return null;
    const fields = await db.select()
        .from(core_1.formFields)
        .where((0, drizzle_orm_1.eq)(core_1.formFields.formId, formId))
        .orderBy((0, drizzle_orm_1.asc)(core_1.formFields.displayOrder));
    return {
        ...form,
        fields: fields.map(f => ({
            ...f,
            fieldType: f.fieldType,
        })),
    };
}
async function getFormPublic(formId) {
    const form = await getForm(formId);
    if (!form || !form.isPublic)
        return null;
    // Increment view count
    const db = (0, core_1.getDatabase)();
    await db.update(core_1.forms)
        .set({ viewCount: form.viewCount + 1 })
        .where((0, drizzle_orm_1.eq)(core_1.forms.id, formId));
    return form;
}
async function listUserForms(userId) {
    const db = (0, core_1.getDatabase)();
    const userForms = await db.select()
        .from(core_1.forms)
        .where((0, drizzle_orm_1.eq)(core_1.forms.userId, userId))
        .orderBy((0, drizzle_orm_1.desc)(core_1.forms.createdAt));
    // Get field counts for each form
    const formsWithFields = await Promise.all(userForms.map(async (form) => {
        const fields = await db.select()
            .from(core_1.formFields)
            .where((0, drizzle_orm_1.eq)(core_1.formFields.formId, form.id))
            .orderBy((0, drizzle_orm_1.asc)(core_1.formFields.displayOrder));
        return {
            ...form,
            fields: fields.map(f => ({
                ...f,
                fieldType: f.fieldType,
            })),
        };
    }));
    return formsWithFields;
}
async function updateForm(userId, formId, input) {
    const db = (0, core_1.getDatabase)();
    const [form] = await db.select().from(core_1.forms)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.forms.id, formId), (0, drizzle_orm_1.eq)(core_1.forms.userId, userId)));
    if (!form) {
        throw new Error('Form not found');
    }
    const [updated] = await db.update(core_1.forms)
        .set({
        title: input.title ?? form.title,
        description: input.description ?? form.description,
        isPublic: input.isPublic ?? form.isPublic,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(core_1.forms.id, formId))
        .returning();
    return await getForm(formId);
}
async function deleteForm(userId, formId) {
    const db = (0, core_1.getDatabase)();
    const [form] = await db.select().from(core_1.forms)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.forms.id, formId), (0, drizzle_orm_1.eq)(core_1.forms.userId, userId)));
    if (!form) {
        throw new Error('Form not found');
    }
    await db.delete(core_1.forms).where((0, drizzle_orm_1.eq)(core_1.forms.id, formId));
    console.log(`[FormService] Deleted form: ${formId}`);
}
// -----------------------------------------------------------------------------
// Field CRUD
// -----------------------------------------------------------------------------
async function addField(userId, formId, input) {
    const db = (0, core_1.getDatabase)();
    // Verify ownership
    const [form] = await db.select().from(core_1.forms)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.forms.id, formId), (0, drizzle_orm_1.eq)(core_1.forms.userId, userId)));
    if (!form) {
        throw new Error('Form not found');
    }
    // Get current max display order
    const existingFields = await db.select()
        .from(core_1.formFields)
        .where((0, drizzle_orm_1.eq)(core_1.formFields.formId, formId))
        .orderBy((0, drizzle_orm_1.desc)(core_1.formFields.displayOrder));
    const maxOrder = existingFields.length > 0 ? existingFields[0].displayOrder : -1;
    const id = (0, ulid_1.ulid)();
    const [field] = await db.insert(core_1.formFields).values({
        id,
        formId,
        label: input.label,
        fieldType: input.fieldType,
        required: input.required ?? false,
        placeholder: input.placeholder,
        options: input.options,
        displayOrder: input.displayOrder ?? maxOrder + 1,
    }).returning();
    // Update form timestamp
    await db.update(core_1.forms)
        .set({ updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(core_1.forms.id, formId));
    return {
        ...field,
        fieldType: field.fieldType,
    };
}
async function updateField(userId, formId, fieldId, input) {
    const db = (0, core_1.getDatabase)();
    // Verify ownership
    const [form] = await db.select().from(core_1.forms)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.forms.id, formId), (0, drizzle_orm_1.eq)(core_1.forms.userId, userId)));
    if (!form) {
        throw new Error('Form not found');
    }
    const [existingField] = await db.select().from(core_1.formFields)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.formFields.id, fieldId), (0, drizzle_orm_1.eq)(core_1.formFields.formId, formId)));
    if (!existingField) {
        throw new Error('Field not found');
    }
    const [updated] = await db.update(core_1.formFields)
        .set({
        label: input.label ?? existingField.label,
        fieldType: input.fieldType ?? existingField.fieldType,
        required: input.required ?? existingField.required,
        placeholder: input.placeholder ?? existingField.placeholder,
        options: input.options ?? existingField.options,
        displayOrder: input.displayOrder ?? existingField.displayOrder,
    })
        .where((0, drizzle_orm_1.eq)(core_1.formFields.id, fieldId))
        .returning();
    // Update form timestamp
    await db.update(core_1.forms)
        .set({ updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(core_1.forms.id, formId));
    return {
        ...updated,
        fieldType: updated.fieldType,
    };
}
async function deleteField(userId, formId, fieldId) {
    const db = (0, core_1.getDatabase)();
    // Verify ownership
    const [form] = await db.select().from(core_1.forms)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.forms.id, formId), (0, drizzle_orm_1.eq)(core_1.forms.userId, userId)));
    if (!form) {
        throw new Error('Form not found');
    }
    await db.delete(core_1.formFields).where((0, drizzle_orm_1.eq)(core_1.formFields.id, fieldId));
    // Update form timestamp
    await db.update(core_1.forms)
        .set({ updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(core_1.forms.id, formId));
}
async function reorderFields(userId, formId, fieldIds) {
    const db = (0, core_1.getDatabase)();
    // Verify ownership
    const [form] = await db.select().from(core_1.forms)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.forms.id, formId), (0, drizzle_orm_1.eq)(core_1.forms.userId, userId)));
    if (!form) {
        throw new Error('Form not found');
    }
    // Update display order for each field
    await Promise.all(fieldIds.map((fieldId, index) => db.update(core_1.formFields)
        .set({ displayOrder: index })
        .where((0, drizzle_orm_1.eq)(core_1.formFields.id, fieldId))));
    // Return updated fields
    const fields = await db.select()
        .from(core_1.formFields)
        .where((0, drizzle_orm_1.eq)(core_1.formFields.formId, formId))
        .orderBy((0, drizzle_orm_1.asc)(core_1.formFields.displayOrder));
    return fields.map(f => ({
        ...f,
        fieldType: f.fieldType,
    }));
}
// -----------------------------------------------------------------------------
// Form Submission
// -----------------------------------------------------------------------------
async function submitForm(formId, respondentUserId, input) {
    const db = (0, core_1.getDatabase)();
    const form = await getForm(formId);
    if (!form || !form.isPublic) {
        throw new Error('Form not found');
    }
    const id = (0, ulid_1.ulid)();
    const now = new Date();
    // Create submission
    const [submission] = await db.insert(core_1.formSubmissions).values({
        id,
        formId,
        respondentUserId,
        respondentName: input.respondentName,
        respondentEmail: input.respondentEmail,
        status: 'completed',
        createdAt: now,
        submittedAt: now,
    }).returning();
    // Create responses
    const responses = [];
    for (const response of input.responses) {
        const [created] = await db.insert(core_1.formResponses).values({
            id: (0, ulid_1.ulid)(),
            submissionId: id,
            fieldId: response.fieldId,
            value: response.value,
            source: response.source,
        }).returning();
        responses.push({
            ...created,
            source: created.source,
        });
    }
    // Increment submission count
    await db.update(core_1.forms)
        .set({ submissionCount: form.submissionCount + 1 })
        .where((0, drizzle_orm_1.eq)(core_1.forms.id, formId));
    // Extract facts and save to respondent's profile
    if (respondentUserId) {
        extractAndSaveMemories(respondentUserId, form, input.responses).catch(err => {
            console.error('[FormService] Failed to extract memories:', err);
        });
    }
    console.log(`[FormService] Form submitted: ${formId} by ${respondentUserId || 'anonymous'}`);
    return {
        ...submission,
        status: submission.status,
        responses,
    };
}
async function getSubmission(userId, formId, submissionId) {
    const db = (0, core_1.getDatabase)();
    // Verify form ownership
    const [form] = await db.select().from(core_1.forms)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.forms.id, formId), (0, drizzle_orm_1.eq)(core_1.forms.userId, userId)));
    if (!form) {
        throw new Error('Form not found');
    }
    const [submission] = await db.select()
        .from(core_1.formSubmissions)
        .where((0, drizzle_orm_1.eq)(core_1.formSubmissions.id, submissionId));
    if (!submission || submission.formId !== formId) {
        return null;
    }
    const responses = await db.select()
        .from(core_1.formResponses)
        .where((0, drizzle_orm_1.eq)(core_1.formResponses.submissionId, submissionId));
    return {
        ...submission,
        status: submission.status,
        responses: responses.map(r => ({
            ...r,
            source: r.source,
        })),
    };
}
async function listSubmissions(userId, formId) {
    const db = (0, core_1.getDatabase)();
    // Verify form ownership
    const [form] = await db.select().from(core_1.forms)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.forms.id, formId), (0, drizzle_orm_1.eq)(core_1.forms.userId, userId)));
    if (!form) {
        throw new Error('Form not found');
    }
    const submissions = await db.select()
        .from(core_1.formSubmissions)
        .where((0, drizzle_orm_1.eq)(core_1.formSubmissions.formId, formId))
        .orderBy((0, drizzle_orm_1.desc)(core_1.formSubmissions.submittedAt));
    return submissions.map(s => ({
        ...s,
        status: s.status,
    }));
}
// -----------------------------------------------------------------------------
// Agent Auto-Fill
// -----------------------------------------------------------------------------
async function getAutoFillSuggestions(respondentUserId, formId, apiKey) {
    const db = (0, core_1.getDatabase)();
    const form = await getForm(formId);
    if (!form || !form.fields) {
        throw new Error('Form not found');
    }
    // Get user's memory facts
    const facts = await db.select()
        .from(core_1.userMemoryFacts)
        .where((0, drizzle_orm_1.eq)(core_1.userMemoryFacts.userId, respondentUserId));
    if (facts.length === 0) {
        return {};
    }
    // Get user profile info
    const [user] = await db.select().from(core_1.users).where((0, drizzle_orm_1.eq)(core_1.users.id, respondentUserId));
    // Build context for AI
    const factsContext = facts.map(f => `- ${f.category}/${f.key}: ${JSON.stringify(f.value)}`).join('\n');
    const fieldsToFill = form.fields.map(f => `- "${f.label}" (${f.fieldType}${f.required ? ', required' : ''})`).join('\n');
    const prompt = `You are helping a user auto-fill a form based on their stored profile information.

User's stored facts:
${factsContext}
${user ? `User name: ${user.displayName}` : ''}

Form fields to fill:
${fieldsToFill}

Based on the user's stored information, provide values for any fields you can confidently fill.
Return a JSON object where keys are the field labels and values are objects with "value" and "confidence" (high/medium/low).

Only include fields where you have relevant information. For dates, use YYYY-MM-DD format.
For phone, use the stored format. For email, use the stored email.

Example response:
{
  "Full Name": {"value": "John Smith", "confidence": "high"},
  "Date of Birth": {"value": "1985-03-15", "confidence": "high"},
  "Allergies": {"value": "Shellfish, peanuts", "confidence": "medium"}
}

Return ONLY the JSON object, no other text.`;
    try {
        const adapter = (0, core_2.createClaudeAdapter)(apiKey, 'claude-haiku-4-5-20251001');
        const response = await adapter.generate({
            messages: [{ role: 'user', content: prompt }],
            systemPrompt: 'You are a helpful assistant that auto-fills forms based on user profile data.',
            maxTokens: 1000,
        });
        const parsed = JSON.parse(response.content);
        return parsed;
    }
    catch (error) {
        console.error('[FormService] Auto-fill failed:', error);
        return {};
    }
}
// -----------------------------------------------------------------------------
// Memory Extraction
// -----------------------------------------------------------------------------
async function extractAndSaveMemories(userId, form, responses) {
    const db = (0, core_1.getDatabase)();
    if (!form.fields)
        return;
    // Build field map
    const fieldMap = new Map(form.fields.map(f => [f.id, f]));
    // Build context for AI
    const answersContext = responses
        .map(r => {
        const field = fieldMap.get(r.fieldId);
        return field ? `${field.label}: ${r.value}` : null;
    })
        .filter(Boolean)
        .join('\n');
    const prompt = `Analyze these form responses and extract facts that should be remembered about the user.

Form: ${form.title}
Responses:
${answersContext}

Extract key facts in JSON format. Each fact should have:
- category: one of "identity", "health", "dietary", "preferences", "family", "work", "financial", "general"
- key: a short snake_case identifier (e.g., "full_name", "allergies", "date_of_birth")
- value: the extracted value

Return an array of facts. Only include meaningful information worth remembering.

Example:
[
  {"category": "identity", "key": "full_name", "value": "John Smith"},
  {"category": "health", "key": "allergies", "value": ["shellfish", "peanuts"]},
  {"category": "identity", "key": "date_of_birth", "value": "1985-03-15"}
]

Return ONLY the JSON array, no other text.`;
    try {
        // Use a minimal API call (would need API key from somewhere)
        // For now, do simple extraction based on field types
        for (const response of responses) {
            const field = fieldMap.get(response.fieldId);
            if (!field || !response.value)
                continue;
            const label = field.label.toLowerCase();
            let category = 'general';
            let key = label.replace(/[^a-z0-9]+/g, '_');
            // Simple categorization based on common field labels
            if (label.includes('name') || label.includes('birth') || label.includes('dob')) {
                category = 'identity';
            }
            else if (label.includes('allerg') || label.includes('medication') || label.includes('medical') || label.includes('health')) {
                category = 'health';
            }
            else if (label.includes('diet') || label.includes('food')) {
                category = 'dietary';
            }
            else if (label.includes('email') || label.includes('phone') || label.includes('address')) {
                category = 'identity';
            }
            // Check if fact already exists
            const [existing] = await db.select()
                .from(core_1.userMemoryFacts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.userMemoryFacts.userId, userId), (0, drizzle_orm_1.eq)(core_1.userMemoryFacts.key, key)));
            if (existing) {
                // Update if value changed
                if (JSON.stringify(existing.value) !== JSON.stringify(response.value)) {
                    await db.insert(core_1.userMemoryFacts).values({
                        id: (0, ulid_1.ulid)(),
                        userId,
                        category,
                        key,
                        value: response.value,
                        confidence: 'high',
                        learnedFrom: `Form: ${form.title}`,
                        learnedAt: new Date(),
                        supersedes: existing.id,
                    });
                }
            }
            else {
                // Create new fact
                await db.insert(core_1.userMemoryFacts).values({
                    id: (0, ulid_1.ulid)(),
                    userId,
                    category,
                    key,
                    value: response.value,
                    confidence: 'high',
                    learnedFrom: `Form: ${form.title}`,
                    learnedAt: new Date(),
                });
            }
        }
        console.log(`[FormService] Extracted memories from form ${form.id} for user ${userId}`);
    }
    catch (error) {
        console.error('[FormService] Memory extraction failed:', error);
    }
}
// -----------------------------------------------------------------------------
// Public lookup (for URL routing)
// -----------------------------------------------------------------------------
async function lookupPublicResource(id) {
    const db = (0, core_1.getDatabase)();
    // Try form first (since we're adding this feature)
    const [form] = await db.select({ id: core_1.forms.id })
        .from(core_1.forms)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(core_1.forms.id, id), (0, drizzle_orm_1.eq)(core_1.forms.isPublic, true)));
    if (form) {
        return { type: 'form', id: form.id };
    }
    // Would check public agents here too, but that's in a different table/service
    return null;
}
// -----------------------------------------------------------------------------
// URL generation
// -----------------------------------------------------------------------------
function getFormUrl(formId) {
    const baseUrl = process.env.PUBLIC_URL || 'https://macp.io';
    return `${baseUrl}/${formId}`;
}
//# sourceMappingURL=form-service.js.map