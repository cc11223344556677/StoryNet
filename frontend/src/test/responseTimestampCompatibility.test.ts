import { describe, expect, it } from "vitest";
import {
  documentSchema,
  ftmEntitySchema,
  jobStatusSchema,
  userProfileSchema
} from "../api/schemas";

const NON_ISO_TIMESTAMP = "2026-02-25 12:33:20";

describe("response timestamp compatibility parsing", () => {
  it("parses non-ISO datetime strings in job status created_at and updated_at", () => {
    const parsed = jobStatusSchema.parse({
      job_id: "job_1",
      document_id: "document_1",
      status: "queued",
      created_at: NON_ISO_TIMESTAMP,
      updated_at: NON_ISO_TIMESTAMP
    });

    expect(parsed.created_at).toBe(NON_ISO_TIMESTAMP);
    expect(parsed.updated_at).toBe(NON_ISO_TIMESTAMP);
  });

  it("parses document created_at with non-ISO datetime and normalizes null safely", () => {
    const parsedNonIso = documentSchema.parse({
      id: "document_1",
      filename: "sample.txt",
      type: "text",
      status: "completed",
      public: false,
      owner_ids: ["user_1"],
      created_at: NON_ISO_TIMESTAMP
    });

    const parsedNull = documentSchema.parse({
      id: "document_1",
      filename: "sample.txt",
      type: "text",
      status: "completed",
      public: false,
      owner_ids: ["user_1"],
      created_at: null
    });

    expect(parsedNonIso.created_at).toBe(NON_ISO_TIMESTAMP);
    expect(parsedNull.created_at).toBe("");
  });

  it("parses user profile created_at with non-ISO datetime and keeps missing optional value safe", () => {
    const parsedNonIso = userProfileSchema.parse({
      id: "user_1",
      email: "user@example.com",
      display_name: "User One",
      created_at: NON_ISO_TIMESTAMP
    });

    const parsedMissing = userProfileSchema.parse({
      id: "user_1",
      email: "user@example.com",
      display_name: "User One"
    });

    expect(parsedNonIso.created_at).toBe(NON_ISO_TIMESTAMP);
    expect(parsedMissing.created_at).toBeUndefined();
  });

  it("parses ftm entity first_seen and last_changed with non-ISO values and normalizes null safely", () => {
    const parsedNonIso = ftmEntitySchema.parse({
      id: "entity_1",
      schema: "Person",
      first_seen: NON_ISO_TIMESTAMP,
      last_changed: NON_ISO_TIMESTAMP
    });

    const parsedNull = ftmEntitySchema.parse({
      id: "entity_2",
      schema: "Person",
      first_seen: null,
      last_changed: null
    });

    expect(parsedNonIso.first_seen).toBe(NON_ISO_TIMESTAMP);
    expect(parsedNonIso.last_changed).toBe(NON_ISO_TIMESTAMP);
    expect(parsedNull.first_seen).toBe("");
    expect(parsedNull.last_changed).toBe("");
  });
});
