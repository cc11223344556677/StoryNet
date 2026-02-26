import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

import { JobInspectorPanel } from "../features/documents/JobInspectorPanel";

function renderPanel(jobId: string | null, open = true): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false }
    }
  });

  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <JobInspectorPanel jobId={jobId} open={open} onClose={() => undefined} />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("job inspector panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders job details and deep-link to document inspector", async () => {
    mockApiClient.getJob.mockResolvedValue({
      job_id: "job-1",
      document_id: "doc-77",
      status: "completed",
      progress: 100,
      message: "Done",
      created_at: "2026-02-26 12:00:00",
      updated_at: "2026-02-26 12:01:00"
    });

    renderPanel("job-1");

    expect(await screen.findByText("Job Inspector")).toBeInTheDocument();
    expect(await screen.findByText(/Job ID:/)).toBeInTheDocument();
    expect(await screen.findByText(/job-1/)).toBeInTheDocument();

    const link = await screen.findByRole("link", { name: "Open Document Inspector" });
    expect(link).toHaveAttribute("href", "/documents?inspect=doc-77");
  });

  it("shows neutral state when no job is selected", async () => {
    renderPanel(null);

    expect(await screen.findByText("Select a job to inspect.")).toBeInTheDocument();
    expect(mockApiClient.getJob).not.toHaveBeenCalled();
  });
});
