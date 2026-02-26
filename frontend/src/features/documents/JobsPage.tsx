import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import type { DocumentStatus } from "../../types/domain";
import { apiClient } from "../../api/factory";
import { formatApiDate } from "../../lib/date";
import { JobInspectorPanel } from "./JobInspectorPanel";

const PAGE_SIZE = 50;

export function JobsPage(): JSX.Element {
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "">("");
  const [page, setPage] = useState(1);
  const [inspectedJobId, setInspectedJobId] = useState<string | null>(null);

  const jobsQuery = useQuery({
    queryKey: ["jobs", statusFilter, page],
    queryFn: () =>
      apiClient.listJobs({
        status: statusFilter || undefined,
        page,
        pageSize: PAGE_SIZE
      })
  });

  const rows = jobsQuery.data?.results ?? [];
  const total = jobsQuery.data?.total ?? 0;
  const hasPreviousPage = page > 1;
  const hasNextPage = page * PAGE_SIZE < total;

  const onStatusFilterChange = (event: SelectChangeEvent<DocumentStatus | "">): void => {
    setStatusFilter((event.target.value as DocumentStatus | "") ?? "");
    setPage(1);
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Jobs
        </Typography>
        <Typography color="text.secondary">
          List and inspect asynchronous upload-processing jobs from backend APIs.
        </Typography>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Processing Jobs
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total: {total}
            </Typography>
          </Box>

          <FormControl size="small" sx={{ minWidth: 220, ml: { sm: "auto" } }}>
            <InputLabel id="jobs-status-filter-label">Status</InputLabel>
            <Select
              labelId="jobs-status-filter-label"
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
        </Stack>

        {jobsQuery.isLoading ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={22} />
            <Typography>Loading jobs...</Typography>
          </Stack>
        ) : jobsQuery.error instanceof Error ? (
          <Alert severity="error">{jobsQuery.error.message}</Alert>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Job ID</TableCell>
                <TableCell>Document ID</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Progress</TableCell>
                <TableCell>Message</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Updated</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((job) => (
                <TableRow key={job.job_id}>
                  <TableCell>{job.job_id}</TableCell>
                  <TableCell>{job.document_id ?? "n/a"}</TableCell>
                  <TableCell>{job.status}</TableCell>
                  <TableCell>{job.progress ?? "n/a"}</TableCell>
                  <TableCell>{job.message ?? "n/a"}</TableCell>
                  <TableCell>{formatApiDate(job.created_at)}</TableCell>
                  <TableCell>{formatApiDate(job.updated_at)}</TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined" onClick={() => setInspectedJobId(job.job_id)}>
                      Inspect
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography color="text.secondary">No jobs returned for the selected filters.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Stack direction="row" spacing={1.2} alignItems="center" justifyContent="space-between">
        <Typography variant="body2" color="text.secondary">
          Page: {page}
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

      <JobInspectorPanel
        open={Boolean(inspectedJobId)}
        jobId={inspectedJobId}
        onClose={() => setInspectedJobId(null)}
      />
    </Stack>
  );
}
