import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
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
import type { DocumentStatus, DocumentType, JobStatus } from "../../types/domain";
import { apiClient } from "../../api/factory";
import { StoryNetApiError } from "../../api/errors";
import { getEntityLabel, mapDocumentToVM } from "../../api/mappers";
import { formatApiDate } from "../../lib/date";

const TERMINAL_JOB_STATES: ReadonlySet<DocumentStatus> = new Set(["completed", "failed"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const JOB_POLL_MAX_MS = 5 * 60 * 1000;
const SET_PUBLIC_VERIFY_DELAY_MS = 600;

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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
    if (!selectedDocumentId) {
      return;
    }

    const stillPresent = (documentsQuery.data?.results ?? []).some(
      (document) => document.id === selectedDocumentId
    );
    if (!stillPresent) {
      setSelectedDocumentId(null);
    }
  }, [documentsQuery.data, selectedDocumentId]);

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
      await apiClient.deleteDocument(documentId);
    },
    onSuccess: async (_, documentId) => {
      if (selectedDocumentId === documentId) {
        setSelectedDocumentId(null);
      }

      await queryClient.invalidateQueries({ queryKey: ["documents"] });
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

  const onStatusFilterChange = (event: SelectChangeEvent<DocumentStatus | "">): void => {
    setStatusFilter((event.target.value as DocumentStatus | "") ?? "");
  };

  const onTypeFilterChange = (event: SelectChangeEvent<DocumentType | "">): void => {
    setTypeFilter((event.target.value as DocumentType | "") ?? "");
  };

  const onSelectDocument = (documentId: string): void => {
    setSelectedDocumentId(documentId);
  };

  const onSetPublic = (documentId: string): void => {
    setPublicMutation.mutate(documentId);
  };

  const onRemoveDocument = (documentId: string): void => {
    if (!window.confirm("Remove your ownership of this document?")) {
      return;
    }

    removeDocumentMutation.mutate(documentId);
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
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
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
              ) : documentEntitiesQuery.isLoading ? (
                <Stack direction="row" spacing={1} alignItems="center">
                  <CircularProgress size={18} />
                  <Typography>Loading extracted entities...</Typography>
                </Stack>
              ) : documentEntitiesQuery.error instanceof Error ? (
                <Alert severity="error">
                  Backend could not load extracted entities for this document: {documentEntitiesQuery.error.message}
                </Alert>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary">
                    Total entities: {documentEntitiesQuery.data?.total ?? 0}
                  </Typography>
                  <List dense>
                    {(documentEntitiesQuery.data?.results ?? []).map((entity) => (
                      <ListItem key={entity.id} disableGutters>
                        <ListItemText
                          primary={getEntityLabel(entity)}
                          secondary={`${entity.schema} - ${entity.id}`}
                        />
                      </ListItem>
                    ))}
                    {(documentEntitiesQuery.data?.results.length ?? 0) === 0 && (
                      <ListItem disableGutters>
                        <ListItemText primary="No entities returned for this document." />
                      </ListItem>
                    )}
                  </List>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
