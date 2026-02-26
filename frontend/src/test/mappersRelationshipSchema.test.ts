import { describe, expect, it } from "vitest";
import { isLikelyRelationshipSchema } from "../api/mappers";

describe("relationship schema classification", () => {
  it("recognizes known FtM connection schemas", () => {
    expect(isLikelyRelationshipSchema("Employment")).toBe(true);
    expect(isLikelyRelationshipSchema("ProjectParticipant")).toBe(true);
    expect(isLikelyRelationshipSchema("Ownership")).toBe(true);
    expect(isLikelyRelationshipSchema("UnknownLink")).toBe(true);
  });

  it("supports simple formatting variants", () => {
    expect(isLikelyRelationshipSchema("project_participant")).toBe(true);
    expect(isLikelyRelationshipSchema("project-participant")).toBe(true);
    expect(isLikelyRelationshipSchema("directorship")).toBe(true);
  });

  it("does not mark normal node schemas as relationships", () => {
    expect(isLikelyRelationshipSchema("Person")).toBe(false);
    expect(isLikelyRelationshipSchema("Organization")).toBe(false);
    expect(isLikelyRelationshipSchema("Sanction")).toBe(false);
  });
});
