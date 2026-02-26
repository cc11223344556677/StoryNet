import type { FtMEntity, ProjectSnapshot, ProvenanceEntry } from "../types/domain";

export interface WritableFtMEntity {
  id: string;
  schema: string;
  properties: Record<string, string[]>;
  caption?: string;
  confidence?: number | null;
  public?: boolean;
  owner_ids?: string[];
  provenance?: ProvenanceEntry[];
}

export interface ProjectSnapshotWrite {
  entities: WritableFtMEntity[];
}

function sanitizeProperties(properties: Record<string, string[]>): Record<string, string[]> {
  const output: Record<string, string[]> = {};

  for (const [key, values] of Object.entries(properties)) {
    if (!Array.isArray(values)) {
      continue;
    }

    const sanitizedValues = values.filter((value): value is string => typeof value === "string");
    output[key] = sanitizedValues;
  }

  return output;
}

function sanitizeProvenance(entries?: ProvenanceEntry[]): ProvenanceEntry[] | undefined {
  if (!Array.isArray(entries)) {
    return undefined;
  }

  const sanitized = entries
    .filter((entry) => typeof entry.document_id === "string" && entry.document_id.length > 0)
    .map((entry) => ({
      document_id: entry.document_id,
      page_number: entry.page_number ?? null
    }));

  return sanitized.length > 0 ? sanitized : undefined;
}

export function sanitizeWritableEntity(entity: FtMEntity): WritableFtMEntity {
  const sanitized: WritableFtMEntity = {
    id: entity.id,
    schema: entity.schema,
    properties: sanitizeProperties(entity.properties)
  };

  if (typeof entity.caption === "string") {
    sanitized.caption = entity.caption;
  }

  if (typeof entity.confidence === "number" || entity.confidence === null) {
    sanitized.confidence = entity.confidence;
  }

  if (typeof entity.public === "boolean") {
    sanitized.public = entity.public;
  }

  if (Array.isArray(entity.owner_ids)) {
    sanitized.owner_ids = entity.owner_ids.filter((value): value is string => typeof value === "string");
  }

  const provenance = sanitizeProvenance(entity.provenance);
  if (provenance) {
    sanitized.provenance = provenance;
  }

  return sanitized;
}

export function sanitizeProjectSnapshotForWrite(snapshot: ProjectSnapshot): ProjectSnapshotWrite {
  const lastIndexById = new Map<string, number>();
  const latestEntityById = new Map<string, WritableFtMEntity>();

  snapshot.entities.forEach((entity, index) => {
    lastIndexById.set(entity.id, index);
    latestEntityById.set(entity.id, sanitizeWritableEntity(entity));
  });

  const entities = snapshot.entities
    .filter((entity, index) => lastIndexById.get(entity.id) === index)
    .map((entity) => latestEntityById.get(entity.id))
    .filter((entity): entity is WritableFtMEntity => Boolean(entity));

  return { entities };
}
