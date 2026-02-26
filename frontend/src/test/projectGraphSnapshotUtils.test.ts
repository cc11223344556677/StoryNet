import { describe, expect, it } from "vitest";
import type { FtMEntity, ProjectSnapshot } from "../types/domain";
import { mergeSnapshot, removeEntityFromSnapshot } from "../features/graph/snapshotUtils";

function makeEntity(id: string, schema = "Person", refs: string[] = []): FtMEntity {
  const properties: Record<string, string[]> = {};
  if (refs.length > 0) {
    properties.party = refs;
  }

  return {
    id,
    schema,
    properties
  };
}

function makeSnapshot(entities: FtMEntity[]): ProjectSnapshot {
  return {
    entities,
    viewport: {}
  };
}

describe("project graph snapshot utilities", () => {
  it("mergeSnapshot adds deduped entities and marks changed", () => {
    const base = makeSnapshot([makeEntity("a"), makeEntity("b")]);
    const merged = mergeSnapshot(base, [makeEntity("b"), makeEntity("c"), makeEntity("d")], {
      renderer: "cytoscape"
    });

    expect(merged.changed).toBe(true);
    expect(merged.snapshot.entities.map((entity) => entity.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("removeEntityFromSnapshot removes dependent relationship entities", () => {
    const person = makeEntity("person-1", "Person");
    const neighbor = makeEntity("person-2", "Person");
    const relationship = makeEntity("rel-1", "Ownership", ["person-1", "person-2"]);
    const untouchedRelationship = makeEntity("rel-2", "Ownership", ["person-2"]);

    const base = makeSnapshot([person, neighbor, relationship, untouchedRelationship]);
    const removed = removeEntityFromSnapshot(base, "person-1");

    expect(removed.changed).toBe(true);
    expect(removed.removedRelationshipIds).toEqual(["rel-1"]);
    expect(removed.snapshot.entities.map((entity) => entity.id).sort()).toEqual(["person-2", "rel-2"]);
  });
});
