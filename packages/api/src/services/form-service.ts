import {
  getDatabase,
  publicAgents,
  formFields,
  formSubmissions,
  formResponses,
  users,
  userMemoryFacts,
} from '@macp/core';
import { eq, and, desc, asc } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createClaudeAdapter } from '@macp/core';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type FormFieldType = 'text' | 'multiline' | 'date' | 'email' | 'phone' | 'select';
export type FormSubmissionStatus = 'in_progress' | 'completed';
export type FormResponseSource = 'agent' | 'user';

export interface FormField {
  id: string;
  agentId: string;
  label: string;
  fieldType: FormFieldType;
  required: boolean;
  placeholder?: string | null;
  options?: string[] | null;
  displayOrder: number;
  createdAt: Date;
}

// Form is now a public agent with recordType = 'form' and attached fields
export interface FormAgent {
  id: string;           // agentId
  ownerId: string;
  ownerName?: string | null;
  name: string;         // Form title
  emoji: string;
  description: string;  // Form description
  personality: string;
  greeting: string;
  accentColor: string;
  isActive: boolean;    // Public/shared status
  viewCount: number;
  submissionCount: number;
  createdAt: Date;
  updatedAt: Date;
  fields?: FormField[];
}

export interface FormSubmission {
  id: string;
  agentId: string;
  respondentUserId?: string | null;
  respondentName?: string | null;
  respondentEmail?: string | null;
  status: FormSubmissionStatus;
  createdAt: Date;
  submittedAt?: Date | null;
  responses?: FormResponse[];
}

export interface FormResponse {
  id: string;
  submissionId: string;
  fieldId: string;
  value: string;
  source: FormResponseSource;
  createdAt: Date;
}

export interface CreateFormAgentInput {
  name: string;         // Form title
  description?: string; // Form description
  emoji?: string;
  personality?: string;
  greeting?: string;
  accentColor?: string;
}

export interface CreateFieldInput {
  label: string;
  fieldType: FormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  displayOrder?: number;
}

export interface UpdateFieldInput {
  label?: string;
  fieldType?: FormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  displayOrder?: number;
}

export interface SubmitFormInput {
  responses: Array<{
    fieldId: string;
    value: string;
    source: FormResponseSource;
  }>;
  respondentName?: string;
  respondentEmail?: string;
}

// -----------------------------------------------------------------------------
// Form Agent CRUD (Forms are agents with recordType = 'form')
// -----------------------------------------------------------------------------

export async function createFormAgent(userId: string, ownerName: string | null, input: CreateFormAgentInput): Promise<FormAgent> {
  const db = getDatabase();
  const id = ulid();
  const now = new Date();

  const [agent] = await db.insert(publicAgents).values({
    agentId: id,
    ownerId: userId,
    ownerName: ownerName,
    recordType: 'form',
    name: input.name,
    emoji: input.emoji || '📋',
    description: input.description || '',
    personality: input.personality || 'Professional and helpful form assistant',
    greeting: input.greeting || `Please fill out this form: ${input.name}`,
    accentColor: input.accentColor || '#007AFF',
    isActive: true,
    allowDirectChat: true,
    viewCount: 0,
    submissionCount: 0,
    createdAt: now,
    updatedAt: now,
  }).returning();

  console.log(`[FormService] Created form agent: ${agent.name} (id: ${id})`);

  return {
    id: agent.agentId,
    ownerId: agent.ownerId,
    ownerName: agent.ownerName,
    name: agent.name,
    emoji: agent.emoji,
    description: agent.description,
    personality: agent.personality,
    greeting: agent.greeting,
    accentColor: agent.accentColor,
    isActive: agent.isActive,
    viewCount: agent.viewCount,
    submissionCount: agent.submissionCount,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    fields: [],
  };
}

export async function getFormAgent(agentId: string): Promise<FormAgent | null> {
  const db = getDatabase();

  const [agent] = await db.select().from(publicAgents)
    .where(and(
      eq(publicAgents.agentId, agentId),
      eq(publicAgents.recordType, 'form')
    ));

  if (!agent) return null;

  const fields = await db.select()
    .from(formFields)
    .where(eq(formFields.agentId, agentId))
    .orderBy(asc(formFields.displayOrder));

  return {
    id: agent.agentId,
    ownerId: agent.ownerId,
    ownerName: agent.ownerName,
    name: agent.name,
    emoji: agent.emoji,
    description: agent.description,
    personality: agent.personality,
    greeting: agent.greeting,
    accentColor: agent.accentColor,
    isActive: agent.isActive,
    viewCount: agent.viewCount,
    submissionCount: agent.submissionCount,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    fields: fields.map(f => ({
      ...f,
      fieldType: f.fieldType as FormFieldType,
    })),
  };
}

export async function getFormAgentPublic(agentId: string): Promise<FormAgent | null> {
  const agent = await getFormAgent(agentId);
  if (!agent || !agent.isActive) return null;

  // Increment view count
  const db = getDatabase();
  await db.update(publicAgents)
    .set({ viewCount: agent.viewCount + 1 })
    .where(eq(publicAgents.agentId, agentId));

  return agent;
}

export async function listUserFormAgents(userId: string): Promise<FormAgent[]> {
  const db = getDatabase();

  const agents = await db.select()
    .from(publicAgents)
    .where(and(
      eq(publicAgents.ownerId, userId),
      eq(publicAgents.recordType, 'form')
    ))
    .orderBy(desc(publicAgents.createdAt));

  // Get fields for each form agent
  const agentsWithFields = await Promise.all(
    agents.map(async (agent) => {
      const fields = await db.select()
        .from(formFields)
        .where(eq(formFields.agentId, agent.agentId))
        .orderBy(asc(formFields.displayOrder));

      return {
        id: agent.agentId,
        ownerId: agent.ownerId,
        ownerName: agent.ownerName,
        name: agent.name,
        emoji: agent.emoji,
        description: agent.description,
        personality: agent.personality,
        greeting: agent.greeting,
        accentColor: agent.accentColor,
        isActive: agent.isActive,
        viewCount: agent.viewCount,
        submissionCount: agent.submissionCount,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
        fields: fields.map(f => ({
          ...f,
          fieldType: f.fieldType as FormFieldType,
        })),
      };
    })
  );

  return agentsWithFields;
}

export async function updateFormAgent(
  userId: string,
  agentId: string,
  input: Partial<CreateFormAgentInput> & { isActive?: boolean }
): Promise<FormAgent> {
  const db = getDatabase();

  const [agent] = await db.select().from(publicAgents)
    .where(and(
      eq(publicAgents.agentId, agentId),
      eq(publicAgents.ownerId, userId),
      eq(publicAgents.recordType, 'form')
    ));

  if (!agent) {
    throw new Error('Form not found');
  }

  await db.update(publicAgents)
    .set({
      name: input.name ?? agent.name,
      description: input.description ?? agent.description,
      emoji: input.emoji ?? agent.emoji,
      personality: input.personality ?? agent.personality,
      greeting: input.greeting ?? agent.greeting,
      accentColor: input.accentColor ?? agent.accentColor,
      isActive: input.isActive ?? agent.isActive,
      updatedAt: new Date(),
    })
    .where(eq(publicAgents.agentId, agentId));

  return await getFormAgent(agentId) as FormAgent;
}

export async function deleteFormAgent(userId: string, agentId: string): Promise<void> {
  const db = getDatabase();

  const [agent] = await db.select().from(publicAgents)
    .where(and(
      eq(publicAgents.agentId, agentId),
      eq(publicAgents.ownerId, userId),
      eq(publicAgents.recordType, 'form')
    ));

  if (!agent) {
    throw new Error('Form not found');
  }

  await db.delete(publicAgents).where(eq(publicAgents.agentId, agentId));
  console.log(`[FormService] Deleted form agent: ${agentId}`);
}

// -----------------------------------------------------------------------------
// Field CRUD
// -----------------------------------------------------------------------------

/**
 * Get all fields for a form agent (public, no ownership check)
 */
export async function getFormFieldsForAgent(agentId: string): Promise<FormField[]> {
  const db = getDatabase();

  const fields = await db.select()
    .from(formFields)
    .where(eq(formFields.agentId, agentId))
    .orderBy(asc(formFields.displayOrder));

  return fields.map(f => ({
    ...f,
    fieldType: f.fieldType as FormFieldType,
  }));
}

export async function addField(
  userId: string,
  agentId: string,
  input: CreateFieldInput
): Promise<FormField> {
  const db = getDatabase();

  // Verify ownership
  const [agent] = await db.select().from(publicAgents)
    .where(and(
      eq(publicAgents.agentId, agentId),
      eq(publicAgents.ownerId, userId),
      eq(publicAgents.recordType, 'form')
    ));

  if (!agent) {
    throw new Error('Form not found');
  }

  // Get current max display order
  const existingFields = await db.select()
    .from(formFields)
    .where(eq(formFields.agentId, agentId))
    .orderBy(desc(formFields.displayOrder));

  const maxOrder = existingFields.length > 0 ? existingFields[0].displayOrder : -1;

  const id = ulid();
  const [field] = await db.insert(formFields).values({
    id,
    agentId,
    label: input.label,
    fieldType: input.fieldType,
    required: input.required ?? false,
    placeholder: input.placeholder,
    options: input.options,
    displayOrder: input.displayOrder ?? maxOrder + 1,
  }).returning();

  // Update agent timestamp
  await db.update(publicAgents)
    .set({ updatedAt: new Date() })
    .where(eq(publicAgents.agentId, agentId));

  return {
    ...field,
    fieldType: field.fieldType as FormFieldType,
  };
}

export async function updateField(
  userId: string,
  agentId: string,
  fieldId: string,
  input: UpdateFieldInput
): Promise<FormField> {
  const db = getDatabase();

  // Verify ownership
  const [agent] = await db.select().from(publicAgents)
    .where(and(
      eq(publicAgents.agentId, agentId),
      eq(publicAgents.ownerId, userId),
      eq(publicAgents.recordType, 'form')
    ));

  if (!agent) {
    throw new Error('Form not found');
  }

  const [existingField] = await db.select().from(formFields)
    .where(and(eq(formFields.id, fieldId), eq(formFields.agentId, agentId)));

  if (!existingField) {
    throw new Error('Field not found');
  }

  const [updated] = await db.update(formFields)
    .set({
      label: input.label ?? existingField.label,
      fieldType: input.fieldType ?? existingField.fieldType,
      required: input.required ?? existingField.required,
      placeholder: input.placeholder ?? existingField.placeholder,
      options: input.options ?? existingField.options,
      displayOrder: input.displayOrder ?? existingField.displayOrder,
    })
    .where(eq(formFields.id, fieldId))
    .returning();

  // Update agent timestamp
  await db.update(publicAgents)
    .set({ updatedAt: new Date() })
    .where(eq(publicAgents.agentId, agentId));

  return {
    ...updated,
    fieldType: updated.fieldType as FormFieldType,
  };
}

export async function deleteField(
  userId: string,
  agentId: string,
  fieldId: string
): Promise<void> {
  const db = getDatabase();

  // Verify ownership
  const [agent] = await db.select().from(publicAgents)
    .where(and(
      eq(publicAgents.agentId, agentId),
      eq(publicAgents.ownerId, userId),
      eq(publicAgents.recordType, 'form')
    ));

  if (!agent) {
    throw new Error('Form not found');
  }

  await db.delete(formFields).where(eq(formFields.id, fieldId));

  // Update agent timestamp
  await db.update(publicAgents)
    .set({ updatedAt: new Date() })
    .where(eq(publicAgents.agentId, agentId));
}

export async function reorderFields(
  userId: string,
  agentId: string,
  fieldIds: string[]
): Promise<FormField[]> {
  const db = getDatabase();

  // Verify ownership
  const [agent] = await db.select().from(publicAgents)
    .where(and(
      eq(publicAgents.agentId, agentId),
      eq(publicAgents.ownerId, userId),
      eq(publicAgents.recordType, 'form')
    ));

  if (!agent) {
    throw new Error('Form not found');
  }

  // Update display order for each field
  await Promise.all(
    fieldIds.map((fieldId, index) =>
      db.update(formFields)
        .set({ displayOrder: index })
        .where(eq(formFields.id, fieldId))
    )
  );

  // Return updated fields
  const fields = await db.select()
    .from(formFields)
    .where(eq(formFields.agentId, agentId))
    .orderBy(asc(formFields.displayOrder));

  return fields.map(f => ({
    ...f,
    fieldType: f.fieldType as FormFieldType,
  }));
}

// -----------------------------------------------------------------------------
// Form Submission
// -----------------------------------------------------------------------------

export async function submitForm(
  agentId: string,
  respondentUserId: string | null,
  input: SubmitFormInput
): Promise<FormSubmission> {
  const db = getDatabase();

  const agent = await getFormAgent(agentId);
  if (!agent || !agent.isActive) {
    throw new Error('Form not found');
  }

  const id = ulid();
  const now = new Date();

  // Create submission
  const [submission] = await db.insert(formSubmissions).values({
    id,
    agentId,
    respondentUserId,
    respondentName: input.respondentName,
    respondentEmail: input.respondentEmail,
    status: 'completed',
    createdAt: now,
    submittedAt: now,
  }).returning();

  // Create responses
  const responses: FormResponse[] = [];
  for (const response of input.responses) {
    const [created] = await db.insert(formResponses).values({
      id: ulid(),
      submissionId: id,
      fieldId: response.fieldId,
      value: response.value,
      source: response.source,
    }).returning();

    responses.push({
      ...created,
      source: created.source as FormResponseSource,
    });
  }

  // Increment submission count
  await db.update(publicAgents)
    .set({ submissionCount: agent.submissionCount + 1 })
    .where(eq(publicAgents.agentId, agentId));

  // Extract facts and save to respondent's profile
  if (respondentUserId) {
    extractAndSaveMemories(respondentUserId, agent, input.responses).catch(err => {
      console.error('[FormService] Failed to extract memories:', err);
    });
  }

  console.log(`[FormService] Form submitted: ${agentId} by ${respondentUserId || 'anonymous'}`);

  return {
    ...submission,
    status: submission.status as FormSubmissionStatus,
    responses,
  };
}

export async function getSubmission(
  userId: string,
  agentId: string,
  submissionId: string
): Promise<FormSubmission | null> {
  const db = getDatabase();

  // Verify form ownership
  const [agent] = await db.select().from(publicAgents)
    .where(and(
      eq(publicAgents.agentId, agentId),
      eq(publicAgents.ownerId, userId),
      eq(publicAgents.recordType, 'form')
    ));

  if (!agent) {
    throw new Error('Form not found');
  }

  const [submission] = await db.select()
    .from(formSubmissions)
    .where(eq(formSubmissions.id, submissionId));

  if (!submission || submission.agentId !== agentId) {
    return null;
  }

  const responses = await db.select()
    .from(formResponses)
    .where(eq(formResponses.submissionId, submissionId));

  return {
    ...submission,
    status: submission.status as FormSubmissionStatus,
    responses: responses.map(r => ({
      ...r,
      source: r.source as FormResponseSource,
    })),
  };
}

export async function listSubmissions(
  userId: string,
  agentId: string
): Promise<FormSubmission[]> {
  const db = getDatabase();

  // Verify form ownership
  const [agent] = await db.select().from(publicAgents)
    .where(and(
      eq(publicAgents.agentId, agentId),
      eq(publicAgents.ownerId, userId),
      eq(publicAgents.recordType, 'form')
    ));

  if (!agent) {
    throw new Error('Form not found');
  }

  const submissions = await db.select()
    .from(formSubmissions)
    .where(eq(formSubmissions.agentId, agentId))
    .orderBy(desc(formSubmissions.submittedAt));

  return submissions.map(s => ({
    ...s,
    status: s.status as FormSubmissionStatus,
  }));
}

// -----------------------------------------------------------------------------
// Agent Auto-Fill
// -----------------------------------------------------------------------------

export async function getAutoFillSuggestions(
  respondentUserId: string,
  agentId: string,
  apiKey: string
): Promise<Record<string, { value: string; confidence: string }>> {
  const db = getDatabase();

  const agent = await getFormAgent(agentId);
  if (!agent || !agent.fields) {
    throw new Error('Form not found');
  }

  // Get user's memory facts
  const facts = await db.select()
    .from(userMemoryFacts)
    .where(eq(userMemoryFacts.userId, respondentUserId));

  if (facts.length === 0) {
    return {};
  }

  // Get user profile info
  const [user] = await db.select().from(users).where(eq(users.id, respondentUserId));

  // Build context for AI
  const factsContext = facts.map(f => `- ${f.category}/${f.key}: ${JSON.stringify(f.value)}`).join('\n');
  const fieldsToFill = agent.fields.map(f => `- "${f.label}" (${f.fieldType}${f.required ? ', required' : ''})`).join('\n');

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
    const adapter = createClaudeAdapter(apiKey, 'claude-haiku-4-5-20251001');
    const response = await adapter.generate({
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: 'You are a helpful assistant that auto-fills forms based on user profile data.',
      maxTokens: 1000,
    });
    const parsed = JSON.parse(response.content);
    return parsed;
  } catch (error) {
    console.error('[FormService] Auto-fill failed:', error);
    return {};
  }
}

// -----------------------------------------------------------------------------
// Memory Extraction
// -----------------------------------------------------------------------------

async function extractAndSaveMemories(
  userId: string,
  agent: FormAgent,
  responses: Array<{ fieldId: string; value: string; source: FormResponseSource }>
): Promise<void> {
  const db = getDatabase();

  if (!agent.fields) return;

  // Build field map
  const fieldMap = new Map(agent.fields.map(f => [f.id, f]));

  // Build context for AI
  const answersContext = responses
    .map(r => {
      const field = fieldMap.get(r.fieldId);
      return field ? `${field.label}: ${r.value}` : null;
    })
    .filter(Boolean)
    .join('\n');

  try {
    // Simple extraction based on field types
    for (const response of responses) {
      const field = fieldMap.get(response.fieldId);
      if (!field || !response.value) continue;

      const label = field.label.toLowerCase();
      let category = 'general';
      let key = label.replace(/[^a-z0-9]+/g, '_');

      // Simple categorization based on common field labels
      if (label.includes('name') || label.includes('birth') || label.includes('dob')) {
        category = 'identity';
      } else if (label.includes('allerg') || label.includes('medication') || label.includes('medical') || label.includes('health')) {
        category = 'health';
      } else if (label.includes('diet') || label.includes('food')) {
        category = 'dietary';
      } else if (label.includes('email') || label.includes('phone') || label.includes('address')) {
        category = 'identity';
      }

      // Check if fact already exists
      const [existing] = await db.select()
        .from(userMemoryFacts)
        .where(and(
          eq(userMemoryFacts.userId, userId),
          eq(userMemoryFacts.key, key)
        ));

      if (existing) {
        // Update if value changed
        if (JSON.stringify(existing.value) !== JSON.stringify(response.value)) {
          await db.insert(userMemoryFacts).values({
            id: ulid(),
            userId,
            category,
            key,
            value: response.value,
            confidence: 'high',
            learnedFrom: `Form: ${agent.name}`,
            learnedAt: new Date(),
            supersedes: existing.id,
          });
        }
      } else {
        // Create new fact
        await db.insert(userMemoryFacts).values({
          id: ulid(),
          userId,
          category,
          key,
          value: response.value,
          confidence: 'high',
          learnedFrom: `Form: ${agent.name}`,
          learnedAt: new Date(),
        });
      }
    }

    console.log(`[FormService] Extracted memories from form ${agent.id} for user ${userId}`);
  } catch (error) {
    console.error('[FormService] Memory extraction failed:', error);
  }
}

// -----------------------------------------------------------------------------
// URL generation
// -----------------------------------------------------------------------------

export function getFormUrl(agentId: string): string {
  const baseUrl = process.env.PUBLIC_URL || 'https://macp.io';
  return `${baseUrl}/${agentId}`;
}

// -----------------------------------------------------------------------------
// Backward compatibility aliases
// -----------------------------------------------------------------------------

// These aliases help with migration - eventually can be removed
export const createForm = async (userId: string, input: { title: string; description?: string }) => {
  return createFormAgent(userId, null, { name: input.title, description: input.description });
};

export const getForm = getFormAgent;
export const getFormPublic = getFormAgentPublic;
export const listUserForms = listUserFormAgents;

export const updateForm = async (
  userId: string,
  agentId: string,
  input: { title?: string; description?: string; isPublic?: boolean }
) => {
  return updateFormAgent(userId, agentId, {
    name: input.title,
    description: input.description,
    isActive: input.isPublic,
  });
};

export const deleteForm = deleteFormAgent;

// Legacy Form type alias
export type Form = FormAgent;
