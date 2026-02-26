import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { DocumentDto, EntitySearchResponse, FtMEntity } from "../types/domain";

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    listMyDocuments: vi.fn(),
    getDocument: vi.fn(),
    getDocumentEntities: vi.fn(),
    uploadTextDocument: vi.fn(),
    uploadPdfDocument: vi.fn(),
    getJob: vi.fn(),
    updateDocument: vi.fn(),
    deleteDocument: vi.fn(),
    me: vi.fn()
  }
}));

vi.mock("../api/factory", () => ({
  apiClient: mockApiClient
}));

import { DocumentsPage } from "../features/documents/DocumentsPage";

function makeDocument(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    id: "doc-1",
    filename: "test.txt",
    type: "text",
    status: "completed",
    public: false,
    owner_ids: ["user-1"],
    entity_count: 0,
    created_at: "2026-02-26 00:01:12",
    error_message: null,
    ...overrides
  };
}

function makeEntityResponse(results: FtMEntity[]): EntitySearchResponse {
  return {
    total: results.length,
    page: 1,
    page_size: 50,
    results
  };
}

function renderDocumentsPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      },
      mutations: {
        retry: false
      }
    }
  });

  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <DocumentsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

async function openInspector(document: DocumentDto): Promise<void> {
  mockApiClient.listMyDocuments.mockResolvedValue({
    total: 1,
    page: 1,
    page_size: 50,
    results: [document]
  });
  mockApiClient.getDocument.mockResolvedValue(document);

  renderDocumentsPage();
  const inspectButtons = await screen.findAllByRole("button", { name: "Inspect" });
  fireEvent.click(inspectButtons[0]);
}

describe("documents inspector resilience", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows metadata total and neutral unavailable state when rows are missing", async () => {
    const document = makeDocument({ entity_count: 7 });
    mockApiClient.getDocumentEntities.mockResolvedValue(makeEntityResponse([]));

    await openInspector(document);

    expect(await screen.findByText("Total entities: 7")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "7 entities were extracted. Detailed entity rows are temporarily unavailable."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/backend consistency issue/i)).not.toBeInTheDocument();
  });

  it("shows a clean empty state when metadata indicates zero entities", async () => {
    const document = makeDocument({ entity_count: 0 });
    mockApiClient.getDocumentEntities.mockResolvedValue(makeEntityResponse([]));

    await openInspector(document);

    expect(await screen.findByText("Total entities: 0")).toBeInTheDocument();
    expect(await screen.findByText("No entities extracted from this document yet.")).toBeInTheDocument();
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
  });

  it("shows returned entity rows when available", async () => {
    const document = makeDocument({ entity_count: 3 });
    mockApiClient.getDocumentEntities.mockResolvedValue(
      makeEntityResponse([
        {
          id: "entity-1",
          schema: "Person",
          caption: "Alice Example",
          properties: {}
        }
      ])
    );

    await openInspector(document);

    expect(await screen.findByText("Total entities: 3")).toBeInTheDocument();
    expect(await screen.findByText("Alice Example")).toBeInTheDocument();
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
  });

  it("downgrades entities endpoint errors to neutral info when metadata count is non-zero", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const document = makeDocument({ entity_count: 5 });
    mockApiClient.getDocumentEntities.mockRejectedValue(new Error("Request failed with status 500."));

    await openInspector(document);

    expect(await screen.findByText("Total entities: 5")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "5 entities were extracted. Detailed entity rows are temporarily unavailable."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Backend could not load extracted entities for this document/i)
    ).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
