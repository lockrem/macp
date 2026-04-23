export type FormFieldType = 'text' | 'multiline' | 'date' | 'email' | 'phone' | 'select';
export type FormSubmissionStatus = 'in_progress' | 'completed';
export type FormResponseSource = 'agent' | 'user';
export interface FormField {
    id: string;
    formId: string;
    label: string;
    fieldType: FormFieldType;
    required: boolean;
    placeholder?: string | null;
    options?: string[] | null;
    displayOrder: number;
    createdAt: Date;
}
export interface Form {
    id: string;
    userId: string;
    title: string;
    description?: string | null;
    isPublic: boolean;
    viewCount: number;
    submissionCount: number;
    createdAt: Date;
    updatedAt: Date;
    fields?: FormField[];
}
export interface FormSubmission {
    id: string;
    formId: string;
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
export interface CreateFormInput {
    title: string;
    description?: string;
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
export declare function createForm(userId: string, input: CreateFormInput): Promise<Form>;
export declare function getForm(formId: string): Promise<Form | null>;
export declare function getFormPublic(formId: string): Promise<Form | null>;
export declare function listUserForms(userId: string): Promise<Form[]>;
export declare function updateForm(userId: string, formId: string, input: Partial<CreateFormInput> & {
    isPublic?: boolean;
}): Promise<Form>;
export declare function deleteForm(userId: string, formId: string): Promise<void>;
export declare function addField(userId: string, formId: string, input: CreateFieldInput): Promise<FormField>;
export declare function updateField(userId: string, formId: string, fieldId: string, input: UpdateFieldInput): Promise<FormField>;
export declare function deleteField(userId: string, formId: string, fieldId: string): Promise<void>;
export declare function reorderFields(userId: string, formId: string, fieldIds: string[]): Promise<FormField[]>;
export declare function submitForm(formId: string, respondentUserId: string | null, input: SubmitFormInput): Promise<FormSubmission>;
export declare function getSubmission(userId: string, formId: string, submissionId: string): Promise<FormSubmission | null>;
export declare function listSubmissions(userId: string, formId: string): Promise<FormSubmission[]>;
export declare function getAutoFillSuggestions(respondentUserId: string, formId: string, apiKey: string): Promise<Record<string, {
    value: string;
    confidence: string;
}>>;
export declare function lookupPublicResource(id: string): Promise<{
    type: 'agent' | 'form';
    id: string;
} | null>;
export declare function getFormUrl(formId: string): string;
//# sourceMappingURL=form-service.d.ts.map