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
import { fetchEntityRelationshipsPaginated } from "./neighborhoodFetch";
import {
  collectRelationshipReferences,
  mergeSnapshot,
  removeEntityFromSnapshot
} from "./snapshotUtils";

interface NeighborhoodQueryResult {
  centerId: string;
  neighborhood: EntityNeighborhood;
  relationshipEntities: FtMEntity[];
  entitiesForSnapshot: FtMEntity[];
  partialRelationshipsLoaded: boolean;
  partialLoadMessage: string | null;
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

  const [snapshotSearchInput, setSnapshotSearchInput] = useState("");
  const [snapshotActiveQuery, setSnapshotActiveQuery] = useState("");
  const [globalSearchInput, setGlobalSearchInput] = useState("");
  const [globalActiveQuery, setGlobalActiveQuery] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [entitySelectionVersion, setEntitySelectionVersion] = useState(0);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null);
  const [displayNeighborhood, setDisplayNeighborhood] = useState<EntityNeighborhood | null>(null);
  const [isSnapshotResultsCollapsed, setIsSnapshotResultsCollapsed] = useState(false);
  const [isGlobalResultsCollapsed, setIsGlobalResultsCollapsed] = useState(false);
  const [rendererId, setRendererId] = useState<GraphRendererId>(() => getInitialGraphRendererId());
  const [workingSnapshot, setWorkingSnapshot] = useState<ProjectSnapshot | null>(null);
  const [isSnapshotDirty, setIsSnapshotDirty] = useState(false);
  const [partialNeighborhoodMessage, setPartialNeighborhoodMessage] = useState<string | null>(null);

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
    setEntitySelectionVersion(0);
    setSelectedRelationshipId(null);
    setDisplayNeighborhood(null);
    setSnapshotSearchInput("");
    setSnapshotActiveQuery("");
    setGlobalSearchInput("");
    setGlobalActiveQuery("");
    setIsSnapshotResultsCollapsed(false);
    setIsGlobalResultsCollapsed(false);
    setIsSnapshotDirty(false);
    setPartialNeighborhoodMessage(null);
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

  const snapshotSearchQuery = useQuery({
    queryKey: ["entity-search", projectId, snapshotActiveQuery],
    queryFn: () =>
      apiClient.searchEntities({
        q: snapshotActiveQuery,
        page: 1,
        pageSize: 50,
        fuzzy: true
      }),
    enabled: snapshotActiveQuery.trim().length > 0
  });

  const scopedSearchHits = useMemo<EntitySearchHit[]>(() => {
    const entities = snapshotSearchQuery.data?.results ?? [];

    return entities
      .filter((entity) => searchableSnapshotIds.has(entity.id))
      .map((entity) => mapEntityToSearchHit(entity));
  }, [snapshotSearchQuery.data, searchableSnapshotIds]);

  const globalSearchQuery = useQuery({
    queryKey: ["entity-search-global", projectId, globalActiveQuery],
    queryFn: () =>
      apiClient.searchEntities({
        q: globalActiveQuery,
        page: 1,
        pageSize: 50,
        fuzzy: true
      }),
    enabled: globalActiveQuery.trim().length > 0
  });

  const globalSearchHits = useMemo<EntitySearchHit[]>(() => {
    return (globalSearchQuery.data?.results ?? []).map((entity) => mapEntityToSearchHit(entity));
  }, [globalSearchQuery.data]);

  const loadEntityNeighborhood = useCallback(
    async (targetEntityId: string): Promise<NeighborhoodQueryResult> => {
      const [centerEntity, relationshipsResult] = await Promise.all([
        apiClient.getEntity(targetEntityId),
        fetchEntityRelationshipsPaginated(apiClient, targetEntityId, 1)
      ]);

      const relationshipEntities = relationshipsResult.relationships;
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
        entitiesForSnapshot: [...entitiesForSnapshot.values()],
        partialRelationshipsLoaded: relationshipsResult.partialRelationshipsLoaded,
        partialLoadMessage: relationshipsResult.partialLoadMessage
      };
    },
    [snapshotEntityMap]
  );

  const neighborhoodQuery = useQuery({
    queryKey: ["entity-neighborhood", projectId, selectedEntityId, entitySelectionVersion],
    enabled: Boolean(projectId && selectedEntityId),
    queryFn: async (): Promise<NeighborhoodQueryResult> => loadEntityNeighborhood(selectedEntityId!)
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

    setPartialNeighborhoodMessage(neighborhoodQuery.data.partialLoadMessage);
    setDisplayNeighborhood(neighborhoodQuery.data.neighborhood);

    let changed = false;
    setWorkingSnapshot((current) => {
      const base = current ?? projectQuery.data?.snapshot ?? createEmptySnapshot();
      const merged = mergeSnapshot(base, neighborhoodQuery.data.entitiesForSnapshot, {
        renderer: rendererId,
        last_selected_entity: selectedEntityId
      });
      changed = merged.changed;
      return merged.snapshot;
    });
    if (changed) {
      setIsSnapshotDirty(true);
    }
  }, [neighborhoodQuery.data, selectedEntityId, projectQuery.data, rendererId]);

  useEffect(() => {
    if (neighborhoodQuery.error instanceof Error) {
      setPartialNeighborhoodMessage(null);
    }
  }, [neighborhoodQuery.error]);

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

      const fromGlobalSearch = globalSearchHits.find((hit) => hit.entityId === entityId);
      if (fromGlobalSearch) {
        return fromGlobalSearch.label;
      }

      const fromSnapshot = snapshotEntityMap.get(entityId);
      if (fromSnapshot) {
        return getEntityLabel(fromSnapshot);
      }

      return "";
    },
    [displayNeighborhood, globalSearchHits, scopedSearchHits, snapshotEntityMap]
  );

  const selectEntity = useCallback(
    (entityId: string, explicitLabel?: string): void => {
      const fullLabel = resolveEntityLabel(entityId, explicitLabel);

      setSelectedEntityId(entityId);
      setEntitySelectionVersion((current) => current + 1);
      setSelectedRelationshipId(null);
      setDisplayNeighborhood(null);
      setPartialNeighborhoodMessage(null);
      if (fullLabel) {
        setSnapshotSearchInput(fullLabel);
        setGlobalSearchInput(fullLabel);
      }

      setIsSnapshotResultsCollapsed(true);
      setSnapshotActiveQuery("");
    },
    [resolveEntityLabel]
  );

  const submitSnapshotSearch = (event: FormEvent): void => {
    event.preventDefault();

    const trimmed = snapshotSearchInput.trim();
    setSnapshotActiveQuery(trimmed);
    setIsSnapshotResultsCollapsed(false);
  };

  const submitGlobalSearch = (event: FormEvent): void => {
    event.preventDefault();

    const trimmed = globalSearchInput.trim();
    setGlobalActiveQuery(trimmed);
    setIsGlobalResultsCollapsed(false);
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

  const onAddGlobalEntity = (entityId: string, label: string): void => {
    setIsGlobalResultsCollapsed(true);
    selectEntity(entityId, label);
  };

  const onRemoveSnapshotEntity = (entityId: string): void => {
    let changed = false;
    let removedRelationshipIds: string[] = [];

    setWorkingSnapshot((current) => {
      const base = current ?? projectQuery.data?.snapshot ?? createEmptySnapshot();
      const result = removeEntityFromSnapshot(base, entityId);
      changed = result.changed;
      removedRelationshipIds = result.removedRelationshipIds;
      return result.snapshot;
    });

    if (!changed) {
      return;
    }

    setIsSnapshotDirty(true);

    if (selectedEntityId === entityId) {
      setSelectedEntityId(null);
      setDisplayNeighborhood(null);
      setPartialNeighborhoodMessage(null);
    }

    if (selectedRelationshipId && removedRelationshipIds.includes(selectedRelationshipId)) {
      setSelectedRelationshipId(null);
    }
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
      setIsSnapshotDirty(false);
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

  const snapshotEntities = useMemo(() => {
    const entities = workingSnapshot?.entities ?? projectQuery.data?.snapshot.entities ?? [];
    return [...entities].sort((a, b) => getEntityLabel(a).localeCompare(getEntityLabel(b)));
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
            {projectQuery.data.name} - curated snapshot graph powered by live backend entities.
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
            {saveSnapshotMutation.isPending ? "Saving..." : isSnapshotDirty ? "Save Snapshot *" : "Save Snapshot"}
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info">
        Flow: search snapshot or global entities, add or remove from snapshot, then save to persist graph state.
      </Alert>

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
          {isSnapshotDirty && !saveSnapshotMutation.isPending && (
            <Alert sx={{ mt: 2 }} severity="warning">
              Snapshot has unsaved changes.
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

        <form onSubmit={submitSnapshotSearch}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              fullWidth
              label="Search within snapshot"
              placeholder="e.g. Eleanor Grant"
              value={snapshotSearchInput}
              onChange={(event) => setSnapshotSearchInput(event.target.value)}
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={<SearchIcon />}
              disabled={snapshotSearchInput.trim().length === 0}
            >
              Search Snapshot
            </Button>
          </Stack>
        </form>

        <Divider sx={{ my: 2 }} />

        {snapshotSearchQuery.isFetching && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2">Searching snapshot entities...</Typography>
          </Stack>
        )}

        {snapshotSearchQuery.error instanceof Error && (
          <Alert severity="error">{snapshotSearchQuery.error.message}</Alert>
        )}

        {!isSnapshotResultsCollapsed && snapshotActiveQuery && (
          <>
            {scopedSearchHits.length === 0 ? (
              <Alert severity="info">
                No snapshot entity matches for "{snapshotActiveQuery}".
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

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Global Backend Search
        </Typography>

        <form onSubmit={submitGlobalSearch}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              fullWidth
              label="Search all visible backend entities"
              placeholder="e.g. Acme Corp"
              value={globalSearchInput}
              onChange={(event) => setGlobalSearchInput(event.target.value)}
            />
            <Button
              type="submit"
              variant="outlined"
              startIcon={<SearchIcon />}
              disabled={globalSearchInput.trim().length === 0}
            >
              Search Global
            </Button>
          </Stack>
        </form>

        {globalSearchQuery.isFetching && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2">Searching backend entities...</Typography>
          </Stack>
        )}

        {globalSearchQuery.error instanceof Error && (
          <Alert sx={{ mt: 2 }} severity="error">
            {globalSearchQuery.error.message}
          </Alert>
        )}

        {!isGlobalResultsCollapsed && globalActiveQuery && (
          <>
            {globalSearchHits.length === 0 ? (
              <Alert sx={{ mt: 2 }} severity="info">
                No global entities match "{globalActiveQuery}".
              </Alert>
            ) : (
              <List dense sx={{ border: "1px solid #e1e7f3", borderRadius: 1, mt: 2 }}>
                {globalSearchHits.map((hit) => (
                  <ListItem key={hit.entityId} disableGutters>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      alignItems={{ xs: "stretch", sm: "center" }}
                      justifyContent="space-between"
                      sx={{ width: "100%" }}
                    >
                      <ListItemText primary={hit.label} secondary={`${hit.type} - ${hit.entityId}`} />
                      <Stack direction="row" spacing={1}>
                        <Button size="small" variant="outlined" onClick={() => selectEntity(hit.entityId, hit.label)}>
                          Inspect
                        </Button>
                        <Button size="small" variant="contained" onClick={() => onAddGlobalEntity(hit.entityId, hit.label)}>
                          Add to Snapshot
                        </Button>
                      </Stack>
                    </Stack>
                  </ListItem>
                ))}
              </List>
            )}
          </>
        )}
      </Paper>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Snapshot Curation
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Remove entities from this project snapshot. Relationship entities tied to removed nodes are also removed.
            </Typography>
            {snapshotEntities.length === 0 ? (
              <Alert severity="info">Snapshot currently has no entities.</Alert>
            ) : (
              <List dense sx={{ border: "1px solid #e1e7f3", borderRadius: 1, maxHeight: 260, overflowY: "auto" }}>
                {snapshotEntities.map((entity) => (
                  <ListItem key={entity.id} disableGutters>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      alignItems={{ xs: "stretch", sm: "center" }}
                      justifyContent="space-between"
                      sx={{ width: "100%" }}
                    >
                      <ListItemText
                        primary={getEntityLabel(entity)}
                        secondary={`${entity.schema} - ${entity.id}`}
                      />
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={() => onRemoveSnapshotEntity(entity.id)}
                      >
                        Remove
                      </Button>
                    </Stack>
                  </ListItem>
                ))}
              </List>
            )}
          </Stack>
        </CardContent>
      </Card>

      {selectedEntityId && neighborhoodQuery.isFetching && (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={22} />
          <Typography>Loading entity neighborhood...</Typography>
        </Stack>
      )}

      {neighborhoodQuery.error instanceof Error && (
        <Alert severity="error">
          Could not load live relationships for this entity. Please try Inspect again. Backend error:{" "}
          {neighborhoodQuery.error.message}
        </Alert>
      )}

      {partialNeighborhoodMessage && (
        <Alert severity="info">{partialNeighborhoodMessage}</Alert>
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
          Select an entity from snapshot or global search to render its live relationship neighborhood.
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
