import { Link as RouterLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography
} from "@mui/material";
import { RequireAuth, PublicOnlyRoute, useAuth } from "./auth";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { ProjectGraphPage } from "../features/graph/ProjectGraphPage";
import { DocumentsPage } from "../features/documents/DocumentsPage";
import { JobsPage } from "../features/documents/JobsPage";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { ProfilePage } from "../features/auth/ProfilePage";

function RootRedirect(): JSX.Element {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 4 }}>
        <Typography>Checking session...</Typography>
      </Stack>
    );
  }

  return <Navigate to={auth.isAuthenticated ? "/projects" : "/auth/login"} replace />;
}

function NavigationBar(): JSX.Element {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isProjects = location.pathname.startsWith("/projects");
  const isDocuments = location.pathname.startsWith("/documents");
  const isJobs = location.pathname.startsWith("/jobs");
  const isProfile = location.pathname.startsWith("/auth/profile");

  const onLogout = (): void => {
    auth.logout();
    navigate("/auth/login", { replace: true });
  };

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{ borderBottom: "1px solid #d7e0ef", backdropFilter: "blur(6px)" }}
    >
      <Toolbar sx={{ justifyContent: "space-between", gap: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: "8px",
              background: "linear-gradient(135deg, #0b5ed7 0%, #ff7a18 100%)"
            }}
          />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            StoryNet
          </Typography>
        </Stack>

        {auth.isAuthenticated ? (
          <Stack direction="row" spacing={1.2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button
              component={RouterLink}
              to="/projects"
              variant={isProjects ? "contained" : "outlined"}
              color="primary"
            >
              Projects
            </Button>
            <Button
              component={RouterLink}
              to="/documents"
              variant={isDocuments ? "contained" : "outlined"}
              color="primary"
            >
              Documents
            </Button>
            <Button
              component={RouterLink}
              to="/jobs"
              variant={isJobs ? "contained" : "outlined"}
              color="primary"
            >
              Jobs
            </Button>
            <Button
              component={RouterLink}
              to="/auth/profile"
              variant={isProfile ? "contained" : "outlined"}
              color="primary"
            >
              Account
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
              {auth.user?.display_name ?? auth.user?.email}
            </Typography>
            <Button onClick={onLogout} color="inherit" variant="text">
              Logout
            </Button>
          </Stack>
        ) : (
          <Stack direction="row" spacing={1.2}>
            <Button component={RouterLink} to="/auth/login" variant="outlined">
              Login
            </Button>
            <Button component={RouterLink} to="/auth/register" variant="contained">
              Register
            </Button>
          </Stack>
        )}
      </Toolbar>
    </AppBar>
  );
}

function AuthenticatedRoute({ children }: { children: JSX.Element }): JSX.Element {
  return <RequireAuth>{children}</RequireAuth>;
}

function AnonymousRoute({ children }: { children: JSX.Element }): JSX.Element {
  return <PublicOnlyRoute>{children}</PublicOnlyRoute>;
}

export function App(): JSX.Element {
  const location = useLocation();
  const isGraphRoute = location.pathname.includes("/graph");

  return (
    <>
      <NavigationBar />
      <Container sx={{ py: 4 }} maxWidth={isGraphRoute ? false : "lg"}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />

          <Route
            path="/auth/login"
            element={
              <AnonymousRoute>
                <LoginPage />
              </AnonymousRoute>
            }
          />
          <Route
            path="/auth/register"
            element={
              <AnonymousRoute>
                <RegisterPage />
              </AnonymousRoute>
            }
          />

          <Route
            path="/projects"
            element={
              <AuthenticatedRoute>
                <ProjectsPage />
              </AuthenticatedRoute>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <AuthenticatedRoute>
                <Navigate to="graph" replace />
              </AuthenticatedRoute>
            }
          />
          <Route
            path="/projects/:projectId/graph"
            element={
              <AuthenticatedRoute>
                <ProjectGraphPage />
              </AuthenticatedRoute>
            }
          />
          <Route
            path="/documents"
            element={
              <AuthenticatedRoute>
                <DocumentsPage />
              </AuthenticatedRoute>
            }
          />
          <Route
            path="/jobs"
            element={
              <AuthenticatedRoute>
                <JobsPage />
              </AuthenticatedRoute>
            }
          />
          <Route
            path="/auth/profile"
            element={
              <AuthenticatedRoute>
                <ProfilePage />
              </AuthenticatedRoute>
            }
          />

          <Route
            path="*"
            element={
              <Stack spacing={2} alignItems="flex-start">
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  Page Not Found
                </Typography>
                <Button component={RouterLink} to="/" variant="contained">
                  Back to Home
                </Button>
              </Stack>
            }
          />
        </Routes>
      </Container>
    </>
  );
}
