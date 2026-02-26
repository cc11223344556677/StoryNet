import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { DocumentStatus, DocumentType, JobStatus } from "../../types/domain";
import { apiClient } from "../../api/factory";
import { StoryNetApiError } from "../../api/errors";
import { getEntityLabel, mapDocumentToVM } from "../../api/mappers";
import { formatApiDate } from "../../lib/date";
import {
  addDocumentEntitiesToProject,
  createProjectFromDocument,
  ProjectSeedError
} from "../projects/projectSeedService";
import {
  addDocumentsToProject,
  createProjectFromDocuments,
  ProjectSeedBatchError
} from "../projects/projectSeedBatchService";

const TERMINAL_JOB_STATES: ReadonlySet<DocumentStatus> = new Set(["completed", "failed"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const JOB_POLL_MAX_MS = 5 * 60 * 1000;
const SET_PUBLIC_VERIFY_DELAY_MS = 600;
const REMOVE_OWNERSHIP_VERIFY_DELAY_MS = 600;
const ENTITY_PANEL_MIN_HEIGHT = 180;

type EntityPanelState =
  | "loading"
  | "ready_with_rows"
  | "ready_no_entities"
  | "details_temporarily_unavailable";

function formatProjectSeedError(error: unknown): string {
  if (error instanceof ProjectSeedBatchError) {
    const details = error.failures
      .map((failure) => `${failure.documentId}: ${failure.message}`)
      .join(" | ");
    return `${error.message} ${details}`.trim();
  }

  if (error instanceof ProjectSeedError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Backend could not seed project entities from this document.";
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function isOwnershipRemoved(documentId: string): Promise<boolean> {
  let userId: string | null = null;

  try {
    userId = (await apiClient.me()).id;
  } catch {
    // If we cannot resolve identity, fallback to endpoint accessibility checks below.
  }

  try {
    const document = await apiClient.getDocument(documentId);
    if (!userId) {
      return false;
    }

    return !document.owner_ids.includes(userId);
  } catch {
    // If the document is no longer visible, ownership has effectively been removed.
    return true;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function detectDocumentType(file: File): DocumentType | null {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".txt")) {
    return "text";
  }

  if (fileName.endsWith(".pdf")) {
    return "pdf";
  }

  return null;
}

function validateFile(file: File): string | null {
  const type = detectDocumentType(file);
  if (!type) {
    return "Only .txt and .pdf files are supported.";
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return "The selected file is larger than 10 MB.";
  }

  return null;
}

export function DocumentsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<DocumentType | "">("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileError, setSelectedFileError] = useState<string | null>(null);
  const [makePublic, setMakePublic] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStartedAt, setJobStartedAt] = useState<number | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [lastJob, setLastJob] = useState<JobStatus | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [entitySchemaFilter, setEntitySchemaFilter] = useState("");
  const [selectedSeedDocumentIds, setSelectedSeedDocumentIds] = useState<Set<string>>(new Set());
  const [createSeedDialogOpen, setCreateSeedDialogOpen] = useState(false);
  const [addSeedDialogOpen, setAddSeedDialogOpen] = useState(false);
  const [seedDocumentIds, setSeedDocumentIds] = useState<string[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [targetProjectId, setTargetProjectId] = useState("");

  const documentsQuery = useQuery({
    queryKey: ["documents", statusFilter, typeFilter],
    queryFn: () =>
      apiClient.listMyDocuments({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        page: 1,
        pageSize: 50
      })
  });

  const selectedDocumentQuery = useQuery({
    queryKey: ["document-detail", selectedDocumentId],
    queryFn: () => apiClient.getDocument(selectedDocumentId!),
    enabled: Boolean(selectedDocumentId)
  });

  const inspectDocumentIdFromQuery = searchParams.get("inspect");

  const selectedDocumentStatus = selectedDocumentQuery.data?.status;
  const canFetchDocumentEntities = selectedDocumentStatus === "completed";

  const documentEntitiesQuery = useQuery({
    queryKey: ["document-entities", selectedDocumentId, entitySchemaFilter],
    queryFn: () =>
      apiClient.getDocumentEntities(
        selectedDocumentId!,
        entitySchemaFilter.trim() || undefined,
        1,
        50
      ),
    enabled: Boolean(selectedDocumentId && canFetchDocumentEntities)
  });

  const projectOptionsQuery = useQuery({
    queryKey: ["seed-project-options"],
    queryFn: () => apiClient.listProjects(1, 100),
    enabled: addSeedDialogOpen
  });

  const jobQuery = useQuery({
    queryKey: ["job", activeJobId],
    queryFn: () => apiClient.getJob(activeJobId!),
    enabled: Boolean(activeJobId),
    refetchInterval: (query) => {
      const currentStatus = query.state.data?.status;
      if (currentStatus && TERMINAL_JOB_STATES.has(currentStatus)) {
        return false;
      }

      if (jobStartedAt && Date.now() - jobStartedAt >= JOB_POLL_MAX_MS) {
        return false;
      }

      return 1500;
    }
  });

  useEffect(() => {
    if (!activeJobId || !jobStartedAt) {
      return;
    }

    setPollTimedOut(false);
    const timeoutId = window.setTimeout(() => {
      setPollTimedOut(true);
    }, JOB_POLL_MAX_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeJobId, jobStartedAt]);

  useEffect(() => {
    if (!jobQuery.data) {
      return;
    }

    setLastJob(jobQuery.data);

    if (TERMINAL_JOB_STATES.has(jobQuery.data.status)) {
      setActiveJobId(null);
      setJobStartedAt(null);
      setPollTimedOut(false);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void queryClient.invalidateQueries({ queryKey: ["entity-search"] });
    }
  }, [jobQuery.data, queryClient]);

  useEffect(() => {
    if (!inspectDocumentIdFromQuery) {
      return;
    }

    if (selectedDocumentId !== inspectDocumentIdFromQuery) {
      setSelectedDocumentId(inspectDocumentIdFromQuery);
    }
  }, [inspectDocumentIdFromQuery, selectedDocumentId]);

  const uploadMutation = useMutation({
    mutationFn: async (): Promise<JobStatus> => {
      if (!selectedFile) {
        throw new Error("Please choose a .txt or .pdf file.");
      }

      const documentType = detectDocumentType(selectedFile);
      if (!documentType) {
        throw new Error("Unsupported document type.");
      }

      if (documentType === "text") {
        return apiClient.uploadTextDocument(selectedFile, makePublic);
      }

      return apiClient.uploadPdfDocument(selectedFile, makePublic);
    },
    onSuccess: async (jobStatus) => {
      setLastJob(jobStatus);
      setSelectedFile(null);
      setSelectedFileError(null);

      if (TERMINAL_JOB_STATES.has(jobStatus.status)) {
        setActiveJobId(null);
        setJobStartedAt(null);
        setPollTimedOut(false);
      } else {
        setActiveJobId(jobStatus.job_id);
        setJobStartedAt(Date.now());
        setPollTimedOut(false);
      }

      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    }
  });

  const setPublicMutation = useMutation({
    mutationFn: async (documentId: string) => {
      try {
        return await apiClient.updateDocument(documentId, { public: true });
      } catch (error) {
        if (error instanceof StoryNetApiError && error.status === 500) {
          try {
            const firstCheck = await apiClient.getDocument(documentId);
            if (firstCheck.public) {
              return firstCheck;
            }

            await waitFor(SET_PUBLIC_VERIFY_DELAY_MS);
            const secondCheck = await apiClient.getDocument(documentId);
            if (secondCheck.public) {
              return secondCheck;
            }
          } catch {
            // Fall through and surface the original mutation error.
          }
        }

        throw error;
      }
    },
    onSuccess: async (document) => {
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      await queryClient.invalidateQueries({ queryKey: ["document-detail", document.id] });
      await queryClient.invalidateQueries({ queryKey: ["document-entities", document.id] });
    }
  });

  const removeDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      try {
        await apiClient.deleteDocument(documentId);
      } catch (error) {
        if (error instanceof StoryNetApiError && error.status === 500) {
          if (await isOwnershipRemoved(documentId)) {
            return;
          }

          await waitFor(REMOVE_OWNERSHIP_VERIFY_DELAY_MS);
          if (await isOwnershipRemoved(documentId)) {
            return;
          }
        }

        throw error;
      }
    },
    onSuccess: async (_, documentId) => {
      if (selectedDocumentId === documentId) {
        setSelectedDocumentId(null);
      }

      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    }
  });

  const createProjectSeedMutation = useMutation({
    mutationFn: async (params: { documentIds: string[]; name: string; description: string }) => {
      if (params.documentIds.length === 1) {
        return createProjectFromDocument(apiClient, {
          documentId: params.documentIds[0],
          name: params.name,
          description: params.description
        });
      }

      return createProjectFromDocuments(apiClient, {
        documentIds: params.documentIds,
        name: params.name,
        description: params.description
      });
    },
    onSuccess: async (project) => {
      setCreateSeedDialogOpen(false);
      setSeedDocumentIds([]);
      setNewProjectName("");
      setNewProjectDescription("");
      setSelectedSeedDocumentIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/projects/${project.id}/graph`);
    }
  });

  const addProjectSeedMutation = useMutation({
    mutationFn: async (params: { documentIds: string[]; projectId: string }) => {
      if (params.documentIds.length === 1) {
        return addDocumentEntitiesToProject(apiClient, {
          documentId: params.documentIds[0],
          projectId: params.projectId
        });
      }

      return addDocumentsToProject(apiClient, {
        documentIds: params.documentIds,
        projectId: params.projectId
      });
    },
    onSuccess: async (project) => {
      setAddSeedDialogOpen(false);
      setSeedDocumentIds([]);
      setTargetProjectId("");
      setSelectedSeedDocumentIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      navigate(`/projects/${project.id}/graph`);
    }
  });

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      setSelectedFileError(null);
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setSelectedFile(null);
      setSelectedFileError(validationError);
      return;
    }

    setSelectedFile(file);
    setSelectedFileError(null);
  };

  const rows = useMemo(() => {
    return (documentsQuery.data?.results ?? []).map((document) => mapDocumentToVM(document));
  }, [documentsQuery.data]);

  const selectableSeedDocumentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const document of documentsQuery.data?.results ?? []) {
      if (document.status === "completed") {
        ids.add(document.id);
      }
    }
    return ids;
  }, [documentsQuery.data]);

  const selectedSeedCount = useMemo(() => {
    let count = 0;
    for (const id of selectedSeedDocumentIds) {
      if (selectableSeedDocumentIds.has(id)) {
        count += 1;
      }
    }
    return count;
  }, [selectedSeedDocumentIds, selectableSeedDocumentIds]);

  useEffect(() => {
    setSelectedSeedDocumentIds((current) => {
      const filtered = new Set<string>();
      for (const id of current) {
        if (selectableSeedDocumentIds.has(id)) {
          filtered.add(id);
        }
      }

      if (filtered.size === current.size) {
        return current;
      }

      return filtered;
    });
  }, [selectableSeedDocumentIds]);

  const selectedDocumentFromList = useMemo(() => {
    if (!selectedDocumentId) {
      return undefined;
    }

    return (documentsQuery.data?.results ?? []).find((document) => document.id === selectedDocumentId);
  }, [documentsQuery.data, selectedDocumentId]);

  const expectedEntityCount =
    selectedDocumentQuery.data?.entity_count ?? selectedDocumentFromList?.entity_count ?? 0;

  const isSchemaFiltered = entitySchemaFilter.trim().length > 0;
  const entityResults = documentEntitiesQuery.data?.results ?? [];
  const displayedEntityTotal = expectedEntityCount;
  const hasEntityDetailsUnavailable =
    canFetchDocumentEntities &&
    !documentEntitiesQuery.isLoading &&
    !isSchemaFiltered &&
    expectedEntityCount > 0 &&
    (documentEntitiesQuery.error instanceof Error || entityResults.length === 0);
  const entityPanelState: EntityPanelState = documentEntitiesQuery.isLoading
    ? "loading"
    : hasEntityDetailsUnavailable
      ? "details_temporarily_unavailable"
      : entityResults.length > 0
        ? "ready_with_rows"
        : "ready_no_entities";

  const onStatusFilterChange = (event: SelectChangeEvent<DocumentStatus | "">): void => {
    setStatusFilter((event.target.value as DocumentStatus | "") ?? "");
  };

  const onTypeFilterChange = (event: SelectChangeEvent<DocumentType | "">): void => {
    setTypeFilter((event.target.value as DocumentType | "") ?? "");
  };

  const onSelectDocument = (documentId: string): void => {
    setSelectedDocumentId(documentId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("inspect", documentId);
      return next;
    });
  };

  const onToggleSeedSelection = (documentId: string, checked: boolean): void => {
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

  const onSetPublic = (documentId: string): void => {
    setPublicMutation.reset();
    setPublicMutation.mutate(documentId);
  };

  const onRemoveDocument = (documentId: string): void => {
    if (!window.confirm("Remove your ownership of this document?")) {
      return;
    }

    removeDocumentMutation.reset();
    removeDocumentMutation.mutate(documentId);
  };

  const openCreateProjectSeedDialog = (documentId: string, documentName: string): void => {
    createProjectSeedMutation.reset();
    setSeedDocumentIds([documentId]);
    setNewProjectName(`${documentName} Graph`);
    setNewProjectDescription("");
    setCreateSeedDialogOpen(true);
  };

  const openAddToProjectSeedDialog = (documentId: string): void => {
    addProjectSeedMutation.reset();
    setSeedDocumentIds([documentId]);
    setTargetProjectId("");
    setAddSeedDialogOpen(true);
  };

  const openBulkCreateProjectSeedDialog = (): void => {
    const selectedIds = [...selectedSeedDocumentIds];
    if (selectedIds.length === 0) {
      return;
    }

    createProjectSeedMutation.reset();
    setSeedDocumentIds(selectedIds);
    setNewProjectName(`Merged ${selectedIds.length} Documents Graph`);
    setNewProjectDescription("");
    setCreateSeedDialogOpen(true);
  };

  const openBulkAddToProjectSeedDialog = (): void => {
    const selectedIds = [...selectedSeedDocumentIds];
    if (selectedIds.length === 0) {
      return;
    }

    addProjectSeedMutation.reset();
    setSeedDocumentIds(selectedIds);
    setTargetProjectId("");
    setAddSeedDialogOpen(true);
  };

  const closeCreateSeedDialog = (): void => {
    setCreateSeedDialogOpen(false);
    setSeedDocumentIds([]);
  };

  const closeAddSeedDialog = (): void => {
    setAddSeedDialogOpen(false);
    setSeedDocumentIds([]);
    setTargetProjectId("");
  };

  const submitCreateProjectSeed = (): void => {
    if (seedDocumentIds.length === 0 || newProjectName.trim().length === 0) {
      return;
    }

    createProjectSeedMutation.mutate({
      documentIds: seedDocumentIds,
      name: newProjectName,
      description: newProjectDescription
    });
  };

  const submitAddToProjectSeed = (): void => {
    if (seedDocumentIds.length === 0 || targetProjectId.length === 0) {
      return;
    }

    addProjectSeedMutation.mutate({
      documentIds: seedDocumentIds,
      projectId: targetProjectId
    });
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Documents
        </Typography>
        <Typography color="text.secondary">
          Upload text/PDF documents, track async jobs, and manage document metadata from backend APIs.
        </Typography>
      </Stack>

      <Card variant="outlined">
        <CardContent sx={{ position: "relative" }}>
          {activeJobId && (
            <Chip
              color="info"
              variant="outlined"
              icon={<CircularProgress size={14} sx={{ color: "info.main" }} />}
              label={`Polling ${activeJobId}`}
              sx={{
                display: { xs: "none", sm: "inline-flex" },
                position: "absolute",
                top: 16,
                right: 16,
                maxWidth: 280,
                "& .MuiChip-label": {
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }
              }}
            />
          )}

          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            Upload Workspace
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Uploading returns a job id (`202`) and processing continues asynchronously. This page polls
            /jobs/&#123;id&#125; until completion.
          </Typography>

          {activeJobId && (
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 2, display: { xs: "flex", sm: "none" } }}
            >
              <CircularProgress size={16} />
              <Typography variant="body2">Polling job {activeJobId}...</Typography>
            </Stack>
          )}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
              Choose .txt or .pdf
              <input hidden accept=".txt,.pdf,text/plain,application/pdf" type="file" onChange={onFileChange} />
            </Button>

            <Typography variant="body2" color="text.secondary">
              {selectedFile
                ? `${selectedFile.name} (${formatBytes(selectedFile.size)})`
                : "No file selected"}
            </Typography>

            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Public
              </Typography>
              <Switch checked={makePublic} onChange={(_, checked) => setMakePublic(checked)} />
            </Stack>

            <Button
              variant="contained"
              onClick={() => uploadMutation.mutate()}
              disabled={!selectedFile || uploadMutation.isPending || Boolean(selectedFileError)}
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </Stack>

          {selectedFileError && <Alert sx={{ mt: 2 }} severity="error">{selectedFileError}</Alert>}
          {uploadMutation.error instanceof Error && (
            <Alert sx={{ mt: 2 }} severity="error">
              {uploadMutation.error.message}
            </Alert>
          )}

          {(uploadMutation.data || lastJob) && (
            <Alert sx={{ mt: 2 }} severity={(lastJob ?? uploadMutation.data)?.status === "failed" ? "error" : "info"}>
              Latest job: {(lastJob ?? uploadMutation.data)?.job_id} - status {(lastJob ?? uploadMutation.data)?.status}
              {(lastJob ?? uploadMutation.data)?.message ? ` - ${(lastJob ?? uploadMutation.data)?.message}` : ""}
            </Alert>
          )}

          {pollTimedOut && activeJobId && (
            <Alert sx={{ mt: 2 }} severity="warning">
              Job {activeJobId} is still running after 5 minutes. You can continue working and refresh later.
            </Alert>
          )}

          {jobQuery.error instanceof Error && (
            <Alert sx={{ mt: 2 }} severity="error">
              {jobQuery.error.message}
            </Alert>
          )}
        </CardContent>
      </Card>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              My Documents
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total: {documentsQuery.data?.total ?? 0}
            </Typography>
          </Box>

          <Stack direction="row" spacing={1.2} sx={{ ml: { sm: "auto" } }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="document-status-filter-label">Status</InputLabel>
              <Select
                labelId="document-status-filter-label"
                label="Status"
                value={statusFilter}
                onChange={onStatusFilterChange}
              >
                <MenuItem value="">All statuses</MenuItem>
                <MenuItem value="queued">queued</MenuItem>
                <MenuItem value="ocr_processing">ocr_processing</MenuItem>
                <MenuItem value="ner_processing">ner_processing</MenuItem>
                <MenuItem value="completed">completed</MenuItem>
                <MenuItem value="failed">failed</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="document-type-filter-label">Type</InputLabel>
              <Select
                labelId="document-type-filter-label"
                label="Type"
                value={typeFilter}
                onChange={onTypeFilterChange}
              >
                <MenuItem value="">All types</MenuItem>
                <MenuItem value="text">text</MenuItem>
                <MenuItem value="pdf">pdf</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Stack>

        <Alert sx={{ mb: 2 }} severity="info">
          Flow: Upload document, wait for completed status, then seed or create a project graph.
        </Alert>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ sm: "center" }} sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Selected completed documents: {selectedSeedCount}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              onClick={openBulkCreateProjectSeedDialog}
              disabled={selectedSeedCount === 0 || createProjectSeedMutation.isPending || addProjectSeedMutation.isPending}
            >
              Create Project from Selected
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={openBulkAddToProjectSeedDialog}
              disabled={selectedSeedCount === 0 || createProjectSeedMutation.isPending || addProjectSeedMutation.isPending}
            >
              Add Selected to Project
            </Button>
          </Stack>
        </Stack>

        {setPublicMutation.error instanceof Error && (
          <Alert sx={{ mb: 2 }} severity="error">
            Backend could not update document visibility: {setPublicMutation.error.message}
          </Alert>
        )}
        {removeDocumentMutation.error instanceof Error && (
          <Alert sx={{ mb: 2 }} severity="error">
            Backend could not remove your document ownership: {removeDocumentMutation.error.message}
          </Alert>
        )}
        {createProjectSeedMutation.error && (
          <Alert sx={{ mb: 2 }} severity="error">
            {formatProjectSeedError(createProjectSeedMutation.error)}
          </Alert>
        )}
        {addProjectSeedMutation.error && (
          <Alert sx={{ mb: 2 }} severity="error">
            {formatProjectSeedError(addProjectSeedMutation.error)}
          </Alert>
        )}

        {documentsQuery.isLoading ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={22} />
            <Typography>Loading documents...</Typography>
          </Stack>
        ) : documentsQuery.error instanceof Error ? (
          <Alert severity="error">{documentsQuery.error.message}</Alert>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">Select</TableCell>
                <TableCell>Filename</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Entities</TableCell>
                <TableCell>Visibility</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((document) => (
                <TableRow key={document.id} selected={selectedDocumentId === document.id}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedSeedDocumentIds.has(document.id)}
                      disabled={document.status !== "completed"}
                      onChange={(event) => onToggleSeedSelection(document.id, event.target.checked)}
                    />
                  </TableCell>
                  <TableCell>{document.fileName}</TableCell>
                  <TableCell>{document.type}</TableCell>
                  <TableCell>{document.status}</TableCell>
                  <TableCell>{document.entityCount}</TableCell>
                  <TableCell>{document.isPublic ? "public" : "private"}</TableCell>
                  <TableCell>{formatApiDate(document.createdAt)}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Button size="small" variant="outlined" onClick={() => onSelectDocument(document.id)}>
                        Inspect
                      </Button>
                      <Button
                        size="small"
                        color="success"
                        variant="outlined"
                        onClick={() => onSetPublic(document.id)}
                        disabled={document.isPublic || setPublicMutation.isPending}
                      >
                        Set Public
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={() => onRemoveDocument(document.id)}
                        disabled={removeDocumentMutation.isPending}
                      >
                        Remove
                      </Button>
                      {document.status === "completed" && (
                        <>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => openCreateProjectSeedDialog(document.id, document.fileName)}
                            disabled={createProjectSeedMutation.isPending || addProjectSeedMutation.isPending}
                          >
                            Create Project
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => openAddToProjectSeedDialog(document.id)}
                            disabled={createProjectSeedMutation.isPending || addProjectSeedMutation.isPending}
                          >
                            Add to Project
                          </Button>
                        </>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography color="text.secondary">No documents found for the selected filters.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      {selectedDocumentId && (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Document Inspector
              </Typography>

              {selectedDocumentQuery.isLoading ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={18} />
                  <Typography>Loading document metadata...</Typography>
                </Stack>
              ) : selectedDocumentQuery.error instanceof Error ? (
                <Alert severity="error">
                  Backend could not load document details for this operation: {selectedDocumentQuery.error.message}
                </Alert>
              ) : selectedDocumentQuery.data ? (
                <Stack spacing={0.5}>
                  <Typography variant="body2">
                    <strong>ID:</strong> {selectedDocumentQuery.data.id}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Filename:</strong> {selectedDocumentQuery.data.filename}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Status:</strong> {selectedDocumentQuery.data.status}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Created:</strong> {formatApiDate(selectedDocumentQuery.data.created_at)}
                  </Typography>
                </Stack>
              ) : null}

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Extracted entities
                </Typography>
                <TextField
                  size="small"
                  label="Schema filter"
                  placeholder="Person, Organization..."
                  value={entitySchemaFilter}
                  onChange={(event) => setEntitySchemaFilter(event.target.value)}
                  disabled={!canFetchDocumentEntities}
                  sx={{ maxWidth: 260 }}
                />
              </Stack>

              {selectedDocumentQuery.data && (
                <Typography variant="body2" color="text.secondary">
                  Total entities: {displayedEntityTotal}
                </Typography>
              )}

              <Box sx={{ minHeight: ENTITY_PANEL_MIN_HEIGHT }}>
                {!selectedDocumentQuery.data ? null : selectedDocumentStatus !== "completed" ? (
                  <Alert severity={selectedDocumentStatus === "failed" ? "warning" : "info"}>
                    {selectedDocumentStatus === "failed"
                      ? `Document processing failed, so extracted entities are unavailable${
                          selectedDocumentQuery.data.error_message
                            ? `: ${selectedDocumentQuery.data.error_message}`
                            : "."
                        }`
                      : `Extracted entities are not available yet. Current status: ${selectedDocumentStatus}.`}
                  </Alert>
                ) : entityPanelState === "loading" ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={18} />
                    <Typography>Loading extracted entities...</Typography>
                  </Stack>
                ) : entityPanelState === "details_temporarily_unavailable" ? (
                  <Alert severity="info">
                    {displayedEntityTotal} entities were extracted. Detailed entity rows are temporarily unavailable.
                  </Alert>
                ) : entityPanelState === "ready_with_rows" ? (
                  <List dense sx={{ maxHeight: 240, overflowY: "auto" }}>
                    {entityResults.map((entity) => (
                      <ListItem key={entity.id} disableGutters>
                        <ListItemText
                          primary={getEntityLabel(entity)}
                          secondary={`${entity.schema} - ${entity.id}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Typography color="text.secondary">
                    {isSchemaFiltered
                      ? "No entities match the current schema filter."
                      : "No entities extracted from this document yet."}
                  </Typography>
                )}
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Dialog open={createSeedDialogOpen} onClose={closeCreateSeedDialog} fullWidth maxWidth="sm">
        <DialogTitle>Create Project from Document</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              This creates a new project snapshot from extracted entities in the selected document.
            </Typography>
            <TextField
              label="Project name"
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Description"
              value={newProjectDescription}
              onChange={(event) => setNewProjectDescription(event.target.value)}
              fullWidth
              multiline
              minRows={3}
            />
            {createProjectSeedMutation.error && (
              <Alert severity="error">{formatProjectSeedError(createProjectSeedMutation.error)}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreateSeedDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitCreateProjectSeed}
            disabled={createProjectSeedMutation.isPending || newProjectName.trim().length === 0}
          >
            {createProjectSeedMutation.isPending ? "Creating..." : "Create & Open Graph"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addSeedDialogOpen} onClose={closeAddSeedDialog} fullWidth maxWidth="sm">
        <DialogTitle>Add Document Entities to Existing Project</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Select a target project. The selected document&apos;s entities will be merged into its snapshot.
            </Typography>
            {projectOptionsQuery.isLoading ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={18} />
                <Typography>Loading projects...</Typography>
              </Stack>
            ) : projectOptionsQuery.error instanceof Error ? (
              <Alert severity="error">{projectOptionsQuery.error.message}</Alert>
            ) : (
              <FormControl fullWidth size="small">
                <InputLabel id="seed-target-project-label">Project</InputLabel>
                <Select
                  labelId="seed-target-project-label"
                  label="Project"
                  value={targetProjectId}
                  onChange={(event) => setTargetProjectId(event.target.value)}
                >
                  {(projectOptionsQuery.data?.results ?? []).map((project) => (
                    <MenuItem key={project.id} value={project.id}>
                      {project.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {addProjectSeedMutation.error && (
              <Alert severity="error">{formatProjectSeedError(addProjectSeedMutation.error)}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAddSeedDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitAddToProjectSeed}
            disabled={
              addProjectSeedMutation.isPending ||
              targetProjectId.length === 0 ||
              (projectOptionsQuery.data?.results.length ?? 0) === 0
            }
          >
            {addProjectSeedMutation.isPending ? "Adding..." : "Add & Open Graph"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
