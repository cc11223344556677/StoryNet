import { FormEvent, SyntheticEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DashboardCustomizeIcon from "@mui/icons-material/DashboardCustomize";
import InsightsIcon from "@mui/icons-material/Insights";
import LayersIcon from "@mui/icons-material/Layers";
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
import type { GraphRenderModel, GraphRendererId } from "./renderers/types";
import { fetchEntityRelationshipsPaginated } from "./neighborhoodFetch";
import { buildGraphFromSnapshot } from "./fullSnapshotGraph";
import { GraphWorkspaceLayout } from "./GraphWorkspaceLayout";
import { GraphViewPreset, loadGraphViewPresets, saveGraphViewPresets } from "./viewPresets";
import {
  GraphWorkspaceLayoutState,
  GraphWorkspaceLeftTab,
  GraphWorkspaceRightTab,
  getDefaultGraphWorkspaceLayoutState,
  loadGraphWorkspaceLayoutState,
  saveGraphWorkspaceLayoutState
} from "./workspaceLayout";
import {
  collectRelationshipReferences,
  mergeSnapshot,
  removeEntityFromSnapshot
} from "./snapshotUtils";
import { fetchDocumentEntitiesStrict, mergeEntitiesById } from "../projects/projectSeedService";

interface NeighborhoodQueryResult {
  centerId: string;
  relationshipEntities: FtMEntity[];
  entitiesForSnapshot: FtMEntity[];
  partialRelationshipsLoaded: boolean;
  partialLoadMessage: string | null;
}

type GraphViewMode = "full_snapshot" | "focused_inspect";

function createEmptySnapshot(): ProjectSnapshot {
  return {
    entities: [],
    viewport: {}
  };
}

function isWriteEquivalentSnapshot(a: ProjectSnapshot, b: ProjectSnapshot): boolean {
  return (
    JSON.stringify(sanitizeProjectSnapshotForWrite(a)) ===
    JSON.stringify(sanitizeProjectSnapshotForWrite(b))
  );
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

function formatSeedError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Could not load document entities for snapshot seeding.";
}

export function ProjectGraphPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

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
  const [workspaceLayout, setWorkspaceLayout] = useState<GraphWorkspaceLayoutState>(() =>
    getDefaultGraphWorkspaceLayoutState()
  );
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);
  const [selectedSeedDocumentIds, setSelectedSeedDocumentIds] = useState<Set<string>>(new Set());
  const [graphViewMode, setGraphViewMode] = useState<GraphViewMode>("full_snapshot");

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
    setWorkspaceLayout(loadGraphWorkspaceLayoutState(projectQuery.data.id));
    setSelectedSeedDocumentIds(new Set());
    setGraphViewMode("full_snapshot");
  }, [projectQuery.data?.id]);

  useEffect(() => {
    if (!projectQuery.data?.id) {
      return;
    }

    saveGraphWorkspaceLayoutState(projectQuery.data.id, workspaceLayout);
  }, [projectQuery.data?.id, workspaceLayout]);

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

  const completedDocumentsQuery = useQuery({
    queryKey: ["graph-seed-documents", projectId],
    queryFn: () =>
      apiClient.listMyDocuments({
        status: "completed",
        page: 1,
        pageSize: 100
      }),
    enabled: Boolean(projectId)
  });

  const seedDocuments = completedDocumentsQuery.data?.results ?? [];

  useEffect(() => {
    setSelectedSeedDocumentIds((current) => {
      if (current.size === 0) {
        return current;
      }

      const allowed = new Set(seedDocuments.map((document) => document.id));
      const filtered = new Set<string>();
      for (const id of current) {
        if (allowed.has(id)) {
          filtered.add(id);
        }
      }

      if (filtered.size === current.size) {
        return current;
      }

      return filtered;
    });
  }, [seedDocuments]);

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
      if (merged.changed && !isWriteEquivalentSnapshot(base, merged.snapshot)) {
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

  const enterFocusedInspect = useCallback(
    (entityId: string, explicitLabel?: string): void => {
      setGraphViewMode("focused_inspect");
      selectEntity(entityId, explicitLabel);
    },
    [selectEntity]
  );

  const exitFocusedInspect = useCallback((): void => {
    setGraphViewMode("full_snapshot");
  }, []);

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
      enterFocusedInspect(nodeId, nodeLabel);
    },
    [enterFocusedInspect]
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
      setGraphViewMode("full_snapshot");
    }

    if (selectedRelationshipId && result.removedRelationshipIds.includes(selectedRelationshipId)) {
      setSelectedRelationshipId(null);
      setSelectedEdgeId(null);
    }
  };

  const seedDocumentsMutation = useMutation({
    mutationFn: async (documentIds: string[]) => {
      let aggregatedEntities: FtMEntity[] = [];

      for (const documentId of documentIds) {
        const result = await fetchDocumentEntitiesStrict(apiClient, documentId);
        aggregatedEntities = mergeEntitiesById(aggregatedEntities, result.entities);
      }

      return aggregatedEntities;
    },
    onSuccess: (entities) => {
      setWorkingSnapshot((current) => {
        const base = current ?? projectQuery.data?.snapshot ?? createEmptySnapshot();
        const merged = mergeSnapshot(base, entities);

        if (merged.changed) {
          setIsSnapshotDirty(true);
        }

        return merged.snapshot;
      });

      setSelectedSeedDocumentIds(new Set());
    }
  });

  const selectedSeedCount = selectedSeedDocumentIds.size;
  const areAllSeedDocumentsSelected =
    seedDocuments.length > 0 && selectedSeedCount === seedDocuments.length;

  const onToggleSeedDocument = (documentId: string, checked: boolean): void => {
    setSelectedSeedDocumentIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(documentId);
      } else {
        next.delete(documentId);
      }
      return next;
    });
  };

  const onToggleAllSeedDocuments = (checked: boolean): void => {
    if (!checked) {
      setSelectedSeedDocumentIds(new Set());
      return;
    }

    setSelectedSeedDocumentIds(new Set(seedDocuments.map((document) => document.id)));
  };

  const onAddSelectedDocumentsToSnapshot = (): void => {
    if (selectedSeedDocumentIds.size === 0 || seedDocumentsMutation.isPending) {
      return;
    }

    seedDocumentsMutation.mutate([...selectedSeedDocumentIds]);
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

  const focusedSnapshotEntities = useMemo(() => {
    if (graphViewMode !== "focused_inspect" || !selectedEntityId || !neighborhoodQuery.data) {
      return null;
    }

    if (neighborhoodQuery.data.centerId !== selectedEntityId) {
      return null;
    }

    if (hiddenSchemas.length === 0) {
      return neighborhoodQuery.data.entitiesForSnapshot;
    }

    const hidden = new Set(hiddenSchemas);
    return neighborhoodQuery.data.entitiesForSnapshot.filter((entity) => !hidden.has(entity.schema));
  }, [graphViewMode, hiddenSchemas, neighborhoodQuery.data, selectedEntityId]);

  const focusedSnapshotGraph = useMemo(() => {
    if (!focusedSnapshotEntities) {
      return null;
    }

    return buildGraphFromSnapshot(focusedSnapshotEntities);
  }, [focusedSnapshotEntities]);

  const isFocusedInspectActive = graphViewMode === "focused_inspect";

  const selectedEntityLabel = selectedEntityId ? resolveEntityLabel(selectedEntityId) : "";
  const selectedEntityType = useMemo(() => {
    if (!selectedEntityId) {
      return "Entity";
    }

    const fromSnapshot = snapshotEntityMap.get(selectedEntityId);
    if (fromSnapshot) {
      return fromSnapshot.schema;
    }

    const fromScopedSearch = scopedSearchHits.find((hit) => hit.entityId === selectedEntityId);
    if (fromScopedSearch) {
      return fromScopedSearch.type;
    }

    const fromGlobalSearch = globalSearchHits.find((hit) => hit.entityId === selectedEntityId);
    if (fromGlobalSearch) {
      return fromGlobalSearch.type;
    }

    return "Entity";
  }, [globalSearchHits, scopedSearchHits, selectedEntityId, snapshotEntityMap]);

  const selectedNodeOnlyGraph = useMemo<GraphRenderModel | null>(() => {
    if (graphViewMode !== "focused_inspect" || !selectedEntityId) {
      return null;
    }

    return {
      nodes: [
        {
          id: selectedEntityId,
          label: selectedEntityLabel || selectedEntityId,
          type: selectedEntityType
        }
      ],
      edges: []
    };
  }, [graphViewMode, selectedEntityId, selectedEntityLabel, selectedEntityType]);

  const displayedGraph = useMemo<GraphRenderModel>(() => {
    if (graphViewMode !== "focused_inspect") {
      return snapshotGraph;
    }

    if (focusedSnapshotGraph) {
      return focusedSnapshotGraph;
    }

    return selectedNodeOnlyGraph ?? { nodes: [], edges: [] };
  }, [focusedSnapshotGraph, graphViewMode, selectedNodeOnlyGraph, snapshotGraph]);

  const neighborhoodData = neighborhoodQuery.data;
  const showNoDirectNeighborsMessage =
    isFocusedInspectActive &&
    Boolean(selectedEntityId) &&
    !neighborhoodQuery.isFetching &&
    !(neighborhoodQuery.error instanceof Error) &&
    neighborhoodData?.centerId === selectedEntityId &&
    (neighborhoodData?.relationshipEntities.length ?? -1) === 0;

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

    const matchingEdge = displayedGraph.edges.find(
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
  }, [displayedGraph.edges, selectedRelationshipId, selectedEdgeId]);

  const onLeftTabChange = (_event: SyntheticEvent, value: string): void => {
    setWorkspaceLayout((current) => ({
      ...current,
      leftTab: value as GraphWorkspaceLeftTab
    }));
  };

  const onRightTabChange = (_event: SyntheticEvent, value: string): void => {
    setWorkspaceLayout((current) => ({
      ...current,
      rightTab: value as GraphWorkspaceRightTab
    }));
  };

  const collapseLeftPanel = (): void => {
    setWorkspaceLayout((current) => ({ ...current, leftCollapsed: true }));
  };

  const expandLeftPanel = (): void => {
    setWorkspaceLayout((current) => ({ ...current, leftCollapsed: false }));
  };

  const collapseRightPanel = (): void => {
    setWorkspaceLayout((current) => ({ ...current, rightCollapsed: true }));
  };

  const expandRightPanel = (): void => {
    setWorkspaceLayout((current) => ({ ...current, rightCollapsed: false }));
  };

  const selectedEntityFromSnapshot = selectedEntityId
    ? snapshotEntityMap.get(selectedEntityId)
    : undefined;

  const searchTab = (
    <Stack spacing={1.5}>
      <FormControl size="small" fullWidth>
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

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
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
      </Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
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

      <Divider />

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button size="small" variant="outlined" onClick={showAllSchemas}>
          Show All
        </Button>
        <Button size="small" variant="outlined" onClick={hideAllSchemas} disabled={snapshotSchemas.length === 0}>
          Hide All
        </Button>
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
      </Stack>

      <Divider />

      <form onSubmit={submitSnapshotSearch}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
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

      {snapshotSearchQuery.isFetching && (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={18} />
          <Typography variant="body2">Searching snapshot entities...</Typography>
        </Stack>
      )}
      {snapshotSearchQuery.error instanceof Error && (
        <Alert severity="error">{snapshotSearchQuery.error.message}</Alert>
      )}
      {!isSnapshotResultsCollapsed && snapshotActiveQuery && (
        <>
          {scopedSearchHits.length === 0 ? (
            <Alert severity="info">No snapshot entity matches for "{snapshotActiveQuery}".</Alert>
          ) : (
            <List dense sx={{ border: "1px solid #e1e7f3", borderRadius: 1, maxHeight: 220, overflowY: "auto" }}>
              {scopedSearchHits.map((hit) => (
                <ListItemButton
                  key={hit.entityId}
                  selected={selectedEntityId === hit.entityId}
                  onClick={() => enterFocusedInspect(hit.entityId, hit.label)}
                >
                  <ListItemText primary={hit.label} secondary={hit.type} />
                </ListItemButton>
              ))}
            </List>
          )}
        </>
      )}

      <Divider />

      <form onSubmit={submitGlobalSearch}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
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
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={18} />
          <Typography variant="body2">Searching backend entities...</Typography>
        </Stack>
      )}
      {globalSearchQuery.error instanceof Error && (
        <Alert severity="error">{globalSearchQuery.error.message}</Alert>
      )}
      {!isGlobalResultsCollapsed && globalActiveQuery && (
        <>
          {globalSearchHits.length === 0 ? (
            <Alert severity="info">No global entities match "{globalActiveQuery}".</Alert>
          ) : (
            <List dense sx={{ border: "1px solid #e1e7f3", borderRadius: 1, maxHeight: 300, overflowY: "auto" }}>
              {globalSearchHits.map((hit) => (
                <ListItem key={hit.entityId} disableGutters>
                  <Stack spacing={1} sx={{ width: "100%" }}>
                    <ListItemText primary={hit.label} secondary={`${hit.type} - ${hit.entityId}`} />
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="outlined" onClick={() => enterFocusedInspect(hit.entityId, hit.label)}>
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
    </Stack>
  );

  const seedTab = (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Select completed documents to import their entities into this snapshot.
      </Typography>

      {completedDocumentsQuery.isLoading ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={18} />
          <Typography>Loading completed documents...</Typography>
        </Stack>
      ) : completedDocumentsQuery.error instanceof Error ? (
        <Alert severity="error">{completedDocumentsQuery.error.message}</Alert>
      ) : (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Completed documents: {seedDocuments.length}
            </Typography>
            <Button size="small" onClick={() => onToggleAllSeedDocuments(!areAllSeedDocumentsSelected)}>
              {areAllSeedDocumentsSelected ? "Clear All" : "Select All"}
            </Button>
          </Stack>

          <List dense sx={{ border: "1px solid #e1e7f3", borderRadius: 1, maxHeight: 280, overflowY: "auto" }}>
            {seedDocuments.map((document) => {
              const checked = selectedSeedDocumentIds.has(document.id);
              return (
                <ListItem key={document.id} disablePadding>
                  <ListItemButton onClick={() => onToggleSeedDocument(document.id, !checked)}>
                    <Checkbox checked={checked} />
                    <ListItemText
                      primary={document.filename}
                      secondary={`entities: ${document.entity_count ?? 0}`}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
            {seedDocuments.length === 0 && (
              <ListItem>
                <ListItemText primary="No completed documents available for seeding yet." />
              </ListItem>
            )}
          </List>

          <Button
            variant="contained"
            onClick={onAddSelectedDocumentsToSnapshot}
            disabled={selectedSeedCount === 0 || seedDocumentsMutation.isPending}
          >
            {seedDocumentsMutation.isPending ? "Importing..." : "Add Selected to Snapshot"}
          </Button>
          {seedDocumentsMutation.error && (
            <Alert severity="error">{formatSeedError(seedDocumentsMutation.error)}</Alert>
          )}
        </>
      )}
    </Stack>
  );

  const snapshotTab = (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip color="primary" label={`Entities ${snapshotStats.total}`} />
        <Chip color="default" label={`Nodes ${snapshotStats.nodeCount}`} />
        <Chip color="default" label={`Relationships ${snapshotStats.relationshipCount}`} />
      </Stack>
      {snapshotEntities.length === 0 ? (
        <Alert severity="info">Snapshot currently has no entities.</Alert>
      ) : (
        <List dense sx={{ border: "1px solid #e1e7f3", borderRadius: 1, maxHeight: 360, overflowY: "auto" }}>
          {snapshotEntities.map((entity) => (
            <ListItem key={entity.id} disableGutters>
              <Stack spacing={1} sx={{ width: "100%" }}>
                <ListItemText primary={getEntityLabel(entity)} secondary={`${entity.schema} - ${entity.id}`} />
                <Stack direction="row" spacing={1}>
                  {!isLikelyRelationshipSchema(entity.schema) && (
                    <Button size="small" variant="outlined" onClick={() => enterFocusedInspect(entity.id, getEntityLabel(entity))}>
                      Inspect
                    </Button>
                  )}
                  <Button size="small" color="error" variant="outlined" onClick={() => onRemoveSnapshotEntity(entity.id)}>
                    Remove
                  </Button>
                </Stack>
              </Stack>
            </ListItem>
          ))}
        </List>
      )}
    </Stack>
  );

  const rightInspectorTab = (
    <Stack spacing={1.5}>
      {selectedRelationshipId ? (
        <>
          <Typography variant="body2">
            <strong>Selected relationship:</strong> {selectedRelationshipId}
          </Typography>
          {relationshipDetailQuery.isLoading && (
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
            </Stack>
          )}
        </>
      ) : selectedEntityId ? (
        <>
          <Typography variant="body2">
            <strong>Selected entity:</strong> {selectedEntityLabel || selectedEntityId}
          </Typography>
          {selectedEntityFromSnapshot && (
            <Typography variant="body2">
              <strong>Schema:</strong> {selectedEntityFromSnapshot.schema}
            </Typography>
          )}
        </>
      ) : (
        <Alert severity="info">Select a node or relationship edge to inspect details.</Alert>
      )}
    </Stack>
  );

  const rightRelationshipsTab = (
    <Stack spacing={1.5}>
      {relationshipEntities.length > 0 ? (
        <List dense sx={{ border: "1px solid #e1e7f3", borderRadius: 1, maxHeight: 280, overflowY: "auto" }}>
          {relationshipEntities.map((relationship) => (
            <ListItemButton
              key={relationship.id}
              selected={relationship.id === selectedRelationshipId}
              onClick={() => onSelectRelationship(relationship.id)}
            >
              <ListItemText primary={getEntityLabel(relationship)} secondary={`${relationship.schema} - ${relationship.id}`} />
            </ListItemButton>
          ))}
        </List>
      ) : (
        <Alert severity="info">No relationship entities are loaded for the selected entity neighborhood yet.</Alert>
      )}

      {!selectedRelationshipId && selectedRelationshipFromNeighborhood && !relationshipDetailQuery.isLoading && (
        <Typography variant="body2" color="text.secondary">
          Selected relationship: {getEntityLabel(selectedRelationshipFromNeighborhood)}
        </Typography>
      )}
    </Stack>
  );

  const rightSourcesTab = (
    <Stack spacing={1.5}>
      {selectedRelationshipId ? (
        <>
          {relationshipDocumentsQuery.isLoading ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} />
              <Typography>Loading source documents for relationship...</Typography>
            </Stack>
          ) : relationshipDocumentsQuery.error instanceof Error ? (
            <Alert severity="info">
              Relationship source documents are temporarily unavailable: {relationshipDocumentsQuery.error.message}
            </Alert>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                Total source documents: {relationshipDocumentsQuery.data?.total ?? 0}
              </Typography>
              <List dense>
                {(relationshipDocumentsQuery.data?.results ?? []).map((document) => (
                  <ListItem key={document.id} disableGutters>
                    <Stack spacing={1} sx={{ width: "100%" }}>
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
            <Alert severity="info">
              Entity source documents are temporarily unavailable: {entityDocumentsQuery.error.message}
            </Alert>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                Total source documents: {entityDocumentsQuery.data?.total ?? 0}
              </Typography>
              <List dense>
                {(entityDocumentsQuery.data?.results ?? []).map((document) => (
                  <ListItem key={document.id} disableGutters>
                    <Stack spacing={1} sx={{ width: "100%" }}>
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
  );

  const leftPane = (
    <Paper variant="outlined" className="graph-workspace-panel">
      <Stack direction="row" alignItems="center" sx={{ borderBottom: "1px solid #d9e2f0", px: 1 }}>
        <Tabs value={workspaceLayout.leftTab} onChange={onLeftTabChange} variant="fullWidth">
          <Tab value="search" label="Search" />
          <Tab value="seed" label="Seed" />
          <Tab value="snapshot" label="Snapshot" />
        </Tabs>
        {!isMobile && (
          <Tooltip title="Collapse left panel">
            <IconButton aria-label="Collapse left panel" size="small" onClick={collapseLeftPanel}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      <Box className="graph-workspace-panel-scroll" sx={{ p: 2 }}>
        {workspaceLayout.leftTab === "search"
          ? searchTab
          : workspaceLayout.leftTab === "seed"
            ? seedTab
            : snapshotTab}
      </Box>
    </Paper>
  );

  const rightPane = (
    <Paper variant="outlined" className="graph-workspace-panel">
      <Stack direction="row" alignItems="center" sx={{ borderBottom: "1px solid #d9e2f0", px: 1 }}>
        {!isMobile && (
          <Tooltip title="Collapse right panel">
            <IconButton aria-label="Collapse right panel" size="small" onClick={collapseRightPanel}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tabs value={workspaceLayout.rightTab} onChange={onRightTabChange} variant="fullWidth">
          <Tab value="inspector" label="Inspector" />
          <Tab value="relationships" label="Relations" />
          <Tab value="sources" label="Sources" />
        </Tabs>
      </Stack>
      <Box className="graph-workspace-panel-scroll" sx={{ p: 2 }}>
        {workspaceLayout.rightTab === "inspector"
          ? rightInspectorTab
          : workspaceLayout.rightTab === "relationships"
            ? rightRelationshipsTab
            : rightSourcesTab}
      </Box>
    </Paper>
  );

  const leftCollapsedPane = (
    <Box className="graph-workspace-collapsed">
      <Tooltip title="Expand left panel">
        <IconButton aria-label="Expand left panel" size="small" onClick={expandLeftPanel}>
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Divider flexItem sx={{ my: 0.5 }} />
      <Tooltip title="Search tab">
        <IconButton
          size="small"
          color={workspaceLayout.leftTab === "search" ? "primary" : "default"}
          onClick={() => setWorkspaceLayout((current) => ({ ...current, leftTab: "search", leftCollapsed: false }))}
        >
          <SearchIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Seed tab">
        <IconButton
          size="small"
          color={workspaceLayout.leftTab === "seed" ? "primary" : "default"}
          onClick={() => setWorkspaceLayout((current) => ({ ...current, leftTab: "seed", leftCollapsed: false }))}
        >
          <LayersIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Snapshot tab">
        <IconButton
          size="small"
          color={workspaceLayout.leftTab === "snapshot" ? "primary" : "default"}
          onClick={() => setWorkspaceLayout((current) => ({ ...current, leftTab: "snapshot", leftCollapsed: false }))}
        >
          <DashboardCustomizeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );

  const rightCollapsedPane = (
    <Box className="graph-workspace-collapsed">
      <Tooltip title="Expand right panel">
        <IconButton aria-label="Expand right panel" size="small" onClick={expandRightPanel}>
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Divider flexItem sx={{ my: 0.5 }} />
      <Tooltip title="Inspector tab">
        <IconButton
          size="small"
          color={workspaceLayout.rightTab === "inspector" ? "primary" : "default"}
          onClick={() => setWorkspaceLayout((current) => ({ ...current, rightTab: "inspector", rightCollapsed: false }))}
        >
          <InsightsIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Relationships tab">
        <IconButton
          size="small"
          color={workspaceLayout.rightTab === "relationships" ? "primary" : "default"}
          onClick={() => setWorkspaceLayout((current) => ({ ...current, rightTab: "relationships", rightCollapsed: false }))}
        >
          <LayersIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Sources tab">
        <IconButton
          size="small"
          color={workspaceLayout.rightTab === "sources" ? "primary" : "default"}
          onClick={() => setWorkspaceLayout((current) => ({ ...current, rightTab: "sources", rightCollapsed: false }))}
        >
          <DashboardCustomizeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );

  const centerPane = (
    <Paper variant="outlined" className="graph-workspace-panel" sx={{ display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid #d9e2f0" }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ sm: "center" }} justifyContent="space-between">
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip color="primary" label={`Entities ${snapshotStats.total}`} />
            <Chip color="default" label={`Nodes ${snapshotStats.nodeCount}`} />
            <Chip color="default" label={`Relationships ${snapshotStats.relationshipCount}`} />
            <Chip
              color={isFocusedInspectActive ? "secondary" : "default"}
              label={isFocusedInspectActive ? "Focused Inspect View" : "Full Snapshot View"}
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            {isFocusedInspectActive && (
              <Button variant="outlined" onClick={exitFocusedInspect}>
                Back to Full Snapshot
              </Button>
            )}
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
        {saveSnapshotMutation.error instanceof Error && (
          <Alert sx={{ mt: 1.2 }} severity="error">
            Could not save project snapshot. Backend error: {saveSnapshotMutation.error.message}
          </Alert>
        )}
        {isSnapshotDirty && !saveSnapshotMutation.isPending && (
          <Alert sx={{ mt: 1.2 }} severity="warning">
            Snapshot has unsaved changes.
          </Alert>
        )}
        {saveSnapshotMutation.isSuccess && (
          <Alert sx={{ mt: 1.2 }} severity="success">
            Snapshot saved to backend project store.
          </Alert>
        )}
        {selectedEntityId && neighborhoodQuery.isFetching && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Loading entity neighborhood...</Typography>
          </Stack>
        )}
        {neighborhoodQuery.error instanceof Error && (
          <Alert sx={{ mt: 1.2 }} severity="error">
            Could not load live relationships for this entity. Please try Inspect again. Backend error:{" "}
            {neighborhoodQuery.error.message}
          </Alert>
        )}
        {partialNeighborhoodMessage && (
          <Alert sx={{ mt: 1.2 }} severity="info">
            {partialNeighborhoodMessage}
          </Alert>
        )}
        {showNoDirectNeighborsMessage && (
          <Alert sx={{ mt: 1.2 }} severity="info">
            No direct neighbors found; showing selected entity only.
          </Alert>
        )}
      </Box>
      <Box sx={{ p: 1.5, flex: 1, minHeight: 0 }}>
        {displayedGraph.nodes.length > 0 ? (
          <Box sx={{ height: "100%", minHeight: 420 }} className="graph-panel">
            <GraphRendererHost
              rendererId={rendererId}
              graph={displayedGraph}
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
      </Box>
    </Paper>
  );

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
    <Stack spacing={2.5}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "center" }}
        spacing={1.5}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Graph Workspace
          </Typography>
          <Typography color="text.secondary">
            {projectQuery.data.name} - center graph with operations on the left and insights on the right.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.2}>
          <Button component={RouterLink} to="/projects" variant="outlined" startIcon={<ArrowBackIcon />}>
            Projects
          </Button>
          {isMobile && (
            <>
              <Button variant="outlined" onClick={() => setMobileLeftOpen(true)}>
                Left Tabs
              </Button>
              <Button variant="outlined" onClick={() => setMobileRightOpen(true)}>
                Right Tabs
              </Button>
            </>
          )}
        </Stack>
      </Stack>

      <GraphWorkspaceLayout
        isMobile={isMobile}
        state={workspaceLayout}
        setState={setWorkspaceLayout}
        centerPane={centerPane}
        leftPane={leftPane}
        rightPane={rightPane}
        leftCollapsedPane={leftCollapsedPane}
        rightCollapsedPane={rightCollapsedPane}
        mobileLeftOpen={mobileLeftOpen}
        mobileRightOpen={mobileRightOpen}
        onMobileLeftOpenChange={setMobileLeftOpen}
        onMobileRightOpenChange={setMobileRightOpen}
      />
    </Stack>
  );
}
