import { FormEvent, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useAuth } from "../../app/auth";

interface LocationState {
  from?: string;
}

export function LoginPage(): JSX.Element {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as LocationState | null;
  const redirectTo = state?.from && state.from !== "/auth/login" ? state.from : "/projects";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();

    setErrorMessage(null);
    setSubmitting(true);

    try {
      await auth.login({
        email: email.trim(),
        password
      });

      navigate(redirectTo, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={3} maxWidth={460} sx={{ mx: "auto" }}>
      <Stack spacing={0.5}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Sign In
        </Typography>
        <Typography color="text.secondary">
          Authenticate with your StoryNet account to access projects and documents.
        </Typography>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <form onSubmit={onSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                fullWidth
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                fullWidth
              />

              {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

              <Button
                type="submit"
                variant="contained"
                disabled={submitting || email.trim().length === 0 || password.length === 0}
              >
                {submitting ? "Signing in..." : "Sign In"}
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>

      <Typography variant="body2" color="text.secondary">
        Need an account?{" "}
        <Button component={RouterLink} to="/auth/register" size="small">
          Register
        </Button>
      </Typography>
    </Stack>
  );
}