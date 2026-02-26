import type { FtMEntity, ProjectSnapshot } from "../../types/domain";
import { isLikelyRelationshipSchema } from "../../api/mappers";

const ENTITY_ID_LIKE_PATTERN = /^[A-Za-z0-9._:-]{3,}$/;

export interface MergeSnapshotResult {
  snapshot: ProjectSnapshot;
  changed: boolean;
}

export interface RemoveSnapshotEntityResult {
  snapshot: ProjectSnapshot;
  changed: boolean;
  removedRelationshipIds: string[];
}

function looksLikeEntityId(value: string): boolean {
  const trimmed = value.trim();
  if (!ENTITY_ID_LIKE_PATTERN.test(trimmed)) {
    return false;
  }

  if (/\s/.test(trimmed)) {
    return false;
  }

  if (/^\d+$/.test(trimmed)) {
    return false;
  }

  return (
    trimmed.includes("_") ||
    trimmed.includes(":") ||
    trimmed.includes("-") ||
    /^[0-9a-fA-F]{8,}$/.test(trimmed)
  );
}

export function collectRelationshipReferences(relationship: FtMEntity): string[] {
  const ids = new Set<string>();

  for (const values of Object.values(relationship.properties)) {
    for (const value of values) {
      if (looksLikeEntityId(value)) {
        ids.add(value);
      }
    }
  }

  return [...ids];
}

export function mergeSnapshot(
  base: ProjectSnapshot,
  newEntities: FtMEntity[]
): MergeSnapshotResult {
  const byId = new Map<string, FtMEntity>(base.entities.map((entity) => [entity.id, entity]));
  let changed = false;

  for (const entity of newEntities) {
    const existing = byId.get(entity.id);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(entity)) {
      changed = true;
    }
    byId.set(entity.id, entity);
  }

  return {
    changed,
    snapshot: {
      entities: [...byId.values()],
      viewport: base.viewport ?? {}
    }
  };
}

export function removeEntityFromSnapshot(base: ProjectSnapshot, entityId: string): RemoveSnapshotEntityResult {
  const remainingEntities = base.entities.filter((entity) => entity.id !== entityId);
  const removedRelationshipIds: string[] = [];

  const entities = remainingEntities.filter((entity) => {
    if (!isLikelyRelationshipSchema(entity.schema)) {
      return true;
    }

    const refs = collectRelationshipReferences(entity);
    const shouldRemove = refs.includes(entityId);
    if (shouldRemove) {
      removedRelationshipIds.push(entity.id);
    }

    return !shouldRemove;
  });

  const changed = entities.length !== base.entities.length;
  if (!changed) {
    return { snapshot: base, changed: false, removedRelationshipIds: [] };
  }

  return {
    changed: true,
    removedRelationshipIds,
    snapshot: {
      entities,
      viewport: {
        ...(base.viewport ?? {}),
        last_removed_entity_id: entityId,
        last_removed_at: new Date().toISOString()
      }
    }
  };
}
