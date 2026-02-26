import { describe, expect, it, vi } from "vitest";
import type { ApiClient, FtMEntity } from "../types/domain";
import {
  addDocumentsToProject,
  createProjectFromDocuments,
  ProjectSeedBatchError
} from "../features/projects/projectSeedBatchService";

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

describe("projectSeedBatchService", () => {
  it("creates a project from multiple documents with dedupe", async () => {
    const api = makeApiClientMock();

    vi.mocked(api.getDocument).mockImplementation(async (documentId: string) => ({
      id: documentId,
      filename: `${documentId}.txt`,
      type: "text",
      status: "completed",
      public: false,
      owner_ids: ["user-1"],
      entity_count: 2
    }));

    vi.mocked(api.getDocumentEntities).mockImplementation(async (documentId: string) => {
      if (documentId === "doc-1") {
        return {
          total: 2,
          page: 1,
          page_size: 100,
          results: [makeEntity("e1"), makeEntity("e2")]
        };
      }

      return {
        total: 2,
        page: 1,
        page_size: 100,
        results: [makeEntity("e2"), makeEntity("e3")]
      };
    });

    vi.mocked(api.createProject).mockResolvedValue({
      id: "project-1",
      name: "Merged",
      description: null,
      owner_id: "user-1",
      snapshot: { entities: [makeEntity("e1"), makeEntity("e2"), makeEntity("e3")], viewport: {} },
      created_at: "2026-02-26 00:00:00",
      updated_at: "2026-02-26 00:00:00"
    });

    await createProjectFromDocuments(api, {
      documentIds: ["doc-1", "doc-2"],
      name: "Merged"
    });

    expect(api.createProject).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(api.createProject).mock.calls[0][0];
    expect(payload.snapshot.entities.map((entity) => entity.id).sort()).toEqual(["e1", "e2", "e3"]);
    expect(payload.snapshot).not.toHaveProperty("viewport");
  });

  it("enforces all-or-nothing semantics and aborts create on one failing document", async () => {
    const api = makeApiClientMock();

    vi.mocked(api.getDocument).mockImplementation(async (documentId: string) => ({
      id: documentId,
      filename: `${documentId}.txt`,
      type: "text",
      status: documentId === "doc-2" ? "queued" : "completed",
      public: false,
      owner_ids: ["user-1"],
      entity_count: 2
    }));

    vi.mocked(api.getDocumentEntities).mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 100,
      results: [makeEntity("e1")]
    });

    await expect(
      createProjectFromDocuments(api, {
        documentIds: ["doc-1", "doc-2"],
        name: "Merged"
      })
    ).rejects.toBeInstanceOf(ProjectSeedBatchError);

    expect(api.createProject).not.toHaveBeenCalled();
  });

  it("enforces all-or-nothing semantics and aborts update on one failing document", async () => {
    const api = makeApiClientMock();

    vi.mocked(api.getProject).mockResolvedValue({
      id: "project-1",
      name: "Project One",
      description: "desc",
      owner_id: "user-1",
      snapshot: { entities: [makeEntity("base")], viewport: {} },
      created_at: "2026-02-26 00:00:00",
      updated_at: "2026-02-26 00:00:00"
    });

    vi.mocked(api.getDocument).mockImplementation(async (documentId: string) => ({
      id: documentId,
      filename: `${documentId}.txt`,
      type: "text",
      status: "completed",
      public: false,
      owner_ids: ["user-1"],
      entity_count: 2
    }));

    vi.mocked(api.getDocumentEntities).mockImplementation(async (documentId: string) => {
      if (documentId === "doc-2") {
        return {
          total: 0,
          page: 1,
          page_size: 100,
          results: []
        };
      }

      return {
        total: 1,
        page: 1,
        page_size: 100,
        results: [makeEntity("incoming")]
      };
    });

    await expect(
      addDocumentsToProject(api, {
        documentIds: ["doc-1", "doc-2"],
        projectId: "project-1"
      })
    ).rejects.toBeInstanceOf(ProjectSeedBatchError);

    expect(api.updateProject).not.toHaveBeenCalled();
  });
});
