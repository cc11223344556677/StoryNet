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
    selectedNodeId,
    onNodeClick
  }: {
    graph: { nodes: Array<{ id: string }>; edges: Array<{ id: string }> } | null;
    selectedNodeId: string | null;
    onNodeClick: (nodeId: string, nodeLabel: string) => void;
  }) => (
    <div>
      <div data-testid="graph-renderer">
        nodes:{graph?.nodes.length ?? 0}; edges:{graph?.edges.length ?? 0}; selected:{selectedNodeId ?? "none"}
      </div>
      <button
        type="button"
        onClick={() => {
          const node = graph?.nodes[graph.nodes.length - 1];
          if (node) {
            onNodeClick(node.id, node.id);
          }
        }}
      >
        select-last-node
      </button>
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

function makeProject(): ProjectDto {
  return {
    id: "project-1",
    name: "Project One",
    description: "desc",
    owner_id: "user-1",
    snapshot: {
      entities: [
        makeEntity({ id: "person-1", caption: "Person One" }),
        makeEntity({ id: "person-2", caption: "Person Two" }),
        makeEntity({ id: "person-3", caption: "Person Three" }),
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

describe("project graph focused inspect mode", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockApiClient.getProject.mockResolvedValue(makeProject());
    mockApiClient.searchEntities.mockResolvedValue(
      makeEntitySearchResponse([makeEntity({ id: "person-1", caption: "Person One" })])
    );
    mockApiClient.getEntity.mockImplementation(async (id: string) =>
      makeEntity({ id, caption: id === "person-1" ? "Person One" : id === "person-2" ? "Person Two" : "Person Three" })
    );
    mockApiClient.getEntityRelationships.mockImplementation(async (id: string) => {
      if (id === "person-1") {
        return makeEntitySearchResponse([
          makeEntity({
            id: "rel-1",
            schema: "Ownership",
            caption: "Ownership",
            properties: {
              owner: ["person-1"],
              asset: ["person-2"]
            }
          })
        ]);
      }

      return makeEntitySearchResponse([]);
    });
    mockApiClient.getEntityDocuments.mockResolvedValue(makeDocumentList());
    mockApiClient.getRelationship.mockResolvedValue(
      makeEntity({
        id: "rel-1",
        schema: "Ownership",
        caption: "Ownership",
        properties: {}
      })
    );
    mockApiClient.getRelationshipDocuments.mockResolvedValue(makeDocumentList());
  });

  it("enters focused inspect mode and returns to full snapshot with manual toggle", async () => {
    renderPage();

    expect(await screen.findByTestId("graph-renderer")).toHaveTextContent("nodes:3; edges:1; selected:none");
    expect(screen.getByText("Full Snapshot View")).toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText("Search all visible backend entities"), {
      target: { value: "Person One" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Search Global" }));
    fireEvent.click(await screen.findByRole("button", { name: "Inspect" }));

    await waitFor(() => {
      expect(screen.getByTestId("graph-renderer")).toHaveTextContent("nodes:2; edges:1; selected:person-1");
    });
    expect(screen.getByText("Focused Inspect View")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to Full Snapshot" }));

    await waitFor(() => {
      expect(screen.getByTestId("graph-renderer")).toHaveTextContent("nodes:3; edges:1; selected:person-1");
    });
    expect(screen.getByText("Full Snapshot View")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "select-last-node" }));
    await waitFor(() => {
      expect(screen.getByTestId("graph-renderer")).toHaveTextContent("nodes:1; edges:0; selected:person-3");
    });
    expect(screen.getByText("Focused Inspect View")).toBeInTheDocument();
    expect(await screen.findByText("No direct neighbors found; showing selected entity only.")).toBeInTheDocument();
  });
});
