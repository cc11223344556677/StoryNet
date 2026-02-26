import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  GraphRendererHost: ({ graph }: { graph: { nodes: Array<{ id: string }>; edges: Array<{ id: string }> } | null }) => (
    <div data-testid="graph-renderer">nodes:{graph?.nodes.length ?? 0}; edges:{graph?.edges.length ?? 0}</div>
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

describe("project graph workspace layout", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.getProject.mockResolvedValue(makeProject());
    mockApiClient.listMyDocuments.mockResolvedValue(makeDocumentList());
    mockApiClient.getEntityDocuments.mockResolvedValue(makeDocumentList());
    mockApiClient.getRelationshipDocuments.mockResolvedValue(makeDocumentList());
    mockApiClient.searchEntities.mockResolvedValue({ total: 0, page: 1, page_size: 50, results: [] });
  });

  it("keeps graph visible while switching left tabs", async () => {
    renderPage();

    expect(await screen.findByTestId("graph-renderer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Seed" }));
    expect(screen.getByTestId("graph-renderer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Snapshot" }));
    expect(screen.getByTestId("graph-renderer")).toBeInTheDocument();
  });

  it("starts with open side panels and supports collapse/expand", async () => {
    renderPage();

    expect(await screen.findByLabelText("Collapse left panel")).toBeInTheDocument();
    expect(screen.getByLabelText("Collapse right panel")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Collapse left panel"));
    expect(await screen.findByLabelText("Expand left panel")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Expand left panel"));
    expect(await screen.findByLabelText("Collapse left panel")).toBeInTheDocument();
  });
});
