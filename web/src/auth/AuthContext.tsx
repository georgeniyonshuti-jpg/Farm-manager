import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ActiveWorkspace, SessionUser } from "./types";
import {
  canAccessWorkspace,
  defaultWorkspaceForUser,
} from "./permissions";

const AUTH_STORAGE_KEY = "fm_auth_token";

type LoginCredentials = { email: string; password: string };

type AuthContextValue = {
  user: SessionUser | null;
  token: string | null;
  activeWorkspace: ActiveWorkspace | null;
  bootstrapped: boolean;
  login: (creds: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  setActiveWorkspace: (w: ActiveWorkspace) => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(token: string): Promise<SessionUser> {
  const res = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Session expired");
  }
  return (data as { user: SessionUser }).user;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(AUTH_STORAGE_KEY));
  const [activeWorkspace, setActiveWorkspaceState] = useState<ActiveWorkspace | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  const setTokenPersist = useCallback((t: string | null) => {
    setToken(t);
    if (t) localStorage.setItem(AUTH_STORAGE_KEY, t);
    else localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  const refreshMe = useCallback(async () => {
    const t = token ?? localStorage.getItem(AUTH_STORAGE_KEY);
    if (!t) {
      setUser(null);
      setActiveWorkspaceState(null);
      return;
    }
    const me = await fetchMe(t);
    setUser(me);
    const def = defaultWorkspaceForUser(me);
    setActiveWorkspaceState((prev) => {
      if (prev && canAccessWorkspace(me, prev)) return prev;
      return def;
    });
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!t) {
          setUser(null);
          setActiveWorkspaceState(null);
          return;
        }
        const me = await fetchMe(t);
        if (cancelled) return;
        setUser(me);
        setToken(t);
        const def = defaultWorkspaceForUser(me);
        setActiveWorkspaceState(def);
      } catch {
        if (!cancelled) {
          setUser(null);
          setTokenPersist(null);
          setActiveWorkspaceState(null);
        }
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setTokenPersist]);

  const login = useCallback(
    async (creds: LoginCredentials) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Login failed");
      }
      const t = (data as { token: string }).token;
      const u = (data as { user: SessionUser }).user;
      setTokenPersist(t);
      setUser(u);
      setActiveWorkspaceState(defaultWorkspaceForUser(u));
    },
    [setTokenPersist]
  );

  const logout = useCallback(async () => {
    const t = token ?? localStorage.getItem(AUTH_STORAGE_KEY);
    if (t) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}` },
      }).catch(() => {});
    }
    setTokenPersist(null);
    setUser(null);
    setActiveWorkspaceState(null);
  }, [setTokenPersist, token]);

  const setActiveWorkspace = useCallback(
    (w: ActiveWorkspace) => {
      if (user && canAccessWorkspace(user, w)) setActiveWorkspaceState(w);
    },
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      activeWorkspace,
      bootstrapped,
      login,
      logout,
      refreshMe,
      setActiveWorkspace,
    }),
    [user, token, activeWorkspace, bootstrapped, login, logout, refreshMe, setActiveWorkspace]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
