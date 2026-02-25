import type { TokenResponse } from "../types/domain";

const STORAGE_KEY = "storynet.auth.tokens.v1";

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: number;
}

function readStoredTokens(): StoredTokens | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredTokens;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveAuthTokens(payload: TokenResponse): void {
  if (typeof window === "undefined") return;

  const expiresAt = Date.now() + payload.expires_in * 1000;
  const data: StoredTokens = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? "",
    tokenType: payload.token_type,
    expiresAt
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearAuthTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getAccessToken(): string | null {
  return readStoredTokens()?.accessToken ?? null;
}

export function getRefreshToken(): string | null {
  const token = readStoredTokens()?.refreshToken ?? null;
  return token && token.length > 0 ? token : null;
}

export function isAccessTokenExpired(): boolean {
  const tokens = readStoredTokens();
  if (!tokens) return true;
  return Date.now() >= tokens.expiresAt - 10000;
}

export function hasStoredTokens(): boolean {
  return Boolean(readStoredTokens()?.accessToken);
}