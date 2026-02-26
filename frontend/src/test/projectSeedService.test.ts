import { describe, expect, it, vi } from "vitest";
import type { ApiClient, FtMEntity } from "../types/domain";
import {
  addDocumentEntitiesToProject,
  createProjectFromDocument,
  fetchDocumentEntitiesStrict,
  mergeEntitiesById,
  ProjectSeedError
} from "../features/projects/projectSeedService";

function makeEntity(id: string, schema = "Person"): FtMEntity {
  return {
    id,
    schema,
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

describe("projectSeedService", () => {
  it("fetches all document entities with pagination and de-duplicates by id", async () => {
    const api = makeApiClientMock();
    vi.mocked(api.getDocument).mockResolvedValue({
      id: "doc-1",
      filename: "alpha.txt",
      type: "text",
      status: "completed",
      public: false,
      owner_ids: ["user-1"],
      entity_count: 3
    });
    vi.mocked(api.getDocumentEntities)
      .mockResolvedValueOnce({
        total: 3,
        page: 1,
        page_size: 2,
        results: [makeEntity("e1"), makeEntity("e2")]
      })
      .mockResolvedValueOnce({
        total: 3,
        page: 2,
        page_size: 2,
        results: [makeEntity("e2"), makeEntity("e3")]
      });

    const result = await fetchDocumentEntitiesStrict(api, "doc-1", 2);

    expect(result.documentName).toBe("alpha.txt");
    expect(result.entities.map((entity) => entity.id).sort()).toEqual(["e1", "e2", "e3"]);
    expect(api.getDocumentEntities).toHaveBeenCalledTimes(2);
  });

  it("throws strict error when document is not completed", async () => {
    const api = makeApiClientMock();
    vi.mocked(api.getDocument).mockResolvedValue({
      id: "doc-1",
      filename: "alpha.txt",
      type: "text",
      status: "queued",
      public: false,
      owner_ids: ["user-1"],
      entity_count: 2
    });

    await expect(fetchDocumentEntitiesStrict(api, "doc-1")).rejects.toMatchObject({
      name: "ProjectSeedError",
      code: "DOCUMENT_NOT_COMPLETED"
    } satisfies Partial<ProjectSeedError>);
  });

  it("throws strict error when metadata reports entities but endpoint returns none", async () => {
    const api = makeApiClientMock();
    vi.mocked(api.getDocument).mockResolvedValue({
      id: "doc-1",
      filename: "alpha.txt",
      type: "text",
      status: "completed",
      public: false,
      owner_ids: ["user-1"],
      entity_count: 7
    });
    vi.mocked(api.getDocumentEntities).mockResolvedValue({
      total: 0,
      page: 1,
      page_size: 100,
      results: []
    });

    await expect(fetchDocumentEntitiesStrict(api, "doc-1")).rejects.toMatchObject({
      name: "ProjectSeedError",
      code: "DOCUMENT_ENTITIES_EMPTY"
    } satisfies Partial<ProjectSeedError>);
  });

  it("creates project snapshot from strict document entities", async () => {
    const api = makeApiClientMock();
    vi.mocked(api.getDocument).mockResolvedValue({
      id: "doc-1",
      filename: "alpha.txt",
      type: "text",
      status: "completed",
      public: false,
      owner_ids: ["user-1"],
      entity_count: 2
    });
    vi.mocked(api.getDocumentEntities).mockResolvedValue({
      total: 2,
      page: 1,
      page_size: 100,
      results: [makeEntity("e1"), makeEntity("e2")]
    });
    vi.mocked(api.createProject).mockResolvedValue({
      id: "project-1",
      name: "Alpha",
      description: null,
      owner_id: "user-1",
      snapshot: { entities: [makeEntity("e1"), makeEntity("e2")], viewport: {} },
      created_at: "2026-02-26 00:00:00",
      updated_at: "2026-02-26 00:00:00"
    });

    const created = await createProjectFromDocument(api, {
      documentId: "doc-1",
      name: "Alpha",
      description: "  "
    });

    expect(created.id).toBe("project-1");
    expect(api.createProject).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.createProject).mock.calls[0][0].snapshot.entities).toHaveLength(2);
  });

  it("adds document entities into existing project snapshot with dedupe", async () => {
    const api = makeApiClientMock();
    vi.mocked(api.getDocument).mockResolvedValue({
      id: "doc-1",
      filename: "alpha.txt",
      type: "text",
      status: "completed",
      public: false,
      owner_ids: ["user-1"],
      entity_count: 2
    });
    vi.mocked(api.getDocumentEntities).mockResolvedValue({
      total: 2,
      page: 1,
      page_size: 100,
      results: [makeEntity("e1"), makeEntity("e2")]
    });
    vi.mocked(api.getProject).mockResolvedValue({
      id: "project-1",
      name: "Project One",
      description: "desc",
      owner_id: "user-1",
      snapshot: {
        entities: [makeEntity("e0"), makeEntity("e2")],
        viewport: {}
      },
      created_at: "2026-02-26 00:00:00",
      updated_at: "2026-02-26 00:00:00"
    });
    vi.mocked(api.updateProject).mockResolvedValue({
      id: "project-1",
      name: "Project One",
      description: "desc",
      owner_id: "user-1",
      snapshot: {
        entities: [makeEntity("e0"), makeEntity("e1"), makeEntity("e2")],
        viewport: {}
      },
      created_at: "2026-02-26 00:00:00",
      updated_at: "2026-02-26 00:00:00"
    });

    const updated = await addDocumentEntitiesToProject(api, {
      documentId: "doc-1",
      projectId: "project-1"
    });

    expect(updated.id).toBe("project-1");
    const updatePayload = vi.mocked(api.updateProject).mock.calls[0][1];
    expect(updatePayload.snapshot?.entities.map((entity) => entity.id).sort()).toEqual(["e0", "e1", "e2"]);
  });

  it("mergeEntitiesById keeps unique entities by id", () => {
    const merged = mergeEntitiesById([makeEntity("a"), makeEntity("b")], [makeEntity("b"), makeEntity("c")]);
    expect(merged.map((entity) => entity.id).sort()).toEqual(["a", "b", "c"]);
  });
});
