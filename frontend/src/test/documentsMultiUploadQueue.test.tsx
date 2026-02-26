import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    me: vi.fn(),
    listProjects: vi.fn()
  }
}));

vi.mock("../api/factory", () => ({
  apiClient: mockApiClient
}));

import { DocumentsPage } from "../features/documents/DocumentsPage";

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

describe("documents multi upload queue", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.listMyDocuments.mockResolvedValue({
      total: 0,
      page: 1,
      page_size: 50,
      results: []
    });
    mockApiClient.listProjects.mockResolvedValue({
      total: 0,
      results: []
    });
  });

  it("adds multiple files and uploads sequentially while continuing after failure", async () => {
    const file1 = new File(["alpha"], "alpha.txt", { type: "text/plain" });
    const file2 = new File(["beta"], "beta.pdf", { type: "application/pdf" });

    mockApiClient.uploadTextDocument.mockRejectedValueOnce(new Error("Text upload failed"));
    mockApiClient.uploadPdfDocument.mockResolvedValueOnce({
      job_id: "job-2",
      document_id: "doc-2",
      status: "completed",
      message: "done"
    });

    renderDocumentsPage();

    const nativeInputs = document.querySelectorAll('input[type="file"]');
    expect(nativeInputs.length).toBeGreaterThan(0);
    fireEvent.change(nativeInputs[0], {
      target: { files: [file1, file2] }
    });

    expect(await screen.findByText(/alpha.txt/)).toBeInTheDocument();
    expect(await screen.findByText(/beta.pdf/)).toBeInTheDocument();
    expect(screen.getByText("Total 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Upload All" }));

    await waitFor(() => {
      expect(mockApiClient.uploadTextDocument).toHaveBeenCalledTimes(1);
      expect(mockApiClient.uploadPdfDocument).toHaveBeenCalledTimes(1);
    });

    expect(mockApiClient.uploadTextDocument).toHaveBeenCalledWith(file1, true);
    expect(mockApiClient.uploadPdfDocument).toHaveBeenCalledWith(file2, true);

    expect(await screen.findByText(/status: failed/)).toBeInTheDocument();
    expect(await screen.findByText(/status: completed \(completed\)/)).toBeInTheDocument();
  });
});
