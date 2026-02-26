import { describe, expect, it } from "vitest";
import type { FtMEntity, ProjectSnapshot } from "../types/domain";
import {
  sanitizeProjectSnapshotForWrite,
  sanitizeWritableEntity
} from "../api/projectWritePayload";

function makeEntity(overrides: Partial<FtMEntity> = {}): FtMEntity {
  return {
    id: "entity-1",
    schema: "Person",
    properties: {
      name: ["Alice Example"]
    },
    ...overrides
  };
}

describe("project write payload serializer", () => {
  it("strips read-only fields and viewport while preserving writable metadata", () => {
    const snapshot: ProjectSnapshot = {
      entities: [
        makeEntity({
          caption: "Alice Example",
          confidence: 0.91,
          public: true,
          owner_ids: ["user-1"],
          provenance: [{ document_id: "doc-1", page_number: 1 }],
          first_seen: "2026-02-26T10:00:00Z",
          last_changed: "2026-02-26T11:00:00Z"
        })
      ],
      viewport: {
        renderer: "cytoscape"
      }
    };

    const sanitized = sanitizeProjectSnapshotForWrite(snapshot);

    expect(sanitized).toEqual({
      entities: [
        {
          id: "entity-1",
          schema: "Person",
          properties: {
            name: ["Alice Example"]
          },
          caption: "Alice Example",
          confidence: 0.91,
          public: true,
          owner_ids: ["user-1"],
          provenance: [{ document_id: "doc-1", page_number: 1 }]
        }
      ]
    });
  });

  it("dedupes by entity id and keeps last-write values", () => {
    const first = makeEntity({
      id: "entity-dup",
      properties: { name: ["Old Name"] }
    });
    const second = makeEntity({
      id: "entity-b",
      properties: { name: ["Second"] }
    });
    const third = makeEntity({
      id: "entity-dup",
      properties: { name: ["New Name"] }
    });

    const sanitized = sanitizeProjectSnapshotForWrite({
      entities: [first, second, third]
    });

    expect(sanitized.entities.map((entity) => entity.id)).toEqual(["entity-b", "entity-dup"]);
    expect(sanitized.entities[1].properties.name).toEqual(["New Name"]);
  });

  it("sanitizeWritableEntity keeps only supported writable fields", () => {
    const sanitized = sanitizeWritableEntity(
      makeEntity({
        caption: "Alice",
        confidence: null,
        owner_ids: ["user-1"],
        provenance: [{ document_id: "doc-1", page_number: null }],
        first_seen: "2026-02-26T10:00:00Z",
        last_changed: "2026-02-26T11:00:00Z"
      })
    );

    expect(sanitized).toEqual({
      id: "entity-1",
      schema: "Person",
      properties: {
        name: ["Alice Example"]
      },
      caption: "Alice",
      confidence: null,
      owner_ids: ["user-1"],
      provenance: [{ document_id: "doc-1", page_number: null }]
    });
  });
});
