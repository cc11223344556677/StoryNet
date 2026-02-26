import type { ApiClient, FtMEntity, ProjectDto } from "../../types/domain";
import {
  fetchDocumentEntitiesStrict,
  mergeEntitiesById,
  ProjectSeedError
} from "./projectSeedService";

export interface BatchSeedFailure {
  documentId: string;
  message: string;
}

export class ProjectSeedBatchError extends Error {
  readonly failures: BatchSeedFailure[];

  constructor(message: string, failures: BatchSeedFailure[]) {
    super(message);
    this.name = "ProjectSeedBatchError";
    this.failures = failures;
  }
}

export interface CreateProjectFromDocumentsInput {
  documentIds: string[];
  name: string;
  description?: string;
}

export interface AddDocumentsToProjectInput {
  documentIds: string[];
  projectId: string;
}

function normalizeDescription(value?: string): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function dedupeEntities(entities: FtMEntity[]): FtMEntity[] {
  return mergeEntitiesById([], entities);
}

async function collectEntitiesAllOrNothing(
  apiClient: ApiClient,
  documentIds: string[]
): Promise<FtMEntity[]> {
  const failures: BatchSeedFailure[] = [];
  const aggregated: FtMEntity[] = [];

  for (const documentId of documentIds) {
    try {
      const result = await fetchDocumentEntitiesStrict(apiClient, documentId);
      aggregated.push(...result.entities);
    } catch (error) {
      if (error instanceof ProjectSeedError) {
        failures.push({ documentId, message: error.message });
      } else if (error instanceof Error) {
        failures.push({ documentId, message: error.message });
      } else {
        failures.push({ documentId, message: "Unknown backend error while loading document entities." });
      }
    }
  }

  if (failures.length > 0) {
    throw new ProjectSeedBatchError(
      "At least one selected document could not be imported. No project updates were applied.",
      failures
    );
  }

  return dedupeEntities(aggregated);
}

export async function createProjectFromDocuments(
  apiClient: ApiClient,
  input: CreateProjectFromDocumentsInput
): Promise<ProjectDto> {
  const entities = await collectEntitiesAllOrNothing(apiClient, input.documentIds);

  return apiClient.createProject({
    name: input.name.trim(),
    description: normalizeDescription(input.description),
    snapshot: { entities }
  });
}

export async function addDocumentsToProject(
  apiClient: ApiClient,
  input: AddDocumentsToProjectInput
): Promise<ProjectDto> {
  const [project, entities] = await Promise.all([
    apiClient.getProject(input.projectId),
    collectEntitiesAllOrNothing(apiClient, input.documentIds)
  ]);

  return apiClient.updateProject(project.id, {
    name: project.name,
    description: project.description,
    snapshot: {
      entities: mergeEntitiesById(project.snapshot.entities, entities)
    }
  });
}
