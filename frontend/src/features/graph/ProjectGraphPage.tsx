import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
  EntitySearchHit,
  FtMEntity,
  ProjectSnapshot
} from "../../types/domain";
import { apiClient } from "../../api/factory";
import { sanitizeProjectSnapshotForWrite } from "../../api/projectWritePayload";
import {
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
import { buildGraphFromSnapshot } from "./fullSnapshotGraph";
import { GraphViewPreset, loadGraphViewPresets, saveGraphViewPresets } from "./viewPresets";
import {
  collectRelationshipReferences,
  mergeSnapshot,
  removeEntityFromSnapshot
} from "./snapshotUtils";

interface NeighborhoodQueryResult {
  centerId: string;
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

function buildDocumentInspectPath(documentId: string): string {
  return `/documents?inspect=${encodeURIComponent(documentId)}`;
}

function parseRelationshipIdFromEdgeId(edgeId: string): string | null {
  const separatorIndex = edgeId.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  return edgeId.slice(0, separatorIndex);
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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isSnapshotResultsCollapsed, setIsSnapshotResultsCollapsed] = useState(false);
  const [isGlobalResultsCollapsed, setIsGlobalResultsCollapsed] = useState(false);
  const [rendererId, setRendererId] = useState<GraphRendererId>(() => getInitialGraphRendererId());
  const [workingSnapshot, setWorkingSnapshot] = useState<ProjectSnapshot | null>(null);
  const [isSnapshotDirty, setIsSnapshotDirty] = useState(false);
  const [partialNeighborhoodMessage, setPartialNeighborhoodMessage] = useState<string | null>(null);
  const [hiddenSchemas, setHiddenSchemas] = useState<string[]>([]);
  const [viewPresets, setViewPresets] = useState<GraphViewPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetNameInput, setPresetNameInput] = useState("");

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
    setSelectedEdgeId(null);
    setSnapshotSearchInput("");
    setSnapshotActiveQuery("");
    setGlobalSearchInput("");
    setGlobalActiveQuery("");
    setIsSnapshotResultsCollapsed(false);
    setIsGlobalResultsCollapsed(false);
    setIsSnapshotDirty(false);
    setPartialNeighborhoodMessage(null);
    setHiddenSchemas([]);
    setViewPresets(loadGraphViewPresets(projectQuery.data.id));
    setSelectedPresetId("");
    setPresetNameInput("");
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

      const entitiesForSnapshot = new Map<string, FtMEntity>();
      entitiesForSnapshot.set(centerEntity.id, centerEntity);

      for (const relationship of relationshipEntities) {
        entitiesForSnapshot.set(relationship.id, relationship);
      }

      for (const referencedId of referencedIds) {
        const entity = entityById.get(referencedId);
        if (entity) {
          entitiesForSnapshot.set(entity.id, entity);
        }
      }

      return {
        centerId: centerEntity.id,
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

    setWorkingSnapshot((current) => {
      const base = current ?? projectQuery.data?.snapshot ?? createEmptySnapshot();
      const merged = mergeSnapshot(base, neighborhoodQuery.data.entitiesForSnapshot);
      if (merged.changed) {
        setIsSnapshotDirty(true);
      }
      return merged.snapshot;
    });
  }, [neighborhoodQuery.data, selectedEntityId, projectQuery.data]);

  useEffect(() => {
    if (neighborhoodQuery.error instanceof Error) {
      setPartialNeighborhoodMessage(null);
    }
  }, [neighborhoodQuery.error]);

  useEffect(() => {
    if (!selectedEntityId || !neighborhoodQuery.data) {
      return;
    }

    const relationships = neighborhoodQuery.data.relationshipEntities;
    if (relationships.length === 0) {
      if (selectedRelationshipId !== null) {
        setSelectedRelationshipId(null);
      }
      return;
    }

    if (
      selectedRelationshipId &&
      !relationships.some((relationship) => relationship.id === selectedRelationshipId)
    ) {
      setSelectedRelationshipId(null);
    }
  }, [neighborhoodQuery.data, selectedEntityId, selectedRelationshipId]);

  const relationshipEntities = neighborhoodQuery.data?.relationshipEntities ?? [];

  const selectedRelationshipFromNeighborhood = useMemo(() => {
    if (!selectedRelationshipId) {
      return null;
    }

    return (
      relationshipEntities.find((relationship) => relationship.id === selectedRelationshipId) ?? null
    );
  }, [relationshipEntities, selectedRelationshipId]);

  useEffect(() => {
    if (!selectedPresetId) {
      return;
    }

    const preset = viewPresets.find((item) => item.id === selectedPresetId);
    if (preset) {
      setPresetNameInput(preset.name);
    }
  }, [selectedPresetId, viewPresets]);

  const resolveEntityLabel = useCallback(
    (entityId: string, explicitLabel?: string): string => {
      const fromClick = explicitLabel?.trim();
      if (fromClick) {
        return fromClick;
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
    [globalSearchHits, scopedSearchHits, snapshotEntityMap]
  );

  const selectEntity = useCallback(
    (entityId: string, explicitLabel?: string): void => {
      const fullLabel = resolveEntityLabel(entityId, explicitLabel);

      setSelectedEntityId(entityId);
      setEntitySelectionVersion((current) => current + 1);
      setSelectedRelationshipId(null);
      setSelectedEdgeId(null);
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

  const onSelectEdge = useCallback(
    (edgeId: string): void => {
      setSelectedEdgeId(edgeId);

      const relationshipId = parseRelationshipIdFromEdgeId(edgeId);
      setSelectedRelationshipId(relationshipId);
    },
    []
  );

  const onAddGlobalEntity = (entityId: string, label: string): void => {
    setIsGlobalResultsCollapsed(true);
    selectEntity(entityId, label);
  };

  const onRemoveSnapshotEntity = (entityId: string): void => {
    const base = workingSnapshot ?? projectQuery.data?.snapshot ?? createEmptySnapshot();
    const result = removeEntityFromSnapshot(base, entityId);

    if (!result.changed) {
      return;
    }

    setWorkingSnapshot(result.snapshot);
    setIsSnapshotDirty(true);

    if (selectedEntityId === entityId) {
      setSelectedEntityId(null);
      setPartialNeighborhoodMessage(null);
    }

    if (selectedRelationshipId && result.removedRelationshipIds.includes(selectedRelationshipId)) {
      setSelectedRelationshipId(null);
      setSelectedEdgeId(null);
    }
  };

  const persistViewPresets = useCallback(
    (next: GraphViewPreset[]): void => {
      setViewPresets(next);
      if (projectQuery.data?.id) {
        saveGraphViewPresets(projectQuery.data.id, next);
      }
    },
    [projectQuery.data?.id]
  );

  const toggleSchemaVisibility = (schema: string): void => {
    setHiddenSchemas((current) => {
      if (current.includes(schema)) {
        return current.filter((value) => value !== schema);
      }
      return [...current, schema];
    });
  };

  const showAllSchemas = (): void => {
    setHiddenSchemas([]);
  };

  const hideAllSchemas = (): void => {
    setHiddenSchemas(snapshotSchemas);
  };

  const handleRendererChange = (event: SelectChangeEvent<GraphRendererId>): void => {
    const nextRenderer = event.target.value as GraphRendererId;
    setRendererId(nextRenderer);
    persistGraphRendererId(nextRenderer);
  };

  const handlePresetSelectionChange = (event: SelectChangeEvent<string>): void => {
    setSelectedPresetId(event.target.value);
  };

  const handleSavePreset = (): void => {
    const name = presetNameInput.trim();
    if (!name) {
      return;
    }

    const preset: GraphViewPreset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      rendererId,
      hiddenSchemas,
      snapshotSearchInput,
      globalSearchInput,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const next = [...viewPresets, preset];
    persistViewPresets(next);
    setSelectedPresetId(preset.id);
  };

  const handleApplyPreset = (): void => {
    const preset = viewPresets.find((item) => item.id === selectedPresetId);
    if (!preset) {
      return;
    }

    setRendererId(preset.rendererId);
    persistGraphRendererId(preset.rendererId);
    setHiddenSchemas(preset.hiddenSchemas);
    setSnapshotSearchInput(preset.snapshotSearchInput ?? "");
    setGlobalSearchInput(preset.globalSearchInput ?? "");
  };

  const handleRenamePreset = (): void => {
    const name = presetNameInput.trim();
    if (!selectedPresetId || !name) {
      return;
    }

    const next = viewPresets.map((preset) =>
      preset.id === selectedPresetId
        ? { ...preset, name, updatedAt: new Date().toISOString() }
        : preset
    );
    persistViewPresets(next);
  };

  const handleDeletePreset = (): void => {
    if (!selectedPresetId) {
      return;
    }

    const next = viewPresets.filter((preset) => preset.id !== selectedPresetId);
    persistViewPresets(next);
    setSelectedPresetId("");
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
        snapshot: sanitizeProjectSnapshotForWrite(baseSnapshot)
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

  const snapshotSchemas = useMemo(() => {
    const entities = workingSnapshot?.entities ?? projectQuery.data?.snapshot.entities ?? [];
    const schemas = new Set<string>();
    for (const entity of entities) {
      schemas.add(entity.schema);
    }
    return [...schemas].sort((a, b) => a.localeCompare(b));
  }, [workingSnapshot, projectQuery.data]);

  const filteredSnapshotEntities = useMemo(() => {
    const entities = workingSnapshot?.entities ?? projectQuery.data?.snapshot.entities ?? [];
    if (hiddenSchemas.length === 0) {
      return entities;
    }

    const hidden = new Set(hiddenSchemas);
    return entities.filter((entity) => !hidden.has(entity.schema));
  }, [hiddenSchemas, workingSnapshot, projectQuery.data]);

  const snapshotGraph = useMemo(() => {
    return buildGraphFromSnapshot(filteredSnapshotEntities);
  }, [filteredSnapshotEntities]);

  const selectedEntityLabel = selectedEntityId ? resolveEntityLabel(selectedEntityId) : "";

  useEffect(() => {
    setHiddenSchemas((current) => current.filter((schema) => snapshotSchemas.includes(schema)));
  }, [snapshotSchemas]);

  useEffect(() => {
    if (!selectedRelationshipId) {
      if (selectedEdgeId !== null) {
        setSelectedEdgeId(null);
      }
      return;
    }

    const matchingEdge = snapshotGraph.edges.find(
      (edge) => edge.relationship_entity_id === selectedRelationshipId
    );
    if (!matchingEdge) {
      if (selectedEdgeId !== null) {
        setSelectedEdgeId(null);
      }
      return;
    }

    if (matchingEdge.id !== selectedEdgeId) {
      setSelectedEdgeId(matchingEdge.id);
    }
  }, [selectedRelationshipId, selectedEdgeId, snapshotGraph.edges]);

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
              Could not save project snapshot. Backend error: {saveSnapshotMutation.error.message}
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

        <Divider sx={{ mb: 2 }} />

        <Stack spacing={1.5} sx={{ mb: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ sm: "center" }}>
            <Typography variant="subtitle2" color="text.secondary">
              Schema Visibility
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={showAllSchemas}>
                Show All
              </Button>
              <Button size="small" variant="outlined" onClick={hideAllSchemas} disabled={snapshotSchemas.length === 0}>
                Hide All
              </Button>
            </Stack>
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {snapshotSchemas.map((schema) => {
              const hidden = hiddenSchemas.includes(schema);
              return (
                <Chip
                  key={schema}
                  label={schema}
                  color={hidden ? "default" : "primary"}
                  variant={hidden ? "outlined" : "filled"}
                  onClick={() => toggleSchemaVisibility(schema)}
                />
              );
            })}
            {snapshotSchemas.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No schemas found in this snapshot.
              </Typography>
            )}
          </Stack>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Stack spacing={1.5} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            View Presets (Local Only)
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="preset-select-label">Preset</InputLabel>
              <Select
                labelId="preset-select-label"
                label="Preset"
                value={selectedPresetId}
                onChange={handlePresetSelectionChange}
              >
                <MenuItem value="">None</MenuItem>
                {viewPresets.map((preset) => (
                  <MenuItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Preset name"
              value={presetNameInput}
              onChange={(event) => setPresetNameInput(event.target.value)}
            />
            <Button size="small" variant="outlined" onClick={handleSavePreset} disabled={presetNameInput.trim().length === 0}>
              Save
            </Button>
            <Button size="small" variant="outlined" onClick={handleApplyPreset} disabled={!selectedPresetId}>
              Apply
            </Button>
            <Button size="small" variant="outlined" onClick={handleRenamePreset} disabled={!selectedPresetId || presetNameInput.trim().length === 0}>
              Rename
            </Button>
            <Button size="small" variant="outlined" color="error" onClick={handleDeletePreset} disabled={!selectedPresetId}>
              Delete
            </Button>
          </Stack>
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

      {snapshotGraph.nodes.length > 0 ? (
        <Box className="graph-panel">
          <GraphRendererHost
            rendererId={rendererId}
            graph={snapshotGraph}
            selectedNodeId={selectedEntityId}
            selectedEdgeId={selectedEdgeId}
            onNodeClick={handleNodeClick}
            onEdgeClick={onSelectEdge}
          />
        </Box>
      ) : (
        <Alert severity="info">
          This project snapshot has no graph entities yet. Use global search or document seeding to add entities.
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Source Documents
            </Typography>

            {selectedRelationshipId ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  Selected relationship: {selectedRelationshipId}
                </Typography>

                {relationshipDocumentsQuery.isLoading ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={18} />
                    <Typography>Loading source documents for relationship...</Typography>
                  </Stack>
                ) : relationshipDocumentsQuery.error instanceof Error ? (
                  <Alert severity="error">
                    Backend unavailable for this operation: {relationshipDocumentsQuery.error.message}
                  </Alert>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Total source documents: {relationshipDocumentsQuery.data?.total ?? 0}
                    </Typography>
                    <List dense>
                      {(relationshipDocumentsQuery.data?.results ?? []).map((document) => (
                        <ListItem key={document.id} disableGutters>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            alignItems={{ xs: "stretch", sm: "center" }}
                            justifyContent="space-between"
                            sx={{ width: "100%" }}
                          >
                            <ListItemText
                              primary={document.filename}
                              secondary={formatSourceDocumentLine(document)}
                            />
                            <Button
                              size="small"
                              variant="outlined"
                              component={RouterLink}
                              to={buildDocumentInspectPath(document.id)}
                            >
                              Inspect in Documents
                            </Button>
                          </Stack>
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
              </>
            ) : selectedEntityId ? (
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
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            alignItems={{ xs: "stretch", sm: "center" }}
                            justifyContent="space-between"
                            sx={{ width: "100%" }}
                          >
                            <ListItemText
                              primary={document.filename}
                              secondary={formatSourceDocumentLine(document)}
                            />
                            <Button
                              size="small"
                              variant="outlined"
                              component={RouterLink}
                              to={buildDocumentInspectPath(document.id)}
                            >
                              Inspect in Documents
                            </Button>
                          </Stack>
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
                Select an entity node or relationship edge to load source documents from backend.
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

            {!selectedEntityId && !selectedRelationshipId ? (
              <Alert severity="info">
                Select an entity node or relationship edge to load relationship details and source documents from backend.
              </Alert>
            ) : (
              <>
                {relationshipEntities.length > 0 ? (
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
                  </>
                ) : (
                  <Alert severity="info">
                    No relationship entities are loaded for the selected entity neighborhood yet.
                  </Alert>
                )}

                {relationshipDetailQuery.isLoading && selectedRelationshipId && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={18} />
                    <Typography>Loading relationship details...</Typography>
                  </Stack>
                )}

                {selectedRelationshipId && relationshipDetailQuery.error instanceof Error && (
                  <Alert severity="info">
                    Relationship metadata is temporarily unavailable from backend: {relationshipDetailQuery.error.message}
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

                {!selectedRelationshipId && (
                  <Alert severity="info">
                    Select a relationship edge or relationship list item to request backend source documents.
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
