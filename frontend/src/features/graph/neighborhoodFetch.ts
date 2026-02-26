import type { ApiClient, FtMEntity } from "../../types/domain";

export const ENTITY_RELATIONSHIPS_PAGE_SIZE = 100;
const MAX_RELATIONSHIPS_PAGES = 200;

export interface PaginatedRelationshipFetchResult {
  relationships: FtMEntity[];
  partialRelationshipsLoaded: boolean;
  partialLoadMessage: string | null;
}

function dedupeEntitiesById(entities: FtMEntity[]): FtMEntity[] {
  const byId = new Map<string, FtMEntity>();

  for (const entity of entities) {
    byId.set(entity.id, entity);
  }

  return [...byId.values()];
}

export async function fetchEntityRelationshipsPaginated(
  apiClient: ApiClient,
  entityId: string,
  depth = 1
): Promise<PaginatedRelationshipFetchResult> {
  const pages: FtMEntity[] = [];

  for (let page = 1; page <= MAX_RELATIONSHIPS_PAGES; page += 1) {
    try {
      const response = await apiClient.getEntityRelationships(
        entityId,
        depth,
        page,
        ENTITY_RELATIONSHIPS_PAGE_SIZE
      );

      pages.push(...response.results);
      if (
        response.results.length === 0 ||
        page * ENTITY_RELATIONSHIPS_PAGE_SIZE >= response.total
      ) {
        return {
          relationships: dedupeEntitiesById(pages),
          partialRelationshipsLoaded: false,
          partialLoadMessage: null
        };
      }
    } catch (error) {
      if (page === 1) {
        throw error;
      }

      return {
        relationships: dedupeEntitiesById(pages),
        partialRelationshipsLoaded: true,
        partialLoadMessage:
          "Some relationships could not be loaded from backend. Showing partial neighborhood."
      };
    }
  }

  return {
    relationships: dedupeEntitiesById(pages),
    partialRelationshipsLoaded: true,
    partialLoadMessage:
      "Some relationships could not be loaded from backend. Showing partial neighborhood."
  };
}
