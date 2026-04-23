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
/**
 * Creates a new contact for a user
 */
export declare function createContact(userId: string, input: CreateContactInput): Promise<ContactWithAgents>;
/**
 * Gets a contact by ID with associated agents
 */
export declare function getContact(userId: string, contactId: string): Promise<ContactWithAgents | null>;
/**
 * Lists contacts for a user with optional filtering
 */
export declare function listContacts(userId: string, options?: ListContactsOptions): Promise<{
    contacts: ContactWithAgents[];
    total: number;
}>;
/**
 * Fuzzy search contacts by name or aliases
 */
export declare function searchContactsByName(userId: string, query: string, limit?: number): Promise<ContactWithAgents[]>;
/**
 * Updates a contact
 */
export declare function updateContact(userId: string, contactId: string, input: UpdateContactInput): Promise<ContactWithAgents | null>;
/**
 * Deletes a contact (cascades to contact_agents)
 */
export declare function deleteContact(userId: string, contactId: string): Promise<boolean>;
/**
 * Associates a public agent with a contact
 */
export declare function associateAgentWithContact(userId: string, contactId: string, input: AssociateAgentInput): Promise<ContactAgent | null>;
/**
 * Removes an agent association from a contact
 */
export declare function removeAgentFromContact(userId: string, contactId: string, publicAgentId: string): Promise<boolean>;
/**
 * Lists all agents associated with a contact
 */
export declare function listContactAgents(userId: string, contactId: string): Promise<ContactAgent[]>;
/**
 * Appends new information to a contact's notes
 * Used when learning facts from orchestrated conversations
 */
export declare function appendToContactNotes(userId: string, contactId: string, newInfo: string, source?: string): Promise<ContactWithAgents | null>;
/**
 * Finds a contact that has a specific public agent associated
 * Used to link orchestrated conversations to contact records
 */
export declare function findContactByAgentId(userId: string, publicAgentId: string): Promise<ContactWithAgents | null>;
/**
 * Extracts structured data from task completion and updates contact accordingly
 * Used when tasks are completed that might reveal contact information (birthday, etc.)
 */
export declare function updateContactFromTaskCompletion(userId: string, contactId: string, taskDescription: string, completionSummary: string, source?: string): Promise<ContactWithAgents | null>;
/**
 * Finds contacts and their agents by fuzzy name match
 * Used for autonomous task routing (e.g., "When is Jane's birthday?")
 */
export declare function findAgentsForPerson(userId: string, personName: string): Promise<Array<ContactWithAgents & {
    matchScore: number;
}>>;
//# sourceMappingURL=contacts-service.d.ts.map