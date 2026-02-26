import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  Stack,
  Typography
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { apiClient } from "../../api/factory";
import { formatApiDate } from "../../lib/date";
import type { DocumentStatus } from "../../types/domain";

const TERMINAL_JOB_STATES: ReadonlySet<DocumentStatus> = new Set(["completed", "failed"]);

interface JobInspectorPanelProps {
  jobId: string | null;
  open: boolean;
  onClose: () => void;
}

function encodeInspectLink(documentId: string): string {
  return `/documents?inspect=${encodeURIComponent(documentId)}`;
}

export function JobInspectorPanel({ jobId, open, onClose }: JobInspectorPanelProps): JSX.Element {
  const jobQuery = useQuery({
    queryKey: ["job-inspector", jobId],
    queryFn: () => apiClient.getJob(jobId!),
    enabled: Boolean(open && jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && TERMINAL_JOB_STATES.has(status)) {
        return false;
      }

      return 1500;
    }
  });

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: 320, sm: 420 }, p: 2.5 }}>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Job Inspector
            </Typography>
            <Button size="small" onClick={onClose}>
              Close
            </Button>
          </Stack>

          {!jobId ? (
            <Alert severity="info">Select a job to inspect.</Alert>
          ) : jobQuery.isLoading ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} />
              <Typography>Loading job details...</Typography>
            </Stack>
          ) : jobQuery.error instanceof Error ? (
            <Alert severity="error">{jobQuery.error.message}</Alert>
          ) : jobQuery.data ? (
            <Stack spacing={1.2}>
              <Typography variant="body2"><strong>Job ID:</strong> {jobQuery.data.job_id}</Typography>
              <Typography variant="body2"><strong>Status:</strong> {jobQuery.data.status}</Typography>
              <Typography variant="body2"><strong>Progress:</strong> {jobQuery.data.progress ?? "n/a"}</Typography>
              <Typography variant="body2"><strong>Message:</strong> {jobQuery.data.message ?? "n/a"}</Typography>
              <Typography variant="body2"><strong>Created:</strong> {formatApiDate(jobQuery.data.created_at)}</Typography>
              <Typography variant="body2"><strong>Updated:</strong> {formatApiDate(jobQuery.data.updated_at)}</Typography>
              <Typography variant="body2"><strong>Document ID:</strong> {jobQuery.data.document_id ?? "n/a"}</Typography>

              {jobQuery.data.document_id && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Button
                    variant="outlined"
                    component={RouterLink}
                    to={encodeInspectLink(jobQuery.data.document_id)}
                    onClick={onClose}
                  >
                    Open Document Inspector
                  </Button>
                </>
              )}
            </Stack>
          ) : (
            <Alert severity="info">No data returned for this job.</Alert>
          )}
        </Stack>
      </Box>
    </Drawer>
  );
}
