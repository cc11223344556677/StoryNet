import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import HubIcon from "@mui/icons-material/Hub";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import AddIcon from "@mui/icons-material/Add";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import type { CreateProjectRequest, ProjectCardVM, UpdateProjectRequest } from "../../types/domain";
import { apiClient } from "../../api/factory";
import { mapProjectToCardVM } from "../../api/mappers";
import { formatApiDate } from "../../lib/date";

const PAGE_SIZE = 20;

interface EditDraft {
  name: string;
  description: string;
}

export function ProjectsPage(): JSX.Element {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({ name: "", description: "" });

  const projectsQuery = useQuery({
    queryKey: ["projects", page, PAGE_SIZE],
    queryFn: () => apiClient.listProjects(page, PAGE_SIZE)
  });

  const createProjectMutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const payload: CreateProjectRequest = {
        name: createName.trim(),
        description: createDescription.trim() ? createDescription.trim() : null,
        snapshot: {
          entities: [],
          viewport: {}
        }
      };

      await apiClient.createProject(payload);
    },
    onSuccess: async () => {
      setCreateName("");
      setCreateDescription("");
      setCreateOpen(false);
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const updateProjectMutation = useMutation({
    mutationFn: async (params: { projectId: string; draft: EditDraft }): Promise<void> => {
      const payload: UpdateProjectRequest = {
        name: params.draft.name.trim(),
        description: params.draft.description.trim() ? params.draft.description.trim() : null
      };

      await apiClient.updateProject(params.projectId, payload);
    },
    onSuccess: async () => {
      setEditProjectId(null);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string): Promise<void> => {
      await apiClient.deleteProject(projectId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const projectCards = useMemo<ProjectCardVM[]>(() => {
    const results = projectsQuery.data?.results ?? [];
    return results.map((project) => mapProjectToCardVM(project));
  }, [projectsQuery.data]);

  const totalProjects = projectsQuery.data?.total ?? 0;
  const hasPreviousPage = page > 1;
  const hasNextPage = page * PAGE_SIZE < totalProjects;

  const beginEdit = (project: ProjectCardVM): void => {
    setEditProjectId(project.id);
    setEditDraft({
      name: project.name,
      description: project.description
    });
  };

  const saveEdit = (projectId: string): void => {
    updateProjectMutation.mutate({ projectId, draft: editDraft });
  };

  const requestDelete = (projectId: string): void => {
    if (!window.confirm("Delete this saved project snapshot?")) {
      return;
    }

    deleteProjectMutation.mutate(projectId);
  };

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
            Projects
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage saved graph snapshots. Documents remain independent sources.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.2}>
          <Button
            component={RouterLink}
            to="/documents"
            variant="outlined"
            startIcon={<UploadFileIcon />}
          >
            Seed from Documents
          </Button>
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setCreateOpen(true)}>
            New Project
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info">
        Flow: upload documents, extract entities, seed or create a project snapshot, then explore graph.
      </Alert>

      {createProjectMutation.error instanceof Error && (
        <Alert severity="error">{createProjectMutation.error.message}</Alert>
      )}
      {updateProjectMutation.error instanceof Error && (
        <Alert severity="error">{updateProjectMutation.error.message}</Alert>
      )}
      {deleteProjectMutation.error instanceof Error && (
        <Alert severity="error">{deleteProjectMutation.error.message}</Alert>
      )}
      {projectsQuery.error instanceof Error && <Alert severity="error">{projectsQuery.error.message}</Alert>}

      {projectsQuery.isLoading ? (
        <Stack direction="row" spacing={1.2} alignItems="center">
          <CircularProgress size={24} />
          <Typography>Loading projects...</Typography>
        </Stack>
      ) : projectCards.length === 0 ? (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              No saved projects
            </Typography>
            <Typography color="text.secondary">
              Create a blank project or seed one from documents to persist a graph snapshot.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {projectCards.map((project) => {
            const editing = project.id === editProjectId;

            return (
              <Grid key={project.id} item xs={12} md={6}>
                <Card variant="outlined" sx={{ height: "100%" }}>
                  <CardContent>
                    {editing ? (
                      <Stack spacing={1.5}>
                        <TextField
                          label="Project name"
                          value={editDraft.name}
                          onChange={(event) =>
                            setEditDraft((previous) => ({ ...previous, name: event.target.value }))
                          }
                          fullWidth
                          size="small"
                        />
                        <TextField
                          label="Description"
                          value={editDraft.description}
                          onChange={(event) =>
                            setEditDraft((previous) => ({ ...previous, description: event.target.value }))
                          }
                          fullWidth
                          multiline
                          minRows={3}
                          size="small"
                        />
                      </Stack>
                    ) : (
                      <Stack spacing={1}>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          {project.name}
                        </Typography>
                        <Typography color="text.secondary">
                          {project.description || "No description"}
                        </Typography>
                      </Stack>
                    )}

                    <Stack spacing={0.5} sx={{ mt: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Snapshot entities: {project.snapshotEntityCount}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Created: {formatApiDate(project.createdAt)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Updated: {formatApiDate(project.updatedAt)}
                      </Typography>
                    </Stack>
                  </CardContent>

                  <CardActions sx={{ px: 2, pb: 2, pt: 0, flexWrap: "wrap", gap: 1 }}>
                    {editing ? (
                      <>
                        <Button
                          variant="contained"
                          onClick={() => saveEdit(project.id)}
                          disabled={updateProjectMutation.isPending || editDraft.name.trim().length === 0}
                        >
                          Save
                        </Button>
                        <Button variant="outlined" onClick={() => setEditProjectId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          component={RouterLink}
                          to={`/projects/${project.id}`}
                          startIcon={<FolderOpenIcon />}
                          variant="contained"
                        >
                          Open
                        </Button>
                        <Button
                          component={RouterLink}
                          to={`/projects/${project.id}/graph`}
                          startIcon={<HubIcon />}
                          variant="outlined"
                        >
                          Graph
                        </Button>
                        <Button startIcon={<EditIcon />} onClick={() => beginEdit(project)}>
                          Edit
                        </Button>
                        <Button
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => requestDelete(project.id)}
                          disabled={deleteProjectMutation.isPending}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      <Stack direction="row" spacing={1.2} alignItems="center" justifyContent="space-between">
        <Typography variant="body2" color="text.secondary">
          Total projects: {totalProjects}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" disabled={!hasPreviousPage} onClick={() => setPage((value) => value - 1)}>
            Previous
          </Button>
          <Button variant="outlined" disabled={!hasNextPage} onClick={() => setPage((value) => value + 1)}>
            Next
          </Button>
        </Stack>
      </Stack>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create Project Snapshot</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Project name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Description"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              fullWidth
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => createProjectMutation.mutate()}
            disabled={createProjectMutation.isPending || createName.trim().length === 0}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
