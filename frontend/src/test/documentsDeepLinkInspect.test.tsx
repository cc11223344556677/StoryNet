import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../types/domain";

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

import { DocumentsPage } from "../features/documents/DocumentsPage";

function renderPage(initialPath = "/documents?inspect=doc-77"): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/documents" element={<DocumentsPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("documents deep-link inspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.listMyDocuments.mockResolvedValue({
      total: 0,
      page: 1,
      page_size: 50,
      results: []
    });
    mockApiClient.getDocument.mockResolvedValue({
      id: "doc-77",
      filename: "only-by-id.txt",
      type: "text",
      status: "queued",
      public: false,
      owner_ids: ["user-1"],
      entity_count: 0,
      created_at: "2026-02-26 00:01:12",
      error_message: null
    });
  });

  it("opens document inspector from query param even when document is not in list", async () => {
    renderPage();

    expect(await screen.findByText("Document Inspector")).toBeInTheDocument();
    expect(
      await screen.findByText((_, element) => element?.textContent === "ID: doc-77")
    ).toBeInTheDocument();
    expect(
      await screen.findByText((_, element) => element?.textContent === "Filename: only-by-id.txt")
    ).toBeInTheDocument();
    expect(
      await screen.findByText((_, element) => element?.textContent === "Status: queued")
    ).toBeInTheDocument();
  });
});
