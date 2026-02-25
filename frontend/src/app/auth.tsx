import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { CircularProgress, Stack, Typography } from "@mui/material";
import type { ChangePasswordRequest, LoginRequest, RegisterRequest, UserProfile } from "../types/domain";
import { apiClient } from "../api/factory";
import { clearAuthTokens, hasStoredTokens, saveAuthTokens } from "../lib/authStorage";

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  refreshProfile: () => Promise<void>;
  changePassword: (input: ChangePasswordRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async (): Promise<void> => {
    const profile = await apiClient.me();
    setUser(profile);
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!hasStoredTokens()) {
        if (mounted) {
          setIsLoading(false);
        }
        return;
      }

      try {
        const profile = await apiClient.me();
        if (mounted) {
          setUser(profile);
        }
      } catch {
        clearAuthTokens();
        if (mounted) {
          setUser(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (input: LoginRequest): Promise<void> => {
    const token = await apiClient.login(input);
    saveAuthTokens(token);
    const profile = await apiClient.me();
    setUser(profile);
  }, []);

  const register = useCallback(async (input: RegisterRequest): Promise<void> => {
    const token = await apiClient.register(input);
    saveAuthTokens(token);
    const profile = await apiClient.me();
    setUser(profile);
  }, []);

  const changePassword = useCallback(async (input: ChangePasswordRequest): Promise<void> => {
    await apiClient.changePassword(input);
  }, []);

  const logout = useCallback((): void => {
    clearAuthTokens();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      register,
      refreshProfile,
      changePassword,
      logout
    }),
    [user, isLoading, login, register, refreshProfile, changePassword, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider.");
  }

  return context;
}

function AuthLoadingState(): JSX.Element {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 4 }}>
      <CircularProgress size={24} />
      <Typography>Checking session...</Typography>
    </Stack>
  );
}

interface GuardProps {
  children: JSX.Element;
}

export function RequireAuth({ children }: GuardProps): JSX.Element {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return <AuthLoadingState />;
  }

  if (!auth.isAuthenticated) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/auth/login" replace state={{ from }} />;
  }

  return children;
}

export function PublicOnlyRoute({ children }: GuardProps): JSX.Element {
  const auth = useAuth();

  if (auth.isLoading) {
    return <AuthLoadingState />;
  }

  if (auth.isAuthenticated) {
    return <Navigate to="/projects" replace />;
  }

  return children;
}