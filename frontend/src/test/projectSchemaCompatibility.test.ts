import { describe, expect, it } from "vitest";
import { projectSchema } from "../api/schemas";

function makeBaseProjectPayload(): Record<string, unknown> {
  return {
    id: "project_1",
    name: "Project One",
    description: "Test",
    owner_id: "user_1",
    snapshot: {
      entities: []
    },
    created_at: "2026-02-25 12:33:20",
    updated_at: "2026-02-25 12:35:10"
  };
}

describe("projectSchema compatibility parsing", () => {
  it("parses project response with missing snapshot.viewport", () => {
    const parsed = projectSchema.parse(makeBaseProjectPayload());

    expect(parsed.snapshot.viewport).toEqual({});
  });

  it("parses non-ISO datetime strings in created_at and updated_at", () => {
    const parsed = projectSchema.parse(makeBaseProjectPayload());

    expect(parsed.created_at).toBe("2026-02-25 12:33:20");
    expect(parsed.updated_at).toBe("2026-02-25 12:35:10");
  });

  it("normalizes missing or null project timestamps to safe empty strings", () => {
    const payload = makeBaseProjectPayload();
    payload.created_at = null;
    delete payload.updated_at;

    const parsed = projectSchema.parse(payload);

    expect(parsed.created_at).toBe("");
    expect(parsed.updated_at).toBe("");
  });

  it("keeps strict failure for missing required core fields", () => {
    const missingId = makeBaseProjectPayload();
    delete missingId.id;

    const missingSnapshotEntities = makeBaseProjectPayload();
    missingSnapshotEntities.snapshot = {};

    expect(() => projectSchema.parse(missingId)).toThrow();
    expect(() => projectSchema.parse(missingSnapshotEntities)).toThrow();
  });
});