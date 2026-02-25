import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SearchIcon from "@mui/icons-material/Search";
import SaveIcon from "@mui/icons-material/Save";
import type {
  DocumentDto,
  EntityNeighborhood,
  EntitySearchHit,
  FtMEntity,
  ProjectSnapshot
} from "../../types/domain";
import { apiClient } from "../../api/factory";
import {
  buildNeighborhood,
  getEntityLabel,
  isLikelyRelationshipSchema,
  mapEntityToSearchHit
} from "../../api/mappers";
import { formatApiDate } from "../../lib/date";
import { GraphRendererHost } from "./renderers/GraphRendererHost";
import { graphRendererDefinitions } from "./renderers/registry";
import { getInitialGraphRendererId, persistGraphRendererId } from "./renderers/rendererConfig";
import type { GraphRendererId } from "./renderers/types";

const ENTITY_ID_LIKE_PATTERN = /^[A-Za-z0-9._:-]{3,}$/;

interface NeighborhoodQueryResult {
  centerId: string;
  neighborhood: EntityNeighborhood;
  relationshipEntities: FtMEntity[];
  entitiesForSnapshot: FtMEntity[];
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

  return trimmed.includes("_") || trimmed.includes(":") || trimmed.includes("-") || /^[0-9a-fA-F]{8,}$/.test(trimmed);
}

function collectRelationshipReferences(relationship: FtMEntity): string[] {
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

function mergeSnapshot(base: ProjectSnapshot, newEntities: FtMEntity[], viewportPatch: Record<string, unknown>): ProjectSnapshot {
  const byId = new Map<string, FtMEntity>(base.entities.map((entity) => [entity.id, entity]));

  for (const entity of newEntities) {
    byId.set(entity.id, entity);
  }

  return {
    entities: [...byId.values()],
    viewport: {
      ...(base.viewport ?? {}),
      ...viewportPatch
    }
  };
}

function createEmptySnapshot(): ProjectSnapshot {
  return {
    entities: [],
    viewport: {}
  };
}

function formatSourceDocumentLine(document: DocumentDto): string {
  const createdAt = formatApiDate(document.created_at);
  return `${document.status} - ${document.type} - ${createdAt}`;
}

export function ProjectGraphPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [displayNeighborhood, setDisplayNeighborhood] = useState<EntityNeighborhood | null>(null);
  const [isResultsCollapsed, setIsResultsCollapsed] = useState(false);
  const [rendererId, setRendererId] = useState<GraphRendererId>(() => getInitialGraphRendererId());
  const [workingSnapshot, setWorkingSnapshot] = useState<ProjectSnapshot | null>(null);

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => apiClient.getProject(projectId!),
    enabled: Boolean(projectId)
  });

  useEffect(() => {
    if (!projectQuery.data) {
      return;
    }

    setWorkingSnapshot(projectQuery.data.snapshot);
    setSelectedEntityId(null);
    setSelectedRelationshipId(null);
    setDisplayNeighborhood(null);
    setSearchInput("");
    setActiveQuery("");
    setIsResultsCollapsed(false);
  }, [projectQuery.data?.id]);

  const snapshotEntityMap = useMemo(() => {
    const map = new Map<string, FtMEntity>();
    const entities = workingSnapshot?.entities ?? projectQuery.data?.snapshot.entities ?? [];

    for (const entity of entities) {
      map.set(entity.id, entity);
    }

    return map;
  }, [workingSnapshot, projectQuery.data]);

  const searchableSnapshotIds = useMemo(() => {
    const ids = new Set<string>();

    for (const entity of snapshotEntityMap.values()) {
      if (!isLikelyRelationshipSchema(entity.schema)) {
        ids.add(entity.id);
      }
    }

    return ids;
  }, [snapshotEntityMap]);

  const searchQuery = useQuery({
    queryKey: ["entity-search", projectId, activeQuery],
    queryFn: () =>
      apiClient.searchEntities({
        q: activeQuery,
        page: 1,
        pageSize: 50,
        fuzzy: true
      }),
    enabled: activeQuery.trim().length > 0
  });

  const scopedSearchHits = useMemo<EntitySearchHit[]>(() => {
    const entities = searchQuery.data?.results ?? [];

    return entities
      .filter((entity) => searchableSnapshotIds.has(entity.id))
      .map((entity) => mapEntityToSearchHit(entity));
  }, [searchQuery.data, searchableSnapshotIds]);

  const neighborhoodQuery = useQuery({
    queryKey: ["entity-neighborhood", projectId, selectedEntityId],
    enabled: Boolean(projectId && selectedEntityId),
    queryFn: async (): Promise<NeighborhoodQueryResult> => {
      const targetEntityId = selectedEntityId!;

      const [centerEntity, relationshipsResponse] = await Promise.all([
        apiClient.getEntity(targetEntityId),
        apiClient.getEntityRelationships(targetEntityId, 1, 1, 200)
      ]);

      const relationshipEntities = relationshipsResponse.results;
      const entityById = new Map<string, FtMEntity>(snapshotEntityMap);
      entityById.set(centerEntity.id, centerEntity);

      const referencedIds = new Set<string>();
      for (const relationship of relationshipEntities) {
        for (const refId of collectRelationshipReferences(relationship)) {
          if (refId !== centerEntity.id) {
            referencedIds.add(refId);
          }
        }
      }

      const missingEntityIds = [...referencedIds].filter((id) => !entityById.has(id));

      if (missingEntityIds.length > 0) {
        const fetched = await Promise.allSettled(missingEntityIds.map((id) => apiClient.getEntity(id)));

        for (const result of fetched) {
          if (result.status === "fulfilled") {
            entityById.set(result.value.id, result.value);
          }
        }
      }

      const neighborhood = buildNeighborhood(centerEntity, relationshipEntities, entityById);

      const entitiesForSnapshot = new Map<string, FtMEntity>();
      entitiesForSnapshot.set(centerEntity.id, centerEntity);

      for (const relationship of relationshipEntities) {
        entitiesForSnapshot.set(relationship.id, relationship);
      }

      for (const node of neighborhood.neighborNodes) {
        const entity = entityById.get(node.id);
        if (entity) {
          entitiesForSnapshot.set(entity.id, entity);
        }
      }

      return {
        centerId: centerEntity.id,
        neighborhood,
        relationshipEntities,
        entitiesForSnapshot: [...entitiesForSnapshot.values()]
      };
    }
  });

  const entityDocumentsQuery = useQuery({
    queryKey: ["entity-documents", selectedEntityId],
    queryFn: () => apiClient.getEntityDocuments(selectedEntityId!, 1, 50),
    enabled: Boolean(selectedEntityId)
  });

  const relationshipDetailQuery = useQuery({
    queryKey: ["relationship-detail", selectedRelationshipId],
    queryFn: () => apiClient.getRelationship(selectedRelationshipId!),
    enabled: Boolean(selectedRelationshipId)
  });

  const relationshipDocumentsQuery = useQuery({
    queryKey: ["relationship-documents", selectedRelationshipId],
    queryFn: () => apiClient.getRelationshipDocuments(selectedRelationshipId!, 1, 50),
    enabled: Boolean(selectedRelationshipId)
  });

  useEffect(() => {
    if (!neighborhoodQuery.data || !selectedEntityId) {
      return;
    }

    if (neighborhoodQuery.data.centerId !== selectedEntityId) {
      return;
    }

    setDisplayNeighborhood(neighborhoodQuery.data.neighborhood);

    setWorkingSnapshot((current) => {
      const base = current ?? projectQuery.data?.snapshot ?? createEmptySnapshot();
      return mergeSnapshot(base, neighborhoodQuery.data.entitiesForSnapshot, {
        renderer: rendererId,
        last_selected_entity: selectedEntityId
      });
    });
  }, [neighborhoodQuery.data, selectedEntityId, projectQuery.data, rendererId]);

  useEffect(() => {
    const relationships = neighborhoodQuery.data?.relationshipEntities ?? [];
    if (relationships.length === 0) {
      setSelectedRelationshipId(null);
      return;
    }

    const hasSelected = selectedRelationshipId
      ? relationships.some((relationship) => relationship.id === selectedRelationshipId)
      : false;

    if (!hasSelected) {
      setSelectedRelationshipId(relationships[0].id);
    }
  }, [neighborhoodQuery.data, selectedRelationshipId]);

  const relationshipEntities = neighborhoodQuery.data?.relationshipEntities ?? [];

  const selectedRelationshipFromNeighborhood = useMemo(() => {
    if (!selectedRelationshipId) {
      return null;
    }

    return (
      relationshipEntities.find((relationship) => relationship.id === selectedRelationshipId) ?? null
    );
  }, [relationshipEntities, selectedRelationshipId]);

  const resolveEntityLabel = useCallback(
    (entityId: string, explicitLabel?: string): string => {
      const fromClick = explicitLabel?.trim();
      if (fromClick) {
        return fromClick;
      }

      if (displayNeighborhood) {
        if (displayNeighborhood.centerNode.id === entityId) {
          return displayNeighborhood.centerNode.label;
        }

        const neighbor = displayNeighborhood.neighborNodes.find((node) => node.id === entityId);
        if (neighbor) {
          return neighbor.label;
        }
      }

      const fromSearch = scopedSearchHits.find((hit) => hit.entityId === entityId);
      if (fromSearch) {
        return fromSearch.label;
      }

      const fromSnapshot = snapshotEntityMap.get(entityId);
      if (fromSnapshot) {
        return getEntityLabel(fromSnapshot);
      }

      return "";
    },
    [displayNeighborhood, scopedSearchHits, snapshotEntityMap]
  );

  const selectEntity = useCallback(
    (entityId: string, explicitLabel?: string): void => {
      const fullLabel = resolveEntityLabel(entityId, explicitLabel);

      setSelectedEntityId(entityId);
      setSelectedRelationshipId(null);
      if (fullLabel) {
        setSearchInput(fullLabel);
      }

      setIsResultsCollapsed(true);
      setActiveQuery("");
    },
    [resolveEntityLabel]
  );

  const submitSearch = (event: FormEvent): void => {
    event.preventDefault();

    const trimmed = searchInput.trim();
    setActiveQuery(trimmed);
    setIsResultsCollapsed(false);
  };

  const handleNodeClick = useCallback(
    (nodeId: string, nodeLabel: string): void => {
      selectEntity(nodeId, nodeLabel);
    },
    [selectEntity]
  );

  const onSelectRelationship = (relationshipId: string): void => {
    setSelectedRelationshipId(relationshipId);
  };

  const handleRendererChange = (event: SelectChangeEvent<GraphRendererId>): void => {
    const nextRenderer = event.target.value as GraphRendererId;
    setRendererId(nextRenderer);
    persistGraphRendererId(nextRenderer);
  };

  const saveSnapshotMutation = useMutation({
    mutationFn: async () => {
      if (!projectId || !projectQuery.data) {
        throw new Error("Project is not loaded.");
      }

      const baseSnapshot = workingSnapshot ?? projectQuery.data.snapshot;

      return apiClient.updateProject(projectId, {
        name: projectQuery.data.name,
        description: projectQuery.data.description,
        snapshot: {
          entities: baseSnapshot.entities,
          viewport: {
            ...(baseSnapshot.viewport ?? {}),
            renderer: rendererId,
            last_selected_entity: selectedEntityId,
            saved_at: new Date().toISOString(),
            saved_from: "graph"
          }
        }
      });
    },
    onSuccess: async (updatedProject) => {
      setWorkingSnapshot(updatedProject.snapshot);
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const snapshotStats = useMemo(() => {
    const entities = workingSnapshot?.entities ?? projectQuery.data?.snapshot.entities ?? [];
    const relationshipCount = entities.filter((entity) => isLikelyRelationshipSchema(entity.schema)).length;
    const nodeCount = Math.max(0, entities.length - relationshipCount);

    return {
      total: entities.length,
      nodeCount,
      relationshipCount
    };
  }, [workingSnapshot, projectQuery.data]);

  const selectedEntityLabel = selectedEntityId ? resolveEntityLabel(selectedEntityId) : "";

  if (!projectId) {
    return <Alert severity="error">Project id is missing from route.</Alert>;
  }

  if (projectQuery.isLoading) {
    return (
      <Stack direction="row" spacing={1.2} alignItems="center">
        <CircularProgress size={24} />
        <Typography>Loading project graph workspace...</Typography>
      </Stack>
    );
  }

  if (projectQuery.error instanceof Error) {
    return <Alert severity="error">{projectQuery.error.message}</Alert>;
  }

  if (!projectQuery.data) {
    return <Alert severity="error">Project not found.</Alert>;
  }

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={2}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Graph Explorer
          </Typography>
          <Typography color="text.secondary">
            {projectQuery.data.name} - project-scoped entity search from this snapshot.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.2}>
          <Button
            component={RouterLink}
            to={`/projects/${projectQuery.data.id}`}
            variant="outlined"
            startIcon={<ArrowBackIcon />}
          >
            Project
          </Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={() => saveSnapshotMutation.mutate()}
            disabled={saveSnapshotMutation.isPending}
          >
            {saveSnapshotMutation.isPending ? "Saving..." : "Save Snapshot"}
          </Button>
        </Stack>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Snapshot Entities
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {snapshotStats.total}
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Node Entities
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {snapshotStats.nodeCount}
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Relationship Entities
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {snapshotStats.relationshipCount}
              </Typography>
            </Box>
          </Stack>

          {saveSnapshotMutation.error instanceof Error && (
            <Alert sx={{ mt: 2 }} severity="error">
              {saveSnapshotMutation.error.message}
            </Alert>
          )}
          {saveSnapshotMutation.isSuccess && (
            <Alert sx={{ mt: 2 }} severity="success">
              Snapshot saved to backend project store.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
          sx={{ mb: 2 }}
        >
          <Typography variant="subtitle2" color="text.secondary">
            Visualization Renderer
          </Typography>

          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="renderer-select-label">Renderer</InputLabel>
            <Select
              labelId="renderer-select-label"
              label="Renderer"
              value={rendererId}
              onChange={handleRendererChange}
            >
              {graphRendererDefinitions.map((renderer) => (
                <MenuItem key={renderer.id} value={renderer.id}>
                  {renderer.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        <form onSubmit={submitSearch}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              fullWidth
              label="Search entity in this project snapshot"
              placeholder="e.g. Eleanor Grant"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={<SearchIcon />}
              disabled={searchInput.trim().length === 0}
            >
              Search
            </Button>
          </Stack>
        </form>

        <Divider sx={{ my: 2 }} />

        {searchQuery.isFetching && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2">Searching live entities...</Typography>
          </Stack>
        )}

        {searchQuery.error instanceof Error && <Alert severity="error">{searchQuery.error.message}</Alert>}

        {!isResultsCollapsed && activeQuery && (
          <>
            {scopedSearchHits.length === 0 ? (
              <Alert severity="info">
                No snapshot entity matches for "{activeQuery}".
              </Alert>
            ) : (
              <List dense sx={{ border: "1px solid #e1e7f3", borderRadius: 1, mb: 2 }}>
                {scopedSearchHits.map((hit) => (
                  <ListItemButton
                    key={hit.entityId}
                    selected={selectedEntityId === hit.entityId}
                    onClick={() => selectEntity(hit.entityId, hit.label)}
                  >
                    <ListItemText primary={hit.label} secondary={hit.type} />
                  </ListItemButton>
                ))}
              </List>
            )}
          </>
        )}
      </Paper>

      {selectedEntityId && neighborhoodQuery.isFetching && (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={22} />
          <Typography>Loading entity neighborhood...</Typography>
        </Stack>
      )}

      {neighborhoodQuery.error instanceof Error && (
        <Alert severity="error">
          Backend unavailable for this operation: {neighborhoodQuery.error.message}
        </Alert>
      )}

      {displayNeighborhood ? (
        <Box className="graph-panel">
          <GraphRendererHost
            rendererId={rendererId}
            neighborhood={displayNeighborhood}
            selectedNodeId={selectedEntityId}
            onNodeClick={handleNodeClick}
          />
        </Box>
      ) : (
        <Alert severity="info">
          Search a project entity and select it to render its live relationship neighborhood.
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Entity Source Documents
            </Typography>

            {selectedEntityId ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  Selected entity: {selectedEntityLabel || selectedEntityId}
                </Typography>

                {entityDocumentsQuery.isLoading ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={18} />
                    <Typography>Loading source documents for entity...</Typography>
                  </Stack>
                ) : entityDocumentsQuery.error instanceof Error ? (
                  <Alert severity="error">
                    Backend unavailable for this operation: {entityDocumentsQuery.error.message}
                  </Alert>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Total source documents: {entityDocumentsQuery.data?.total ?? 0}
                    </Typography>
                    <List dense>
                      {(entityDocumentsQuery.data?.results ?? []).map((document) => (
                        <ListItem key={document.id} disableGutters>
                          <ListItemText
                            primary={document.filename}
                            secondary={formatSourceDocumentLine(document)}
                          />
                        </ListItem>
                      ))}
                      {(entityDocumentsQuery.data?.results.length ?? 0) === 0 && (
                        <ListItem disableGutters>
                          <ListItemText primary="No source documents returned for this entity." />
                        </ListItem>
                      )}
                    </List>
                  </>
                )}
              </>
            ) : (
              <Alert severity="info">
                Select an entity node to load source documents from backend.
              </Alert>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Relationship Source Documents
            </Typography>

            {relationshipEntities.length === 0 ? (
              <Alert severity="info">
                No relationship entities are loaded for the current neighborhood.
              </Alert>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary">
                  Select a relationship entity to view its metadata and source documents.
                </Typography>

                <List dense sx={{ border: "1px solid #e1e7f3", borderRadius: 1, maxHeight: 220, overflowY: "auto" }}>
                  {relationshipEntities.map((relationship) => (
                    <ListItemButton
                      key={relationship.id}
                      selected={relationship.id === selectedRelationshipId}
                      onClick={() => onSelectRelationship(relationship.id)}
                    >
                      <ListItemText
                        primary={getEntityLabel(relationship)}
                        secondary={`${relationship.schema} - ${relationship.id}`}
                      />
                    </ListItemButton>
                  ))}
                </List>

                {relationshipDetailQuery.isLoading && selectedRelationshipId && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={18} />
                    <Typography>Loading relationship details...</Typography>
                  </Stack>
                )}

                {relationshipDetailQuery.error instanceof Error && (
                  <Alert severity="error">
                    Backend unavailable for this operation: {relationshipDetailQuery.error.message}
                  </Alert>
                )}

                {relationshipDetailQuery.data && (
                  <Stack spacing={0.5}>
                    <Typography variant="body2">
                      <strong>Relationship:</strong> {getEntityLabel(relationshipDetailQuery.data)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Schema:</strong> {relationshipDetailQuery.data.schema}
                    </Typography>
                    <Typography variant="body2">
                      <strong>ID:</strong> {relationshipDetailQuery.data.id}
                    </Typography>
                  </Stack>
                )}

                {selectedRelationshipId && relationshipDocumentsQuery.isLoading && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={18} />
                    <Typography>Loading relationship source documents...</Typography>
                  </Stack>
                )}

                {relationshipDocumentsQuery.error instanceof Error && (
                  <Alert severity="error">
                    Backend unavailable for this operation: {relationshipDocumentsQuery.error.message}
                  </Alert>
                )}

                {selectedRelationshipId &&
                  !relationshipDocumentsQuery.isLoading &&
                  !(relationshipDocumentsQuery.error instanceof Error) && (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Total source documents: {relationshipDocumentsQuery.data?.total ?? 0}
                    </Typography>
                    <List dense>
                      {(relationshipDocumentsQuery.data?.results ?? []).map((document) => (
                        <ListItem key={document.id} disableGutters>
                          <ListItemText
                            primary={document.filename}
                            secondary={formatSourceDocumentLine(document)}
                          />
                        </ListItem>
                      ))}
                      {(relationshipDocumentsQuery.data?.results.length ?? 0) === 0 && (
                        <ListItem disableGutters>
                          <ListItemText primary="No source documents returned for this relationship." />
                        </ListItem>
                      )}
                    </List>
                  </>
                )}

                {!selectedRelationshipId && (
                  <Alert severity="info">
                    Select a relationship entity to request backend source documents.
                  </Alert>
                )}

                {!relationshipDetailQuery.data && selectedRelationshipFromNeighborhood && !relationshipDetailQuery.isLoading && (
                  <Typography variant="body2" color="text.secondary">
                    Selected relationship: {getEntityLabel(selectedRelationshipFromNeighborhood)}
                  </Typography>
                )}
              </>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
