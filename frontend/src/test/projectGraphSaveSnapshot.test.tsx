import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient, DocumentDto, FtMEntity, ProjectDto, UpdateProjectRequest } from "../types/domain";

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
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
  } satisfies ApiClient
}));

vi.mock("../api/factory", () => ({
  apiClient: mockApiClient
}));

vi.mock("../features/graph/renderers/GraphRendererHost", () => ({
  GraphRendererHost: ({
    graph,
    selectedNodeId
  }: {
    graph: { nodes: Array<{ id: string }>; edges: Array<{ id: string }> } | null;
    selectedNodeId: string | null;
  }) => (
    <div data-testid="graph-renderer">
      nodes:{graph?.nodes.length ?? 0}; edges:{graph?.edges.length ?? 0}; selected:{selectedNodeId ?? "none"}
    </div>
  )
}));

import { ProjectGraphPage } from "../features/graph/ProjectGraphPage";

function makeProject(overrides: Partial<ProjectDto> = {}): ProjectDto {
  return {
    id: "project-1",
    name: "Project One",
    description: "desc",
    owner_id: "user-1",
    snapshot: {
      entities: [],
      viewport: {}
    },
    created_at: "2026-02-26 00:00:00",
    updated_at: "2026-02-26 00:00:00",
    ...overrides
  };
}

function makeEntity(overrides: Partial<FtMEntity> = {}): FtMEntity {
  return {
    id: "afa5a9d77ad726ee2c99d9e691db42b74300e805",
    schema: "Person",
    caption: "Marko Petrovic",
    properties: {
      name: ["Marko Petrovic"]
    },
    ...overrides
  };
}

function makeDocumentList(): { total: number; page: number; page_size: number; results: DocumentDto[] } {
  return {
    total: 0,
    page: 1,
    page_size: 50,
    results: []
  };
}

function makeEntitySearchResponse(results: FtMEntity[], total = results.length, page = 1): {
  total: number;
  page: number;
  page_size: number;
  results: FtMEntity[];
} {
  return {
    total,
    page,
    page_size: 100,
    results
  };
}

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  render(
    <MemoryRouter initialEntries={["/projects/project-1/graph"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/projects/:projectId/graph" element={<ProjectGraphPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

async function runGlobalInspectSearch(term: string): Promise<void> {
  fireEvent.change(await screen.findByLabelText("Search all visible backend entities"), {
    target: { value: term }
  });
  fireEvent.click(screen.getByRole("button", { name: "Search Global" }));
  fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));
}

describe("project graph save snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const liveEntity = makeEntity({
      first_seen: "2026-02-26T10:00:00Z",
      last_changed: "2026-02-26T11:00:00Z"
    });

    mockApiClient.getProject.mockResolvedValue(makeProject());
    mockApiClient.searchEntities.mockResolvedValue(makeEntitySearchResponse([liveEntity]));
    mockApiClient.getEntity.mockResolvedValue(liveEntity);
    mockApiClient.getEntityRelationships.mockResolvedValue(makeEntitySearchResponse([], 0, 1));
    mockApiClient.getEntityDocuments.mockResolvedValue(makeDocumentList());
    mockApiClient.getRelationship.mockResolvedValue(
      makeEntity({
        id: "rel-1",
        schema: "Ownership",
        caption: "Ownership link",
        properties: { owner: ["afa5a9d77ad726ee2c99d9e691db42b74300e805"] }
      })
    );
    mockApiClient.getRelationshipDocuments.mockResolvedValue(makeDocumentList());
    mockApiClient.updateProject.mockImplementation(
      async (id: string, input: UpdateProjectRequest): Promise<ProjectDto> =>
        makeProject({
          id,
          snapshot: {
            entities: input.snapshot?.entities ?? []
          }
        })
    );
  });

  it("sends write-safe snapshot payload and keeps dirty-state entity-only", async () => {
    renderPage();
    await runGlobalInspectSearch("Marko");

    expect(await screen.findByTestId("graph-renderer")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Save Snapshot *" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Snapshot *" }));

    await waitFor(() => {
      expect(mockApiClient.updateProject).toHaveBeenCalledTimes(1);
    });

    const payload = vi.mocked(mockApiClient.updateProject).mock.calls[0][1];
    expect(payload.snapshot).toBeDefined();
    expect(payload.snapshot).not.toHaveProperty("viewport");
    expect(payload.snapshot?.entities).toHaveLength(1);
    expect(payload.snapshot?.entities[0]).not.toHaveProperty("first_seen");
    expect(payload.snapshot?.entities[0]).not.toHaveProperty("last_changed");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save Snapshot" })).toBeInTheDocument();
    });

    await runGlobalInspectSearch("Marko");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save Snapshot" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Save Snapshot *" })).not.toBeInTheDocument();
  });
});
