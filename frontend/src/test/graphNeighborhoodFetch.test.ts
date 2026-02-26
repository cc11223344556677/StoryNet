import { describe, expect, it, vi } from "vitest";
import type { ApiClient, FtMEntity } from "../types/domain";
import {
  ENTITY_RELATIONSHIPS_PAGE_SIZE,
  fetchEntityRelationshipsPaginated
} from "../features/graph/neighborhoodFetch";

function makeEntity(id: string): FtMEntity {
  return {
    id,
    schema: "Ownership",
    properties: {}
  };
}

function makeApiClientMock(): ApiClient {
  return {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    me: vi.fn(),
    changePassword: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    uploadTextDocument: vi.fn(),
    uploadPdfDocument: vi.fn(),
    listMyDocuments: vi.fn(),
    getDocument: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
    getDocumentEntities: vi.fn(),
    listJobs: vi.fn(),
    getJob: vi.fn(),
    searchEntities: vi.fn(),
    getEntity: vi.fn(),
    getEntityDocuments: vi.fn(),
    getEntityRelationships: vi.fn(),
    getRelationship: vi.fn(),
    getRelationshipDocuments: vi.fn()
  };
}

describe("graph neighborhood fetch", () => {
  it("uses page_size=100 and merges multi-page relationship results", async () => {
    const api = makeApiClientMock();
    vi.mocked(api.getEntityRelationships)
      .mockResolvedValueOnce({
        total: 150,
        page: 1,
        page_size: ENTITY_RELATIONSHIPS_PAGE_SIZE,
        results: [makeEntity("r1"), makeEntity("r2")]
      })
      .mockResolvedValueOnce({
        total: 150,
        page: 2,
        page_size: ENTITY_RELATIONSHIPS_PAGE_SIZE,
        results: [makeEntity("r2"), makeEntity("r3")]
      });

    const result = await fetchEntityRelationshipsPaginated(api, "entity-1");

    expect(result.partialRelationshipsLoaded).toBe(false);
    expect(result.partialLoadMessage).toBeNull();
    expect(result.relationships.map((entity) => entity.id).sort()).toEqual(["r1", "r2", "r3"]);
    expect(api.getEntityRelationships).toHaveBeenNthCalledWith(
      1,
      "entity-1",
      1,
      1,
      ENTITY_RELATIONSHIPS_PAGE_SIZE
    );
    expect(api.getEntityRelationships).toHaveBeenNthCalledWith(
      2,
      "entity-1",
      1,
      2,
      ENTITY_RELATIONSHIPS_PAGE_SIZE
    );
  });

  it("throws when first relationships page fails", async () => {
    const api = makeApiClientMock();
    vi.mocked(api.getEntityRelationships).mockRejectedValue(new Error("Request failed with status 400."));

    await expect(fetchEntityRelationshipsPaginated(api, "entity-1")).rejects.toThrow(
      "Request failed with status 400."
    );
  });

  it("returns partial results and info message when later page fails", async () => {
    const api = makeApiClientMock();
    vi.mocked(api.getEntityRelationships)
      .mockResolvedValueOnce({
        total: 150,
        page: 1,
        page_size: ENTITY_RELATIONSHIPS_PAGE_SIZE,
        results: [makeEntity("r1"), makeEntity("r2")]
      })
      .mockRejectedValueOnce(new Error("Request failed with status 500."));

    const result = await fetchEntityRelationshipsPaginated(api, "entity-1");

    expect(result.relationships.map((entity) => entity.id).sort()).toEqual(["r1", "r2"]);
    expect(result.partialRelationshipsLoaded).toBe(true);
    expect(result.partialLoadMessage).toBe(
      "Some relationships could not be loaded from backend. Showing partial neighborhood."
    );
  });
});
