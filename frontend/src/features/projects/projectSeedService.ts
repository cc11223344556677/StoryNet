import type { ApiClient, FtMEntity, ProjectDto } from "../../types/domain";

const DEFAULT_PAGE_SIZE = 100;
const MAX_ENTITY_PAGES = 200;

export type ProjectSeedErrorCode =
  | "DOCUMENT_NOT_COMPLETED"
  | "DOCUMENT_HAS_NO_ENTITIES"
  | "DOCUMENT_ENTITIES_FETCH_FAILED"
  | "DOCUMENT_ENTITIES_EMPTY";

export class ProjectSeedError extends Error {
  readonly code: ProjectSeedErrorCode;

  constructor(code: ProjectSeedErrorCode, message: string) {
    super(message);
    this.name = "ProjectSeedError";
    this.code = code;
  }
}

export interface FetchDocumentEntitiesStrictResult {
  documentId: string;
  documentName: string;
  entities: FtMEntity[];
}

export interface CreateProjectFromDocumentInput {
  documentId: string;
  name: string;
  description?: string;
}

export interface AddDocumentToProjectInput {
  documentId: string;
  projectId: string;
}

function normalizeProjectDescription(value?: string): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function dedupeEntitiesById(entities: FtMEntity[]): FtMEntity[] {
  const byId = new Map<string, FtMEntity>();

  for (const entity of entities) {
    byId.set(entity.id, entity);
  }

  return [...byId.values()];
}

export function mergeEntitiesById(base: FtMEntity[], incoming: FtMEntity[]): FtMEntity[] {
  return dedupeEntitiesById([...base, ...incoming]);
}

export async function fetchDocumentEntitiesStrict(
  apiClient: ApiClient,
  documentId: string,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<FetchDocumentEntitiesStrictResult> {
  const document = await apiClient.getDocument(documentId);

  if (document.status !== "completed") {
    throw new ProjectSeedError(
      "DOCUMENT_NOT_COMPLETED",
      `Document "${document.filename}" is ${document.status}. It must be completed before importing into a project.`
    );
  }

  const expectedEntityCount = document.entity_count ?? 0;
  if (expectedEntityCount <= 0) {
    throw new ProjectSeedError(
      "DOCUMENT_HAS_NO_ENTITIES",
      `Document "${document.filename}" has no extracted entities to import.`
    );
  }

  const pages: FtMEntity[] = [];

  for (let page = 1; page <= MAX_ENTITY_PAGES; page += 1) {
    let response;
    try {
      response = await apiClient.getDocumentEntities(documentId, undefined, page, pageSize);
    } catch (error) {
      throw new ProjectSeedError(
        "DOCUMENT_ENTITIES_FETCH_FAILED",
        `Backend could not return entities for "${document.filename}".`
      );
    }

    pages.push(...response.results);

    if (response.results.length === 0 || page * pageSize >= response.total) {
      break;
    }
  }

  const entities = dedupeEntitiesById(pages);
  if (entities.length === 0) {
    throw new ProjectSeedError(
      "DOCUMENT_ENTITIES_EMPTY",
      `Document "${document.filename}" reports extracted entities, but no entity rows could be loaded.`
    );
  }

  return {
    documentId: document.id,
    documentName: document.filename,
    entities
  };
}

function mergeSeedViewport(
  baseViewport: Record<string, unknown> | undefined,
  documentId: string
): Record<string, unknown> {
  return {
    ...(baseViewport ?? {}),
    last_seeded_document_id: documentId,
    last_seeded_at: new Date().toISOString()
  };
}

export async function createProjectFromDocument(
  apiClient: ApiClient,
  input: CreateProjectFromDocumentInput
): Promise<ProjectDto> {
  const seeded = await fetchDocumentEntitiesStrict(apiClient, input.documentId);

  return apiClient.createProject({
    name: input.name.trim(),
    description: normalizeProjectDescription(input.description),
    snapshot: {
      entities: seeded.entities,
      viewport: mergeSeedViewport({}, input.documentId)
    }
  });
}

export async function addDocumentEntitiesToProject(
  apiClient: ApiClient,
  input: AddDocumentToProjectInput
): Promise<ProjectDto> {
  const seeded = await fetchDocumentEntitiesStrict(apiClient, input.documentId);
  const project = await apiClient.getProject(input.projectId);

  return apiClient.updateProject(project.id, {
    name: project.name,
    description: project.description,
    snapshot: {
      entities: mergeEntitiesById(project.snapshot.entities, seeded.entities),
      viewport: mergeSeedViewport(project.snapshot.viewport, input.documentId)
    }
  });
}
