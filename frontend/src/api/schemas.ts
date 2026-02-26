import { z } from "zod";

export const isoDateSchema = z.string().datetime();

const responseDateTimeStringSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) {
      return "";
    }

    return String(value);
  },
  z.string()
);

const tolerantDateTimeStringSchema = responseDateTimeStringSchema;

export const errorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).nullable().optional()
});

export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive()
});

export const userProfileSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  display_name: z.string().min(1),
  created_at: responseDateTimeStringSchema.optional()
});

export const provenanceEntrySchema = z.object({
  document_id: z.string().min(1),
  page_number: z.number().int().nullable().optional()
});

const ftmEntityBaseSchema = z
  .object({
    id: z.string().min(1),
    schema: z.string().min(1),
    caption: z.string().optional(),
    properties: z.record(z.array(z.string())).default({}),
    confidence: z.number().nullable().optional(),
    public: z.boolean().optional(),
    owner_ids: z.array(z.string()).optional(),
    provenance: z.array(provenanceEntrySchema).optional(),
    first_seen: responseDateTimeStringSchema.optional(),
    last_changed: responseDateTimeStringSchema.optional()
  })
  .passthrough();

export const ftmEntitySchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") {
      return value;
    }

    const raw = value as Record<string, unknown>;
    const schemaCandidate =
      (typeof raw.schema === "string" && raw.schema.trim()) ||
      (typeof raw._schema === "string" && raw._schema.trim()) ||
      (typeof raw.type === "string" && raw.type.trim()) ||
      "Unknown";

    return {
      ...raw,
      schema: schemaCandidate
    };
  },
  ftmEntityBaseSchema
);

export const projectSnapshotSchema = z.object({
  entities: z.array(ftmEntitySchema),
  viewport: z.record(z.unknown()).optional().default({})
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional().default(null),
  owner_id: z.string().min(1),
  snapshot: projectSnapshotSchema,
  created_at: tolerantDateTimeStringSchema,
  updated_at: tolerantDateTimeStringSchema
});

export const projectListResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  results: z.array(projectSchema)
});

export const documentSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1),
  type: z.enum(["text", "pdf"]),
  status: z.enum(["queued", "ocr_processing", "ner_processing", "completed", "failed"]),
  public: z.boolean(),
  owner_ids: z.array(z.string()),
  entity_count: z.number().int().nonnegative().optional(),
  created_at: responseDateTimeStringSchema.optional(),
  error_message: z.string().nullable().optional()
});

export const documentListResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive().default(1),
  page_size: z.number().int().positive().default(20),
  results: z.array(documentSchema)
});

export const jobStatusSchema = z.object({
  job_id: z.string().min(1),
  document_id: z.string().optional(),
  status: z.enum(["queued", "ocr_processing", "ner_processing", "completed", "failed"]),
  progress: z.number().int().min(0).max(100).optional(),
  message: z.string().nullable().optional(),
  created_at: responseDateTimeStringSchema.optional(),
  updated_at: responseDateTimeStringSchema.optional()
});

export const jobListResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  results: z.array(jobStatusSchema)
});

export const entitySearchResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive().default(1),
  page_size: z.number().int().positive().default(20),
  results: z.array(ftmEntitySchema)
});

export const changePasswordRequestSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8)
});

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const registerRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  display_name: z.string().min(1)
});

export const createProjectRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  snapshot: projectSnapshotSchema
});

export const updateProjectRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  snapshot: projectSnapshotSchema.optional()
});

export const updateDocumentRequestSchema = z.object({
  public: z.boolean().optional()
});
