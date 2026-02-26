import type {
  ApiClient,
  ChangePasswordRequest,
  CreateProjectRequest,
  DocumentDto,
  DocumentFilter,
  DocumentListResponse,
  EntitySearchParams,
  EntitySearchResponse,
  FtMEntity,
  JobListResponse,
  JobStatus,
  JobsFilter,
  LoginRequest,
  ProjectDto,
  ProjectListResponse,
  RegisterRequest,
  TokenResponse,
  UpdateDocumentRequest,
  UpdateProjectRequest,
  UserProfile
} from "../types/domain";
import {
  changePasswordRequestSchema,
  createProjectRequestSchema,
  documentSchema,
  documentListResponseSchema,
  entitySearchResponseSchema,
  errorResponseSchema,
  ftmEntitySchema,
  jobListResponseSchema,
  jobStatusSchema,
  loginRequestSchema,
  projectListResponseSchema,
  projectSchema,
  registerRequestSchema,
  tokenResponseSchema,
  updateDocumentRequestSchema,
  updateProjectRequestSchema,
  userProfileSchema
} from "./schemas";
import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  isAccessTokenExpired,
  saveAuthTokens
} from "../lib/authStorage";
import {
  ForbiddenError,
  NotFoundError,
  StoryNetApiError,
  UnauthorizedError,
  ValidationError
} from "./errors";
import { sanitizeProjectSnapshotForWrite } from "./projectWritePayload";

interface RequestOptions extends RequestInit {
  auth?: boolean;
  retryOn401?: boolean;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    query.set(key, String(value));
  }

  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function normalizeApiError(status: number, payload: unknown): StoryNetApiError {
  const parsed = errorResponseSchema.safeParse(payload);
  if (parsed.success) {
    const { error, message, details } = parsed.data;

    if (status === 401) return new UnauthorizedError(message, details);
    if (status === 403) return new ForbiddenError(message, details);
    if (status === 404) return new NotFoundError(message, details);
    if (status === 422) return new ValidationError(message, details);

    return new StoryNetApiError(error, message, status, details);
  }

  if (status === 401) return new UnauthorizedError();
  if (status === 403) return new ForbiddenError();
  if (status === 404) return new NotFoundError("Resource");
  if (status === 400) {
    if (payload && typeof payload === "object") {
      const candidate = payload as Record<string, unknown>;

      if (typeof candidate.message === "string" && candidate.message.length > 0) {
        return new StoryNetApiError("BAD_REQUEST", candidate.message, status, payload);
      }

      if (typeof candidate.detail === "string" && candidate.detail.length > 0) {
        return new StoryNetApiError(
          "BAD_REQUEST",
          `Request validation failed: ${candidate.detail}`,
          status,
          payload
        );
      }

      if (Array.isArray(candidate.detail) && candidate.detail.length > 0) {
        const details = candidate.detail
          .map((entry) => {
            if (typeof entry === "string") {
              return entry;
            }

            if (!entry || typeof entry !== "object") {
              return null;
            }

            const detailItem = entry as Record<string, unknown>;
            if (typeof detailItem.msg === "string" && detailItem.msg.length > 0) {
              return detailItem.msg;
            }
            if (typeof detailItem.message === "string" && detailItem.message.length > 0) {
              return detailItem.message;
            }

            const location = Array.isArray(detailItem.loc)
              ? detailItem.loc
              : Array.isArray(detailItem.path)
                ? detailItem.path
                : null;
            if (location) {
              return `Invalid field ${location.map((value) => String(value)).join(".")}`;
            }

            return null;
          })
          .filter((value): value is string => Boolean(value));

        if (details.length > 0) {
          return new StoryNetApiError(
            "BAD_REQUEST",
            `Request validation failed: ${details.join("; ")}`,
            status,
            payload
          );
        }
      }
    }
  }
  if (status === 422) return new ValidationError("Request validation failed.");

  return new StoryNetApiError("HTTP_ERROR", `Request failed with status ${status}.`, status, payload);
}

export class RestStoryNetApiClient implements ApiClient {
  private readonly apiBaseUrl: string;
  private refreshPromise: Promise<void> | null = null;

  constructor(baseUrl?: string) {
    const envBase = import.meta.env.VITE_API_BASE_URL ?? "/api";
    this.apiBaseUrl = trimTrailingSlash(baseUrl ?? envBase);
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
          throw new UnauthorizedError("Missing refresh token.");
        }

        const response = await this.request<TokenResponse>(
          "/auth/refresh",
          {
            method: "POST",
            body: JSON.stringify({ refresh_token: refreshToken }),
            headers: {
              "Content-Type": "application/json"
            },
            auth: false,
            retryOn401: false
          },
          tokenResponseSchema.parse
        );

        saveAuthTokens(response);
      })().finally(() => {
        this.refreshPromise = null;
      });
    }

    await this.refreshPromise;
  }

  private async request<T>(
    path: string,
    options: RequestOptions,
    parse: (payload: unknown) => T
  ): Promise<T> {
    const auth = options.auth ?? true;
    const retryOn401 = options.retryOn401 ?? true;

    const headers = new Headers(options.headers ?? {});
    const init: RequestInit = {
      method: options.method ?? "GET",
      headers,
      body: options.body
    };

    if (auth) {
      const accessToken = getAccessToken();
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }
    }

    const url = `${this.apiBaseUrl}${path}`;
    const response = await fetch(url, init);

    if (response.status === 401 && auth && retryOn401 && getRefreshToken()) {
      try {
        await this.refreshAccessToken();
        return this.request(path, { ...options, retryOn401: false }, parse);
      } catch {
        clearAuthTokens();
        throw new UnauthorizedError("Session expired. Please log in again.");
      }
    }

    if (!response.ok) {
      const errorPayload = await parseBody(response);
      throw normalizeApiError(response.status, errorPayload);
    }

    if (response.status === 204) {
      return parse(undefined);
    }

    const payload = await parseBody(response);
    return parse(payload);
  }

  async register(input: RegisterRequest): Promise<TokenResponse> {
    const payload = registerRequestSchema.parse(input);

    return this.request(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        auth: false,
        retryOn401: false
      },
      tokenResponseSchema.parse
    );
  }

  async login(input: LoginRequest): Promise<TokenResponse> {
    const payload = loginRequestSchema.parse(input);

    return this.request(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        auth: false,
        retryOn401: false
      },
      tokenResponseSchema.parse
    );
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    return this.request(
      "/auth/refresh",
      {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
        headers: { "Content-Type": "application/json" },
        auth: false,
        retryOn401: false
      },
      tokenResponseSchema.parse
    );
  }

  async me(): Promise<UserProfile> {
    if (!getAccessToken()) {
      throw new UnauthorizedError();
    }

    if (isAccessTokenExpired() && getRefreshToken()) {
      await this.refreshAccessToken();
    }

    return this.request("/auth/me", { method: "GET" }, userProfileSchema.parse);
  }

  async changePassword(input: ChangePasswordRequest): Promise<void> {
    const payload = changePasswordRequestSchema.parse(input);

    await this.request(
      "/auth/me/password",
      {
        method: "PUT",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" }
      },
      () => undefined
    );
  }

  async listProjects(page = 1, pageSize = 50): Promise<ProjectListResponse> {
    const query = buildQueryString({ page, page_size: pageSize });
    return this.request(`/projects${query}`, { method: "GET" }, projectListResponseSchema.parse);
  }

  async getProject(id: string): Promise<ProjectDto> {
    return this.request(`/projects/${encodeURIComponent(id)}`, { method: "GET" }, projectSchema.parse);
  }

  async createProject(input: CreateProjectRequest): Promise<ProjectDto> {
    const parsed = createProjectRequestSchema.parse(input);
    const payload = {
      ...parsed,
      snapshot: sanitizeProjectSnapshotForWrite(parsed.snapshot)
    };

    return this.request(
      "/projects",
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" }
      },
      projectSchema.parse
    );
  }

  async updateProject(id: string, input: UpdateProjectRequest): Promise<ProjectDto> {
    const parsed = updateProjectRequestSchema.parse(input);
    const payload = parsed.snapshot
      ? {
          ...parsed,
          snapshot: sanitizeProjectSnapshotForWrite(parsed.snapshot)
        }
      : parsed;

    return this.request(
      `/projects/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" }
      },
      projectSchema.parse
    );
  }

  async deleteProject(id: string): Promise<void> {
    await this.request(
      `/projects/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      () => undefined
    );
  }

  async uploadTextDocument(file: File, makePublic = false): Promise<JobStatus> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("make_public", String(makePublic));

    return this.request(
      "/documents/upload/text",
      {
        method: "POST",
        body: formData
      },
      jobStatusSchema.parse
    );
  }

  async uploadPdfDocument(file: File, makePublic = false): Promise<JobStatus> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("make_public", String(makePublic));

    return this.request(
      "/documents/upload/pdf",
      {
        method: "POST",
        body: formData
      },
      jobStatusSchema.parse
    );
  }

  async listMyDocuments(filter?: DocumentFilter): Promise<DocumentListResponse> {
    const query = buildQueryString({
      status: filter?.status,
      type: filter?.type,
      page: filter?.page,
      page_size: filter?.pageSize
    });

    return this.request(`/documents/mine${query}`, { method: "GET" }, documentListResponseSchema.parse);
  }

  async getDocument(id: string): Promise<DocumentDto> {
    return this.request(`/documents/${encodeURIComponent(id)}`, { method: "GET" }, documentSchema.parse);
  }

  async updateDocument(id: string, input: UpdateDocumentRequest): Promise<DocumentDto> {
    const payload = updateDocumentRequestSchema.parse(input);

    return this.request(
      `/documents/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" }
      },
      documentSchema.parse
    );
  }

  async deleteDocument(id: string): Promise<void> {
    await this.request(
      `/documents/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      () => undefined
    );
  }

  async getDocumentEntities(
    id: string,
    schema?: string,
    page = 1,
    pageSize = 50
  ): Promise<EntitySearchResponse> {
    const query = buildQueryString({
      schema,
      page,
      page_size: pageSize
    });

    return this.request(
      `/documents/${encodeURIComponent(id)}/entities${query}`,
      { method: "GET" },
      entitySearchResponseSchema.parse
    );
  }

  async listJobs(filter?: JobsFilter): Promise<JobListResponse> {
    const query = buildQueryString({
      status: filter?.status,
      page: filter?.page,
      page_size: filter?.pageSize
    });

    return this.request(`/jobs${query}`, { method: "GET" }, jobListResponseSchema.parse);
  }

  async getJob(id: string): Promise<JobStatus> {
    return this.request(`/jobs/${encodeURIComponent(id)}`, { method: "GET" }, jobStatusSchema.parse);
  }

  async searchEntities(params: EntitySearchParams): Promise<EntitySearchResponse> {
    const query = buildQueryString({
      q: params.q,
      schema: params.schema,
      fuzzy: params.fuzzy,
      page: params.page,
      page_size: params.pageSize
    });

    return this.request(`/entities/search${query}`, { method: "GET" }, entitySearchResponseSchema.parse);
  }

  async getEntity(id: string): Promise<FtMEntity> {
    return this.request(`/entities/${encodeURIComponent(id)}`, { method: "GET" }, ftmEntitySchema.parse);
  }

  async getEntityDocuments(id: string, page = 1, pageSize = 50): Promise<DocumentListResponse> {
    const query = buildQueryString({ page, page_size: pageSize });

    return this.request(
      `/entities/${encodeURIComponent(id)}/documents${query}`,
      { method: "GET" },
      documentListResponseSchema.parse
    );
  }

  async getEntityRelationships(
    id: string,
    depth = 1,
    page = 1,
    pageSize = 50
  ): Promise<EntitySearchResponse> {
    const boundedPageSize = Math.min(Math.max(1, pageSize), 100);
    const query = buildQueryString({ depth, page, page_size: boundedPageSize });

    return this.request(
      `/entities/${encodeURIComponent(id)}/relationships${query}`,
      { method: "GET" },
      entitySearchResponseSchema.parse
    );
  }

  async getRelationship(id: string): Promise<FtMEntity> {
    return this.request(`/relationships/${encodeURIComponent(id)}`, { method: "GET" }, ftmEntitySchema.parse);
  }

  async getRelationshipDocuments(id: string, page = 1, pageSize = 50): Promise<DocumentListResponse> {
    const query = buildQueryString({ page, page_size: pageSize });

    return this.request(
      `/relationships/${encodeURIComponent(id)}/documents${query}`,
      { method: "GET" },
      documentListResponseSchema.parse
    );
  }
}
