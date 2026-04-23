import { ulid } from 'ulid';
import { eq, and, ilike, or, sql } from 'drizzle-orm';
import { getDatabase, contacts, contactAgents, publicAgents } from '@macp/core';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface CreateContactInput {
  name: string;
  aliases?: string[];
  relationship?: string;
  relationshipStarted?: Date;
  birthday?: string;
  email?: string;
  phone?: string;
  notes?: string;
  tags?: string[];
}

export interface UpdateContactInput {
  name?: string;
  aliases?: string[];
  relationship?: string | null;
  relationshipStarted?: Date | null;
  birthday?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  tags?: string[];
}

export interface ContactWithAgents {
  id: string;
  userId: string;
  name: string;
  aliases: string[];
  relationship: string | null;
  relationshipStarted: Date | null;
  birthday: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  agents: ContactAgent[];
}

export interface ContactAgent {
  id: string;
  contactId: string;
  publicAgentId: string;
  agentName: string;
  agentEmoji: string | null;
  role: string | null;
  discoveredVia: string | null;
  addedAt: Date;
}

export interface AssociateAgentInput {
  publicAgentId: string;
  role?: string;
  discoveredVia?: string;
}

export interface ListContactsOptions {
  limit?: number;
  offset?: number;
  tags?: string[];
  search?: string;
}

// -----------------------------------------------------------------------------
// Contact CRUD Operations
// -----------------------------------------------------------------------------

/**
 * Creates a new contact for a user
 */
export async function createContact(
  userId: string,
  input: CreateContactInput
): Promise<ContactWithAgents> {
  const db = getDatabase();
  const now = new Date();
  const id = ulid();

  await db.insert(contacts).values({
    id,
    userId,
    name: input.name,
    aliases: input.aliases || [],
    relationship: input.relationship,
    relationshipStarted: input.relationshipStarted,
    birthday: input.birthday,
    email: input.email,
    phone: input.phone,
    notes: input.notes,
    tags: input.tags || [],
    createdAt: now,
    updatedAt: now,
  });

  console.log(`[Contacts] Created contact "${input.name}" (${id}) for user ${userId}`);

  return {
    id,
    userId,
    name: input.name,
    aliases: input.aliases || [],
    relationship: input.relationship || null,
    relationshipStarted: input.relationshipStarted || null,
    birthday: input.birthday || null,
    email: input.email || null,
    phone: input.phone || null,
    notes: input.notes || null,
    tags: input.tags || [],
    createdAt: now,
    updatedAt: now,
    agents: [],
  };
}

/**
 * Gets a contact by ID with associated agents
 */
export async function getContact(
  userId: string,
  contactId: string
): Promise<ContactWithAgents | null> {
  const db = getDatabase();

  const result = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const contact = result[0];
  const agents = await getContactAgents(contactId);

  return {
    id: contact.id,
    userId: contact.userId,
    name: contact.name,
    aliases: (contact.aliases as string[]) || [],
    relationship: contact.relationship,
    relationshipStarted: contact.relationshipStarted,
    birthday: contact.birthday,
    email: contact.email,
    phone: contact.phone,
    notes: contact.notes,
    tags: (contact.tags as string[]) || [],
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    agents,
  };
}

/**
 * Lists contacts for a user with optional filtering
 */
export async function listContacts(
  userId: string,
  options: ListContactsOptions = {}
): Promise<{ contacts: ContactWithAgents[]; total: number }> {
  const db = getDatabase();
  const { limit = 50, offset = 0, tags, search } = options;

  // Build base query conditions
  const conditions = [eq(contacts.userId, userId)];

  // Add search filter if provided
  if (search) {
    conditions.push(
      or(
        ilike(contacts.name, `%${search}%`),
        sql`${contacts.aliases}::text ILIKE ${'%' + search + '%'}`
      )!
    );
  }

  // Add tags filter if provided
  if (tags && tags.length > 0) {
    conditions.push(
      sql`${contacts.tags} ?| array[${sql.join(tags.map(t => sql`${t}`), sql`, `)}]`
    );
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(and(...conditions));
  const total = Number(countResult[0]?.count || 0);

  // Get paginated results
  const result = await db
    .select()
    .from(contacts)
    .where(and(...conditions))
    .orderBy(contacts.name)
    .limit(limit)
    .offset(offset);

  // Load agents for each contact
  const contactsWithAgents: ContactWithAgents[] = await Promise.all(
    result.map(async (contact) => {
      const agents = await getContactAgents(contact.id);
      return {
        id: contact.id,
        userId: contact.userId,
        name: contact.name,
        aliases: (contact.aliases as string[]) || [],
        relationship: contact.relationship,
        relationshipStarted: contact.relationshipStarted,
        birthday: contact.birthday,
        email: contact.email,
        phone: contact.phone,
        notes: contact.notes,
        tags: (contact.tags as string[]) || [],
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
        agents,
      };
    })
  );

  return { contacts: contactsWithAgents, total };
}

/**
 * Fuzzy search contacts by name or aliases
 */
export async function searchContactsByName(
  userId: string,
  query: string,
  limit: number = 10
): Promise<ContactWithAgents[]> {
  const db = getDatabase();

  // Search in name and aliases using ILIKE for case-insensitive matching
  const result = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        or(
          ilike(contacts.name, `%${query}%`),
          sql`${contacts.aliases}::text ILIKE ${'%' + query + '%'}`
        )
      )
    )
    .orderBy(
      // Prioritize exact name matches, then prefix matches
      sql`CASE
        WHEN LOWER(${contacts.name}) = LOWER(${query}) THEN 0
        WHEN LOWER(${contacts.name}) LIKE LOWER(${query + '%'}) THEN 1
        ELSE 2
      END`,
      contacts.name
    )
    .limit(limit);

  // Load agents for each contact
  const contactsWithAgents: ContactWithAgents[] = await Promise.all(
    result.map(async (contact) => {
      const agents = await getContactAgents(contact.id);
      return {
        id: contact.id,
        userId: contact.userId,
        name: contact.name,
        aliases: (contact.aliases as string[]) || [],
        relationship: contact.relationship,
        relationshipStarted: contact.relationshipStarted,
        birthday: contact.birthday,
        email: contact.email,
        phone: contact.phone,
        notes: contact.notes,
        tags: (contact.tags as string[]) || [],
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
        agents,
      };
    })
  );

  return contactsWithAgents;
}

/**
 * Updates a contact
 */
export async function updateContact(
  userId: string,
  contactId: string,
  input: UpdateContactInput
): Promise<ContactWithAgents | null> {
  const db = getDatabase();
  const now = new Date();

  // Verify ownership
  const existing = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return null;
  }

  // Build update object
  const updateData: Record<string, unknown> = { updatedAt: now };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.aliases !== undefined) updateData.aliases = input.aliases;
  if (input.relationship !== undefined) updateData.relationship = input.relationship;
  if (input.relationshipStarted !== undefined) updateData.relationshipStarted = input.relationshipStarted;
  if (input.birthday !== undefined) updateData.birthday = input.birthday;
  if (input.email !== undefined) updateData.email = input.email;
  if (input.phone !== undefined) updateData.phone = input.phone;
  if (input.notes !== undefined) updateData.notes = input.notes;
  if (input.tags !== undefined) updateData.tags = input.tags;

  await db
    .update(contacts)
    .set(updateData)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));

  console.log(`[Contacts] Updated contact ${contactId}`);

  return getContact(userId, contactId);
}

/**
 * Deletes a contact (cascades to contact_agents)
 */
export async function deleteContact(
  userId: string,
  contactId: string
): Promise<boolean> {
  const db = getDatabase();

  // Verify ownership
  const existing = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return false;
  }

  await db.delete(contacts).where(eq(contacts.id, contactId));

  console.log(`[Contacts] Deleted contact ${contactId}`);

  return true;
}

// -----------------------------------------------------------------------------
// Contact-Agent Association Operations
// -----------------------------------------------------------------------------

/**
 * Gets all agents associated with a contact
 */
async function getContactAgents(contactId: string): Promise<ContactAgent[]> {
  const db = getDatabase();

  const result = await db
    .select()
    .from(contactAgents)
    .where(eq(contactAgents.contactId, contactId));

  return result.map((agent) => ({
    id: agent.id,
    contactId: agent.contactId,
    publicAgentId: agent.publicAgentId,
    agentName: agent.agentName,
    agentEmoji: agent.agentEmoji,
    role: agent.role,
    discoveredVia: agent.discoveredVia,
    addedAt: agent.addedAt,
  }));
}

/**
 * Associates a public agent with a contact
 */
export async function associateAgentWithContact(
  userId: string,
  contactId: string,
  input: AssociateAgentInput
): Promise<ContactAgent | null> {
  const db = getDatabase();

  // Verify contact ownership
  const contactResult = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);

  if (contactResult.length === 0) {
    throw new Error('Contact not found');
  }

  // Verify public agent exists
  const agentResult = await db
    .select()
    .from(publicAgents)
    .where(eq(publicAgents.agentId, input.publicAgentId))
    .limit(1);

  if (agentResult.length === 0) {
    throw new Error('Public agent not found');
  }

  const agent = agentResult[0];

  // Check if already associated
  const existingAssociation = await db
    .select()
    .from(contactAgents)
    .where(
      and(
        eq(contactAgents.contactId, contactId),
        eq(contactAgents.publicAgentId, input.publicAgentId)
      )
    )
    .limit(1);

  if (existingAssociation.length > 0) {
    // Return existing association
    return {
      id: existingAssociation[0].id,
      contactId: existingAssociation[0].contactId,
      publicAgentId: existingAssociation[0].publicAgentId,
      agentName: existingAssociation[0].agentName,
      agentEmoji: existingAssociation[0].agentEmoji,
      role: existingAssociation[0].role,
      discoveredVia: existingAssociation[0].discoveredVia,
      addedAt: existingAssociation[0].addedAt,
    };
  }

  // Create new association
  const id = ulid();
  const now = new Date();

  await db.insert(contactAgents).values({
    id,
    contactId,
    publicAgentId: input.publicAgentId,
    agentName: agent.name,
    agentEmoji: agent.emoji,
    role: input.role,
    discoveredVia: input.discoveredVia,
    addedAt: now,
  });

  console.log(`[Contacts] Associated agent "${agent.name}" with contact ${contactId}`);

  return {
    id,
    contactId,
    publicAgentId: input.publicAgentId,
    agentName: agent.name,
    agentEmoji: agent.emoji,
    role: input.role || null,
    discoveredVia: input.discoveredVia || null,
    addedAt: now,
  };
}

/**
 * Removes an agent association from a contact
 */
export async function removeAgentFromContact(
  userId: string,
  contactId: string,
  publicAgentId: string
): Promise<boolean> {
  const db = getDatabase();

  // Verify contact ownership
  const contactResult = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);

  if (contactResult.length === 0) {
    return false;
  }

  const result = await db
    .delete(contactAgents)
    .where(
      and(
        eq(contactAgents.contactId, contactId),
        eq(contactAgents.publicAgentId, publicAgentId)
      )
    );

  console.log(`[Contacts] Removed agent ${publicAgentId} from contact ${contactId}`);

  return true;
}

/**
 * Lists all agents associated with a contact
 */
export async function listContactAgents(
  userId: string,
  contactId: string
): Promise<ContactAgent[]> {
  const db = getDatabase();

  // Verify contact ownership
  const contactResult = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);

  if (contactResult.length === 0) {
    throw new Error('Contact not found');
  }

  return getContactAgents(contactId);
}

// -----------------------------------------------------------------------------
// Contact Update Helpers
// -----------------------------------------------------------------------------

/**
 * Appends new information to a contact's notes
 * Used when learning facts from orchestrated conversations
 */
export async function appendToContactNotes(
  userId: string,
  contactId: string,
  newInfo: string,
  source?: string
): Promise<ContactWithAgents | null> {
  const db = getDatabase();
  const now = new Date();

  // Get existing contact
  const existing = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return null;
  }

  const contact = existing[0];
  const timestamp = now.toISOString().split('T')[0];
  const sourceNote = source ? ` (via ${source})` : '';
  const newNote = `[${timestamp}]${sourceNote} ${newInfo}`;

  // Append to existing notes
  const updatedNotes = contact.notes
    ? `${contact.notes}\n${newNote}`
    : newNote;

  await db
    .update(contacts)
    .set({ notes: updatedNotes, updatedAt: now })
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));

  console.log(`[Contacts] Appended note to contact ${contactId}: ${newInfo.substring(0, 50)}...`);

  return getContact(userId, contactId);
}

/**
 * Finds a contact that has a specific public agent associated
 * Used to link orchestrated conversations to contact records
 */
export async function findContactByAgentId(
  userId: string,
  publicAgentId: string
): Promise<ContactWithAgents | null> {
  const db = getDatabase();

  // Find the contact_agents entry for this agent
  const agentResult = await db
    .select()
    .from(contactAgents)
    .where(eq(contactAgents.publicAgentId, publicAgentId))
    .limit(1);

  if (agentResult.length === 0) {
    return null;
  }

  // Get the contact
  return getContact(userId, agentResult[0].contactId);
}

// -----------------------------------------------------------------------------
// Intelligent Contact Updates (from conversations)
// -----------------------------------------------------------------------------

/**
 * Extracts structured data from task completion and updates contact accordingly
 * Used when tasks are completed that might reveal contact information (birthday, etc.)
 */
export async function updateContactFromTaskCompletion(
  userId: string,
  contactId: string,
  taskDescription: string,
  completionSummary: string,
  source?: string
): Promise<ContactWithAgents | null> {
  const db = getDatabase();
  const now = new Date();

  // Get existing contact
  const existing = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return null;
  }

  const contact = existing[0];
  const updateData: Record<string, unknown> = { updatedAt: now };

  // Extract structured data from the summary
  const extractedData = extractStructuredData(taskDescription, completionSummary);

  // Update birthday if found and not already set
  if (extractedData.birthday && !contact.birthday) {
    updateData.birthday = extractedData.birthday;
    console.log(`[Contacts] Extracted birthday for ${contact.name}: ${extractedData.birthday}`);
  }

  // Update email if found and not already set
  if (extractedData.email && !contact.email) {
    updateData.email = extractedData.email;
    console.log(`[Contacts] Extracted email for ${contact.name}: ${extractedData.email}`);
  }

  // Update phone if found and not already set
  if (extractedData.phone && !contact.phone) {
    updateData.phone = extractedData.phone;
    console.log(`[Contacts] Extracted phone for ${contact.name}: ${extractedData.phone}`);
  }

  // Always append to notes for record keeping
  const timestamp = now.toISOString().split('T')[0];
  const sourceNote = source ? ` (via ${source})` : '';
  const newNote = `[${timestamp}]${sourceNote} Task completed: ${completionSummary}`;
  const updatedNotes = contact.notes
    ? `${contact.notes}\n${newNote}`
    : newNote;
  updateData.notes = updatedNotes;

  await db
    .update(contacts)
    .set(updateData)
    .where(and(eq(contacts.id, contactId), eq(contacts.userId, userId)));

  const fieldsUpdated = Object.keys(updateData).filter(k => k !== 'updatedAt' && k !== 'notes');
  console.log(`[Contacts] Updated contact ${contactId} with ${fieldsUpdated.length > 0 ? fieldsUpdated.join(', ') : 'notes only'}`);

  return getContact(userId, contactId);
}

/**
 * Extracts structured data from task description and completion summary
 */
function extractStructuredData(
  taskDescription: string,
  completionSummary: string
): { birthday?: string; email?: string; phone?: string } {
  const text = `${taskDescription} ${completionSummary}`;
  const result: { birthday?: string; email?: string; phone?: string } = {};

  // Extract birthday - look for common date patterns
  // Matches: "March 15", "March 15th", "03/15", "3/15", "15th of March", "03-15", "1990-03-15"
  const birthdayPatterns = [
    // Month Day format: "March 15" or "March 15th"
    /birthday\s+(?:is\s+)?(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i,
    // "born on March 15" or "born March 15th"
    /born\s+(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i,
    // Day of Month: "15th of March"
    /(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)/i,
    // ISO format: "1990-03-15" or "03-15"
    /birthday[^.]*?(\d{4})?-?(\d{2})-(\d{2})/i,
    // US format: "03/15" or "3/15" or "03/15/1990"
    /birthday[^.]*?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/i,
  ];

  const monthMap: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12'
  };

  for (const pattern of birthdayPatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        if (pattern.source.includes('january|february')) {
          // Month name pattern
          const monthName = (match[1] || match[2]).toLowerCase();
          const day = String(parseInt(match[2] || match[1], 10)).padStart(2, '0');
          const month = monthMap[monthName];
          if (month && day) {
            result.birthday = `${month}-${day}`;
            break;
          }
        } else if (pattern.source.includes('\\d{4})?-?')) {
          // ISO format
          const year = match[1];
          const month = match[2];
          const day = match[3];
          result.birthday = year ? `${year}-${month}-${day}` : `${month}-${day}`;
          break;
        } else if (pattern.source.includes('\\/')) {
          // US format MM/DD
          const month = String(parseInt(match[1], 10)).padStart(2, '0');
          const day = String(parseInt(match[2], 10)).padStart(2, '0');
          const year = match[3];
          result.birthday = year ? `${year}-${month}-${day}` : `${month}-${day}`;
          break;
        }
      } catch {
        // Continue to next pattern
      }
    }
  }

  // Extract email
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
  if (emailMatch) {
    result.email = emailMatch[0];
  }

  // Extract phone number
  const phonePatterns = [
    /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
    /\d{3}[-.\s]\d{3}[-.\s]\d{4}/,
  ];
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.phone = match[0];
      break;
    }
  }

  return result;
}

// -----------------------------------------------------------------------------
// Advanced Queries (for task routing)
// -----------------------------------------------------------------------------

/**
 * Finds contacts and their agents by fuzzy name match
 * Used for autonomous task routing (e.g., "When is Jane's birthday?")
 */
export async function findAgentsForPerson(
  userId: string,
  personName: string
): Promise<Array<ContactWithAgents & { matchScore: number }>> {
  const db = getDatabase();

  // First, find matching contacts
  const matchingContacts = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        or(
          ilike(contacts.name, `%${personName}%`),
          sql`${contacts.aliases}::text ILIKE ${'%' + personName + '%'}`
        )
      )
    )
    .limit(5);

  // Calculate match scores and load agents
  const results = await Promise.all(
    matchingContacts.map(async (contact) => {
      const agents = await getContactAgents(contact.id);

      // Calculate match score based on how well the name matches
      let matchScore = 0;
      const lowerName = contact.name.toLowerCase();
      const lowerQuery = personName.toLowerCase();

      if (lowerName === lowerQuery) {
        matchScore = 100; // Exact match
      } else if (lowerName.startsWith(lowerQuery)) {
        matchScore = 80; // Prefix match
      } else if (lowerName.includes(lowerQuery)) {
        matchScore = 60; // Contains match
      }

      // Check aliases for better matches
      const aliases = (contact.aliases as string[]) || [];
      for (const alias of aliases) {
        const lowerAlias = alias.toLowerCase();
        if (lowerAlias === lowerQuery && matchScore < 100) {
          matchScore = 100;
        } else if (lowerAlias.startsWith(lowerQuery) && matchScore < 80) {
          matchScore = 80;
        } else if (lowerAlias.includes(lowerQuery) && matchScore < 60) {
          matchScore = 60;
        }
      }

      return {
        id: contact.id,
        userId: contact.userId,
        name: contact.name,
        aliases: aliases,
        relationship: contact.relationship,
        relationshipStarted: contact.relationshipStarted,
        birthday: contact.birthday,
        email: contact.email,
        phone: contact.phone,
        notes: contact.notes,
        tags: (contact.tags as string[]) || [],
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
        agents,
        matchScore,
      };
    })
  );

  // Sort by match score descending
  return results.sort((a, b) => b.matchScore - a.matchScore);
}
