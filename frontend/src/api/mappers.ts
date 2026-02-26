import type {
  DocumentDto,
  DocumentVM,
  EntityNeighborhood,
  EntitySearchHit,
  FtMEntity,
  GraphEdge,
  GraphNode,
  ProjectCardVM,
  ProjectDto
} from "../types/domain";

const RELATIONSHIP_SCHEMAS = [
  "Associate",
  "Debt",
  "Directorship",
  "Employment",
  "Family",
  "Membership",
  "Occupancy",
  "Ownership",
  "Payment",
  "ProjectParticipant",
  "Representation",
  "Similar",
  "Succession",
  "UnknownLink"
];

function normalizeSchemaName(value: string): string {
  return value.replace(/[\s_-]+/g, "").toLowerCase();
}

const RELATIONSHIP_SCHEMA_SET = new Set(
  RELATIONSHIP_SCHEMAS.map((schema) => normalizeSchemaName(schema))
);

export function getEntityLabel(entity: FtMEntity): string {
  const caption = entity.caption?.trim();
  if (caption) return caption;

  const preferredKeys = ["name", "title", "label", "alias"];
  for (const key of preferredKeys) {
    const values = entity.properties[key];
    if (values && values.length > 0 && values[0].trim()) {
      return values[0].trim();
    }
  }

  for (const values of Object.values(entity.properties)) {
    if (values.length > 0 && values[0].trim()) {
      return values[0].trim();
    }
  }

  return entity.id;
}

export function mapProjectToCardVM(project: ProjectDto): ProjectCardVM {
  return {
    id: project.id,
    name: project.name,
    description: project.description ?? "",
    createdAt: project.created_at ?? "",
    updatedAt: project.updated_at ?? "",
    snapshotEntityCount: project.snapshot.entities.length
  };
}

export function mapDocumentToVM(document: DocumentDto): DocumentVM {
  return {
    id: document.id,
    fileName: document.filename,
    type: document.type,
    status: document.status,
    isPublic: document.public,
    ownerIds: document.owner_ids,
    entityCount: document.entity_count ?? 0,
    createdAt: document.created_at ?? "",
    errorMessage: document.error_message ?? ""
  };
}

export function mapEntityToSearchHit(entity: FtMEntity): EntitySearchHit {
  return {
    entityId: entity.id,
    label: getEntityLabel(entity),
    type: entity.schema
  };
}

export function mapEntityToGraphNode(entity: FtMEntity): GraphNode {
  return {
    id: entity.id,
    label: getEntityLabel(entity),
    type: entity.schema
  };
}

export function isLikelyRelationshipSchema(schema: string): boolean {
  const normalized = normalizeSchemaName(schema);
  if (RELATIONSHIP_SCHEMA_SET.has(normalized)) {
    return true;
  }

  // Backward-compatible fallback for unexpected custom interval schemas.
  return normalized.includes("relationship");
}

function collectReferencedEntityIds(
  relationship: FtMEntity,
  knownIds: Set<string>
): string[] {
  const ids = new Set<string>();

  for (const values of Object.values(relationship.properties)) {
    for (const value of values) {
      if (knownIds.has(value)) {
        ids.add(value);
      }
    }
  }

  return [...ids];
}

function upsertNeighborNode(
  neighborMap: Map<string, GraphNode>,
  entityById: Map<string, FtMEntity>,
  entityId: string
): void {
  if (neighborMap.has(entityId)) return;

  const entity = entityById.get(entityId);
  if (entity) {
    neighborMap.set(entityId, mapEntityToGraphNode(entity));
    return;
  }

  neighborMap.set(entityId, {
    id: entityId,
    label: entityId,
    type: "Unknown"
  });
}

export function buildNeighborhood(
  centerEntity: FtMEntity,
  relationships: FtMEntity[],
  entityById: Map<string, FtMEntity>
): EntityNeighborhood {
  const centerNode = mapEntityToGraphNode(centerEntity);
  const knownIds = new Set<string>(entityById.keys());
  knownIds.add(centerEntity.id);

  const neighborMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  for (const relationship of relationships) {
    const referenced = collectReferencedEntityIds(relationship, knownIds);
    if (referenced.length === 0) {
      continue;
    }

    if (referenced.includes(centerEntity.id)) {
      const others = referenced.filter((id) => id !== centerEntity.id);
      for (const otherId of others) {
        upsertNeighborNode(neighborMap, entityById, otherId);

        const edgeId = `${relationship.id}_${centerEntity.id}_${otherId}`;
        edgeMap.set(edgeId, {
          id: edgeId,
          source: centerEntity.id,
          target: otherId,
          relation: relationship.schema
        });
      }

      continue;
    }

    if (referenced.length >= 2) {
      const first = referenced[0];
      const second = referenced[1];

      if (first === centerEntity.id || second === centerEntity.id) {
        const otherId = first === centerEntity.id ? second : first;
        upsertNeighborNode(neighborMap, entityById, otherId);

        const edgeId = `${relationship.id}_${centerEntity.id}_${otherId}`;
        edgeMap.set(edgeId, {
          id: edgeId,
          source: centerEntity.id,
          target: otherId,
          relation: relationship.schema
        });
      }
    }
  }

  return {
    centerNode,
    neighborNodes: [...neighborMap.values()],
    connectingEdges: [...edgeMap.values()]
  };
}
