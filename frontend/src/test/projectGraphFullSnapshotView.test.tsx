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

function makeEntity(overrides: Partial<FtMEntity> = {}): FtMEntity {
  return {
    id: "entity-default",
    schema: "Person",
    caption: "Default Person",
    properties: {},
    ...overrides
  };
}

function makeSnapshotProject(): ProjectDto {
  return {
    id: "project-1",
    name: "Project One",
    description: "desc",
    owner_id: "user-1",
    snapshot: {
      entities: [
        makeEntity({ id: "person-1", caption: "Person One" }),
        makeEntity({ id: "person-2", caption: "Person Two" }),
        makeEntity({
          id: "rel-1",
          schema: "Ownership",
          caption: "Ownership",
          properties: {
            owner: ["person-1"],
            asset: ["person-2"]
          }
        })
      ],
      viewport: {}
    },
    created_at: "2026-02-26 00:00:00",
    updated_at: "2026-02-26 00:00:00"
  };
}

function makeEmptyProject(): ProjectDto {
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
    updated_at: "2026-02-26 00:00:00"
  };
}

function makeEntitySearchResponse(results: FtMEntity[]): {
  total: number;
  page: number;
  page_size: number;
  results: FtMEntity[];
} {
  return {
    total: results.length,
    page: 1,
    page_size: 50,
    results
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

describe("project graph full snapshot view", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.getEntityDocuments.mockResolvedValue(makeDocumentList());
    mockApiClient.getRelationshipDocuments.mockResolvedValue(makeDocumentList());
    mockApiClient.getRelationship.mockResolvedValue(
      makeEntity({ id: "rel-1", schema: "Ownership", caption: "Ownership", properties: {} })
    );
  });

  it("renders full snapshot graph on initial load without selecting an entity", async () => {
    mockApiClient.getProject.mockResolvedValue(makeSnapshotProject());

    renderPage();

    expect(await screen.findByTestId("graph-renderer")).toHaveTextContent("nodes:2; edges:1; selected:none");
    expect(
      screen.queryByText("This project snapshot has no graph entities yet. Use global search or document seeding to add entities.")
    ).not.toBeInTheDocument();
  });

  it("keeps full graph visible while inspect updates selected entity details", async () => {
    const inspectedEntity = makeEntity({ id: "person-1", caption: "Person One" });

    mockApiClient.getProject.mockResolvedValue(makeSnapshotProject());
    mockApiClient.searchEntities.mockResolvedValue(makeEntitySearchResponse([inspectedEntity]));
    mockApiClient.getEntity.mockResolvedValue(inspectedEntity);
    mockApiClient.getEntityRelationships.mockResolvedValue(makeEntitySearchResponse([]));

    renderPage();

    expect(await screen.findByTestId("graph-renderer")).toHaveTextContent("nodes:2; edges:1; selected:none");

    fireEvent.change(await screen.findByLabelText("Search all visible backend entities"), {
      target: { value: "Person One" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Search Global" }));
    fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));

    await waitFor(() => {
      expect(screen.getByTestId("graph-renderer")).toHaveTextContent("selected:person-1");
    });
    expect(screen.getByTestId("graph-renderer")).toHaveTextContent("nodes:2; edges:1");
    expect(await screen.findByText(/Selected entity: Person One/)).toBeInTheDocument();
  });

  it("shows a clear empty state when snapshot has no graph entities", async () => {
    mockApiClient.getProject.mockResolvedValue(makeEmptyProject());

    renderPage();

    expect(
      await screen.findByText(
        "This project snapshot has no graph entities yet. Use global search or document seeding to add entities."
      )
    ).toBeInTheDocument();
    expect(screen.queryByTestId("graph-renderer")).not.toBeInTheDocument();
  });
});
