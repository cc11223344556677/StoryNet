import type { FtMEntity, GraphEdge, GraphNode } from "../../types/domain";
import { getEntityLabel, isLikelyRelationshipSchema } from "../../api/mappers";
import { collectRelationshipReferences } from "./snapshotUtils";

export interface SnapshotGraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function mapEntityToNode(entity: FtMEntity): GraphNode {
  return {
    id: entity.id,
    label: getEntityLabel(entity),
    type: entity.schema
  };
}

export function buildGraphFromSnapshot(entities: FtMEntity[]): SnapshotGraphModel {
  const nodeById = new Map<string, GraphNode>();
  const relationshipEntities: FtMEntity[] = [];

  for (const entity of entities) {
    if (isLikelyRelationshipSchema(entity.schema)) {
      relationshipEntities.push(entity);
      continue;
    }

    nodeById.set(entity.id, mapEntityToNode(entity));
  }

  const edgeById = new Map<string, GraphEdge>();

  for (const relationship of relationshipEntities) {
    const references = collectRelationshipReferences(relationship).filter((id) => nodeById.has(id));
    if (references.length < 2) {
      continue;
    }

    const anchorId = references[0];
    for (let index = 1; index < references.length; index += 1) {
      const targetId = references[index];
      if (targetId === anchorId) {
        continue;
      }

      const edgeId = `${relationship.id}:${anchorId}:${targetId}:${index}`;
      edgeById.set(edgeId, {
        id: edgeId,
        source: anchorId,
        target: targetId,
        relation: relationship.schema,
        relationship_entity_id: relationship.id
      });
    }
  }

  return {
    nodes: [...nodeById.values()],
    edges: [...edgeById.values()]
  };
}
