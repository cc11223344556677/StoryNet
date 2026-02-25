import { FormEvent, useState } from "react";
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useAuth } from "../../app/auth";
import { formatApiDate } from "../../lib/date";

export function ProfilePage(): JSX.Element {
  const auth = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      setErrorMessage("New password and confirmation do not match.");
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      await auth.changePassword({
        current_password: currentPassword,
        new_password: newPassword
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccessMessage("Password changed successfully.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Password change failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={3} maxWidth={640}>
      <Stack spacing={0.5}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Account
        </Typography>
        <Typography color="text.secondary">
          Manage your authenticated profile and credentials.
        </Typography>
      </Stack>

      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="subtitle2" color="text.secondary">
              Display Name
            </Typography>
            <Typography variant="body1">{auth.user?.display_name ?? "n/a"}</Typography>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
              Email
            </Typography>
            <Typography variant="body1">{auth.user?.email ?? "n/a"}</Typography>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
              Created
            </Typography>
            <Typography variant="body1">{formatApiDate(auth.user?.created_at)}</Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
            Change Password
          </Typography>

          <form onSubmit={onSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Current password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                fullWidth
              />
              <TextField
                label="New password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                helperText="Minimum 8 characters"
                required
                fullWidth
              />
              <TextField
                label="Confirm new password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                fullWidth
              />

              {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
              {successMessage && <Alert severity="success">{successMessage}</Alert>}

              <Button
                type="submit"
                variant="contained"
                disabled={
                  submitting ||
                  currentPassword.length === 0 ||
                  newPassword.length < 8 ||
                  confirmPassword.length === 0
                }
              >
                {submitting ? "Saving..." : "Update Password"}
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Stack>
  );
}
