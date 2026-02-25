import { useEffect, useMemo, useState } from "react";
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
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import HubIcon from "@mui/icons-material/Hub";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import SaveIcon from "@mui/icons-material/Save";
import type { FtMEntity, ProjectSnapshot } from "../../types/domain";
import { apiClient } from "../../api/factory";
import { getEntityLabel, isLikelyRelationshipSchema } from "../../api/mappers";
import { formatApiDate } from "../../lib/date";

function mergeSnapshotViewport(snapshot: ProjectSnapshot): Record<string, unknown> {
  return {
    ...(snapshot.viewport ?? {}),
    last_saved_from: "project-detail",
    saved_at: new Date().toISOString()
  };
}

export function ProjectDetailPage(): JSX.Element {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => apiClient.getProject(projectId!),
    enabled: Boolean(projectId)
  });

  useEffect(() => {
    if (!projectQuery.data) {
      return;
    }

    setName(projectQuery.data.name);
    setDescription(projectQuery.data.description ?? "");
  }, [projectQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      if (!projectId || !projectQuery.data) {
        throw new Error("Project is not loaded.");
      }

      await apiClient.updateProject(projectId, {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        snapshot: {
          entities: projectQuery.data.snapshot.entities,
          viewport: mergeSnapshotViewport(projectQuery.data.snapshot)
        }
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const snapshotStats = useMemo(() => {
    const entities = projectQuery.data?.snapshot.entities ?? [];
    const relationshipCount = entities.filter((entity) => isLikelyRelationshipSchema(entity.schema)).length;
    const nodeCount = Math.max(0, entities.length - relationshipCount);

    return {
      total: entities.length,
      nodeCount,
      relationshipCount
    };
  }, [projectQuery.data]);

  const previewNodes = useMemo<FtMEntity[]>(() => {
    const entities = projectQuery.data?.snapshot.entities ?? [];
    return entities.filter((entity) => !isLikelyRelationshipSchema(entity.schema)).slice(0, 12);
  }, [projectQuery.data]);

  if (!projectId) {
    return <Alert severity="error">Project id is missing from the URL.</Alert>;
  }

  if (projectQuery.isLoading) {
    return (
      <Stack direction="row" spacing={1.2} alignItems="center">
        <CircularProgress size={24} />
        <Typography>Loading project snapshot...</Typography>
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
            {projectQuery.data.name}
          </Typography>
          <Typography color="text.secondary">Snapshot-backed project detail and save controls.</Typography>
        </Box>

        <Stack direction="row" spacing={1.2}>
          <Button component={RouterLink} to="/projects" variant="outlined" startIcon={<ArrowBackIcon />}>
            Projects
          </Button>
          <Button component={RouterLink} to="/documents" variant="outlined" startIcon={<UploadFileIcon />}>
            Documents
          </Button>
          <Button
            component={RouterLink}
            to={`/projects/${projectQuery.data.id}/graph`}
            variant="contained"
            startIcon={<HubIcon />}
          >
            Open Graph
          </Button>
        </Stack>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Metadata
          </Typography>

          <Stack spacing={2}>
            <TextField
              label="Project name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              fullWidth
              multiline
              minRows={3}
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
              <Typography variant="body2" color="text.secondary">
                Created: {formatApiDate(projectQuery.data.created_at)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Updated: {formatApiDate(projectQuery.data.updated_at)}
              </Typography>
            </Stack>

            {saveMutation.error instanceof Error && <Alert severity="error">{saveMutation.error.message}</Alert>}
            {saveMutation.isSuccess && <Alert severity="success">Project snapshot saved.</Alert>}

            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || name.trim().length === 0}
            >
              {saveMutation.isPending ? "Saving..." : "Save Project Snapshot"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Divider />

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            Snapshot Overview
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
            <Typography variant="body2" color="text.secondary">
              Total entities: {snapshotStats.total}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Node entities: {snapshotStats.nodeCount}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Relationship entities: {snapshotStats.relationshipCount}
            </Typography>
          </Stack>

          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
            Snapshot node preview
          </Typography>

          {previewNodes.length === 0 ? (
            <Alert sx={{ mt: 1 }} severity="info">
              No node entities in this snapshot yet.
            </Alert>
          ) : (
            <List dense sx={{ mt: 1 }}>
              {previewNodes.map((entity) => (
                <ListItem key={entity.id} disableGutters>
                  <ListItemText primary={getEntityLabel(entity)} secondary={`${entity.schema} - ${entity.id}`} />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
