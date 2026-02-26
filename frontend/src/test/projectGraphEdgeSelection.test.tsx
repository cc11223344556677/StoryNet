import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    onEdgeClick
  }: {
    graph: { nodes: Array<{ id: string }>; edges: Array<{ id: string }> } | null;
    onEdgeClick: (edgeId: string) => void;
  }) => (
    <div>
      <div data-testid="graph-renderer">
        nodes:{graph?.nodes.length ?? 0}; edges:{graph?.edges.length ?? 0}
      </div>
      {(graph?.edges ?? []).map((edge) => (
        <button key={edge.id} type="button" onClick={() => onEdgeClick(edge.id)}>
          edge-{edge.id}
        </button>
      ))}
    </div>
  )
}));

import { ProjectGraphPage } from "../features/graph/ProjectGraphPage";

function makeEntity(overrides: Partial<FtMEntity> = {}): FtMEntity {
  return {
    id: "entity-default",
    schema: "Person",
    caption: "Default",
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

function makeDocumentList(results: DocumentDto[] = []): {
  total: number;
  page: number;
  page_size: number;
  results: DocumentDto[];
} {
  return {
    total: results.length,
    page: 1,
    page_size: 50,
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

describe("project graph edge relationship selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.getProject.mockResolvedValue(makeProject());
    mockApiClient.getRelationship.mockResolvedValue(
      makeEntity({ id: "rel-1", schema: "Ownership", caption: "Ownership", properties: {} })
    );
    mockApiClient.getRelationshipDocuments.mockResolvedValue(
      makeDocumentList([
        {
          id: "doc-1",
          filename: "report.txt",
          type: "text",
          status: "completed",
          public: false,
          owner_ids: ["user-1"],
          entity_count: 2,
          created_at: "2026-02-26 00:01:12"
        }
      ])
    );
    mockApiClient.getEntityDocuments.mockResolvedValue(makeDocumentList());
  });

  it("maps edge click to relationship selection and loads relationship source documents", async () => {
    renderPage();

    expect(await screen.findByTestId("graph-renderer")).toHaveTextContent("nodes:2; edges:1");

    fireEvent.click(await screen.findByRole("button", { name: /^edge-rel-1:/ }));

    await waitFor(() => {
      expect(mockApiClient.getRelationship).toHaveBeenCalledWith("rel-1");
      expect(mockApiClient.getRelationshipDocuments).toHaveBeenCalledWith("rel-1", 1, 50);
    });

    expect(await screen.findByText("report.txt")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Inspect in Documents" })).toBeInTheDocument();
  });
});
