import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentDto, FtMEntity } from "../types/domain";

const { mockNavigate, mockApiClient } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockApiClient: {
    listMyDocuments: vi.fn(),
    getDocument: vi.fn(),
    getDocumentEntities: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    uploadTextDocument: vi.fn(),
    uploadPdfDocument: vi.fn(),
    getJob: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
    me: vi.fn()
  }
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock("../api/factory", () => ({
  apiClient: mockApiClient
}));

import { DocumentsPage } from "../features/documents/DocumentsPage";

function makeEntity(id: string, schema = "Person"): FtMEntity {
  return {
    id,
    schema,
    properties: {}
  };
}

function makeDocument(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    id: "doc-1",
    filename: "test.txt",
    type: "text",
    status: "completed",
    public: false,
    owner_ids: ["user-1"],
    entity_count: 2,
    created_at: "2026-02-26 00:01:12",
    error_message: null,
    ...overrides
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
    <MemoryRouter initialEntries={["/documents"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/documents" element={<DocumentsPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("document to project seeding flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.listMyDocuments.mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 50,
      results: [makeDocument()]
    });
  });

  it("creates a project from a completed document and navigates to graph", async () => {
    mockApiClient.getDocument.mockResolvedValue(makeDocument());
    mockApiClient.getDocumentEntities.mockResolvedValue({
      total: 2,
      page: 1,
      page_size: 100,
      results: [makeEntity("e1"), makeEntity("e2")]
    });
    mockApiClient.createProject.mockResolvedValue({
      id: "project-1",
      name: "test",
      description: null,
      owner_id: "user-1",
      snapshot: { entities: [makeEntity("e1"), makeEntity("e2")], viewport: {} },
      created_at: "2026-02-26 00:01:12",
      updated_at: "2026-02-26 00:01:12"
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Create Project" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create & Open Graph" }));

    await waitFor(() => {
      expect(mockApiClient.createProject).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith("/projects/project-1/graph");
    });

    const createPayload = vi.mocked(mockApiClient.createProject).mock.calls[0][0];
    expect(createPayload.snapshot).toBeDefined();
    expect(createPayload.snapshot).not.toHaveProperty("viewport");
  });

  it("shows hard error when document reports entities but endpoint returns empty list", async () => {
    mockApiClient.getDocument.mockResolvedValue(makeDocument({ entity_count: 7 }));
    mockApiClient.getDocumentEntities.mockResolvedValue({
      total: 0,
      page: 1,
      page_size: 100,
      results: []
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Create Project" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create & Open Graph" }));

    const messages = await screen.findAllByText(
      /reports extracted entities, but no entity rows could be loaded/i
    );
    expect(messages.length).toBeGreaterThan(0);
  });

  it("adds document entities to existing project and navigates to graph", async () => {
    mockApiClient.listProjects.mockResolvedValue({
      total: 1,
      results: [
        {
          id: "project-1",
          name: "Project One",
          description: "desc",
          owner_id: "user-1",
          snapshot: { entities: [], viewport: {} },
          created_at: "2026-02-26 00:01:12",
          updated_at: "2026-02-26 00:01:12"
        }
      ]
    });
    mockApiClient.getDocument.mockResolvedValue(makeDocument());
    mockApiClient.getDocumentEntities.mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 100,
      results: [makeEntity("e1")]
    });
    mockApiClient.getProject.mockResolvedValue({
      id: "project-1",
      name: "Project One",
      description: "desc",
      owner_id: "user-1",
      snapshot: { entities: [], viewport: {} },
      created_at: "2026-02-26 00:01:12",
      updated_at: "2026-02-26 00:01:12"
    });
    mockApiClient.updateProject.mockResolvedValue({
      id: "project-1",
      name: "Project One",
      description: "desc",
      owner_id: "user-1",
      snapshot: { entities: [makeEntity("e1")], viewport: {} },
      created_at: "2026-02-26 00:01:12",
      updated_at: "2026-02-26 00:01:12"
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Add to Project" }));

    fireEvent.mouseDown(await screen.findByLabelText("Project"));
    fireEvent.click(await screen.findByRole("option", { name: "Project One" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add & Open Graph" }));

    await waitFor(() => {
      expect(mockApiClient.updateProject).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith("/projects/project-1/graph");
    });

    const updatePayload = vi.mocked(mockApiClient.updateProject).mock.calls[0][1];
    expect(updatePayload.snapshot).toBeDefined();
    expect(updatePayload.snapshot).not.toHaveProperty("viewport");
  });
});
