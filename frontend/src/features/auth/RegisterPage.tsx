import { FormEvent, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useAuth } from "../../app/auth";

export function RegisterPage(): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();

    if (password !== confirmPassword) {
      setErrorMessage("Password confirmation does not match.");
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);

    try {
      await auth.register({
        display_name: displayName.trim(),
        email: email.trim(),
        password
      });

      navigate("/projects", { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={3} maxWidth={520} sx={{ mx: "auto" }}>
      <Stack spacing={0.5}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Create Account
        </Typography>
        <Typography color="text.secondary">
          Register a StoryNet user and receive an authenticated session.
        </Typography>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <form onSubmit={onSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Display name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                fullWidth
              />
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
                helperText="Minimum 8 characters"
                required
                fullWidth
              />
              <TextField
                label="Confirm password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                fullWidth
              />

              {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

              <Button
                type="submit"
                variant="contained"
                disabled={
                  submitting ||
                  displayName.trim().length === 0 ||
                  email.trim().length === 0 ||
                  password.length < 8 ||
                  confirmPassword.length === 0
                }
              >
                {submitting ? "Creating account..." : "Register"}
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>

      <Typography variant="body2" color="text.secondary">
        Already registered?{" "}
        <Button component={RouterLink} to="/auth/login" size="small">
          Sign in
        </Button>
      </Typography>
    </Stack>
  );
}