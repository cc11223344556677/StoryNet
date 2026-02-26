import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient, DocumentDto, FtMEntity, ProjectDto } from "../types/domain";

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
    properties: {},
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

describe("project graph global inspect", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockApiClient.getProject.mockResolvedValue(makeProject());
    mockApiClient.searchEntities.mockResolvedValue(
      makeEntitySearchResponse([makeEntity()])
    );
    mockApiClient.getEntity.mockResolvedValue(makeEntity());
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
  });

  it("inspects a global search entity using page_size=100 (no page-size 400 path)", async () => {
    mockApiClient.getEntityRelationships.mockImplementation(async (_id, _depth, page, pageSize) => {
      if ((pageSize ?? 50) > 100) {
        throw new Error("Request failed with status 400.");
      }

      return makeEntitySearchResponse([], 0, page ?? 1);
    });

    renderPage();
    await runGlobalInspectSearch("Marko");

    expect(await screen.findByTestId("graph-renderer")).toHaveTextContent("nodes:1; edges:0");
    expect(screen.getByText("Focused Inspect View")).toBeInTheDocument();
    expect(screen.queryByText(/Could not load live relationships for this entity/i)).not.toBeInTheDocument();
    expect(mockApiClient.getEntityRelationships).toHaveBeenCalledWith(
      "afa5a9d77ad726ee2c99d9e691db42b74300e805",
      1,
      1,
      100
    );
  });

  it("does not auto-select relationships on node inspect", async () => {
    const centerId = "afa5a9d77ad726ee2c99d9e691db42b74300e805";
    mockApiClient.getEntityRelationships.mockResolvedValue(
      makeEntitySearchResponse(
        [
          makeEntity({
            id: "rel-1",
            schema: "Ownership",
            caption: "Ownership link",
            properties: { owner: [centerId], asset: ["other-entity"] }
          })
        ],
        1,
        1
      )
    );
    mockApiClient.getRelationship.mockRejectedValue(new Error("Request failed with status 500."));
    mockApiClient.getRelationshipDocuments.mockRejectedValue(new Error("Request failed with status 500."));

    renderPage();
    await runGlobalInspectSearch("Marko");

    expect(await screen.findByTestId("graph-renderer")).toHaveTextContent("nodes:1; edges:0");
    expect(mockApiClient.getRelationship).not.toHaveBeenCalled();
    expect(mockApiClient.getRelationshipDocuments).not.toHaveBeenCalled();
    expect(screen.queryByText(/Relationship metadata is temporarily unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Relationship source documents are temporarily unavailable/i)).not.toBeInTheDocument();
  });

  it("shows partial neighborhood info when a later relationships page fails", async () => {
    const centerId = "afa5a9d77ad726ee2c99d9e691db42b74300e805";
    mockApiClient.getEntityRelationships
      .mockResolvedValueOnce(
        makeEntitySearchResponse(
          [
            makeEntity({
              id: "rel-1",
              schema: "Ownership",
              caption: "Ownership link",
              properties: { owner: [centerId] }
            })
          ],
          150,
          1
        )
      )
      .mockRejectedValueOnce(new Error("Request failed with status 500."));

    renderPage();
    await runGlobalInspectSearch("Marko");

    expect(await screen.findByTestId("graph-renderer")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Some relationships could not be loaded from backend. Showing partial neighborhood."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Could not load live relationships for this entity/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mockApiClient.getEntityRelationships).toHaveBeenNthCalledWith(
        2,
        centerId,
        1,
        2,
        100
      );
    });
  });
});
