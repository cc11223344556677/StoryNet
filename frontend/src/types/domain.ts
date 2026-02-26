export type DocumentType = "text" | "pdf";

export type DocumentStatus =
  | "queued"
  | "ocr_processing"
  | "ner_processing"
  | "completed"
  | "failed";

export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: "Bearer";
  expires_in: number;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  created_at?: string;
}

export interface ProvenanceEntry {
  document_id: string;
  page_number?: number | null;
}

export interface FtMEntity {
  id: string;
  schema: string;
  caption?: string;
  properties: Record<string, string[]>;
  confidence?: number | null;
  public?: boolean;
  owner_ids?: string[];
  provenance?: ProvenanceEntry[];
  first_seen?: string;
  last_changed?: string;
}

export interface ProjectSnapshot {
  entities: FtMEntity[];
  viewport?: Record<string, unknown>;
}

export interface ProjectDto {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  snapshot: ProjectSnapshot;
  created_at: string;
  updated_at: string;
}

export interface ProjectListResponse {
  total: number;
  results: ProjectDto[];
}

export interface CreateProjectRequest {
  name: string;
  description?: string | null;
  snapshot: ProjectSnapshot;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string | null;
  snapshot?: ProjectSnapshot;
}

export interface DocumentDto {
  id: string;
  filename: string;
  type: DocumentType;
  status: DocumentStatus;
  public: boolean;
  owner_ids: string[];
  entity_count?: number;
  created_at?: string;
  error_message?: string | null;
}

export interface DocumentListResponse {
  total: number;
  page: number;
  page_size: number;
  results: DocumentDto[];
}

export interface JobStatus {
  job_id: string;
  document_id?: string;
  status: DocumentStatus;
  progress?: number;
  message?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface JobListResponse {
  total: number;
  results: JobStatus[];
}

export interface EntitySearchResponse {
  total: number;
  page: number;
  page_size: number;
  results: FtMEntity[];
}

export interface DocumentFilter {
  status?: DocumentStatus;
  type?: DocumentType;
  page?: number;
  pageSize?: number;
}

export interface JobsFilter {
  status?: DocumentStatus;
  page?: number;
  pageSize?: number;
}

export interface UpdateDocumentRequest {
  public?: boolean;
}

export interface EntitySearchParams {
  q?: string;
  schema?: string;
  fuzzy?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  relationship_entity_id?: string;
}

export interface EntityNeighborhood {
  centerNode: GraphNode;
  neighborNodes: GraphNode[];
  connectingEdges: GraphEdge[];
}

export interface EntitySearchHit {
  entityId: string;
  label: string;
  type: string;
}

export interface GraphCommandResult {
  supported: boolean;
  message: string;
}

export interface ProjectCardVM {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  snapshotEntityCount: number;
}

export interface DocumentVM {
  id: string;
  fileName: string;
  type: DocumentType;
  status: DocumentStatus;
  isPublic: boolean;
  ownerIds: string[];
  entityCount: number;
  createdAt: string;
  errorMessage: string;
}

export interface AuthApiClient {
  register(input: RegisterRequest): Promise<TokenResponse>;
  login(input: LoginRequest): Promise<TokenResponse>;
  refresh(refreshToken: string): Promise<TokenResponse>;
  me(): Promise<UserProfile>;
  changePassword(input: ChangePasswordRequest): Promise<void>;
}

export interface StoryNetApiClient {
  listProjects(page?: number, pageSize?: number): Promise<ProjectListResponse>;
  getProject(id: string): Promise<ProjectDto>;
  createProject(input: CreateProjectRequest): Promise<ProjectDto>;
  updateProject(id: string, input: UpdateProjectRequest): Promise<ProjectDto>;
  deleteProject(id: string): Promise<void>;

  uploadTextDocument(file: File, makePublic?: boolean): Promise<JobStatus>;
  uploadPdfDocument(file: File, makePublic?: boolean): Promise<JobStatus>;
  listMyDocuments(filter?: DocumentFilter): Promise<DocumentListResponse>;
  getDocument(id: string): Promise<DocumentDto>;
  updateDocument(id: string, input: UpdateDocumentRequest): Promise<DocumentDto>;
  deleteDocument(id: string): Promise<void>;
  getDocumentEntities(
    id: string,
    schema?: string,
    page?: number,
    pageSize?: number
  ): Promise<EntitySearchResponse>;
  listJobs(filter?: JobsFilter): Promise<JobListResponse>;
  getJob(id: string): Promise<JobStatus>;

  searchEntities(params: EntitySearchParams): Promise<EntitySearchResponse>;
  getEntity(id: string): Promise<FtMEntity>;
  getEntityDocuments(id: string, page?: number, pageSize?: number): Promise<DocumentListResponse>;
  getEntityRelationships(
    id: string,
    depth?: number,
    page?: number,
    pageSize?: number
  ): Promise<EntitySearchResponse>;
  getRelationship(id: string): Promise<FtMEntity>;
  getRelationshipDocuments(id: string, page?: number, pageSize?: number): Promise<DocumentListResponse>;
}

export type ApiClient = AuthApiClient & StoryNetApiClient;
