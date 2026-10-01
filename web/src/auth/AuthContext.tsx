import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ActiveWorkspace, SessionUser } from "./types";
import {
  canAccessWorkspace,
  defaultWorkspaceForUser,
} from "./permissions";
import { readAuthHeaders } from "../lib/authHeaders";
import { API_BASE_URL, IS_FRAPPE_MODE } from "../api/config";
import {
  frappeGetMe,
  frappeLogin,
  frappeLogout,
} from "../api/frappe.api";
import { setErpnextSessionId } from "../lib/erpnextSession";
import {
  AGGREGATE_CHECKIN_QUERY_KEY,
  type AggregateCheckinPayload,
} from "../hooks/useFieldOpsHubStatus";
import {
  applyBootstrapToUser,
  clearStoredFarmBootstrap,
  persistFarmBootstrap,
  type FarmBootstrap,
} from "./farmBootstrap";

const AUTH_STORAGE_KEY = "fm_auth_token";

type LoginCredentials = { email: string; password: string };

type AuthContextValue = {
  user: SessionUser | null;
  token: string | null;
  activeWorkspace: ActiveWorkspace | null;
  bootstrapped: boolean;
  farmBootstrap: FarmBootstrap | null;
  login: (creds: LoginCredentials) => Promise<SessionUser>;
  logout: () => Promise<void>;
  setActiveWorkspace: (w: ActiveWorkspace) => void;
  refreshMe: () => Promise<void>;
  establishSession: (token: string, user: SessionUser, farmBootstrap?: FarmBootstrap | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type BootstrapPayload = {
  user: SessionUser;
  fieldHub?: AggregateCheckinPayload | null;
  farmBootstrap?: FarmBootstrap | null;
};

function applyBootstrapSession(
  bootstrap: FarmBootstrap | null | undefined,
  user: SessionUser
): { user: SessionUser; farmBootstrap: FarmBootstrap | null } {
  const farmBootstrap = bootstrap ?? null;
  persistFarmBootstrap(farmBootstrap);
  return { user: applyBootstrapToUser(user, farmBootstrap), farmBootstrap };
}

async function fetchBootstrap(token: string): Promise<BootstrapPayload> {
  const res = await fetch(`${API_BASE_URL}/api/bootstrap`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) {
    const err = new Error((data as { error?: string }).error ?? "Too many requests. Wait a moment.");
    (err as Error & { status?: number }).status = 429;
    throw err;
  }
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Session expired");
  }
  const user = (data as BootstrapPayload).user;
  if (!user || typeof user !== "object" || !("email" in user)) {
    // Same-origin SPA HTML mistake or broken proxy — fall back to /api/auth/me.
    throw new Error("Invalid bootstrap payload");
  }
  return data as BootstrapPayload;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(AUTH_STORAGE_KEY));
  const [activeWorkspace, setActiveWorkspaceState] = useState<ActiveWorkspace | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [farmBootstrap, setFarmBootstrap] = useState<FarmBootstrap | null>(null);

  const seedFieldHub = useCallback(
    (t: string, fieldHub: AggregateCheckinPayload | null | undefined) => {
      if (!fieldHub) return;
      queryClient.setQueryData([AGGREGATE_CHECKIN_QUERY_KEY, t], fieldHub);
    },
    [queryClient]
  );

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
      setFarmBootstrap(null);
      return;
    }
    if (IS_FRAPPE_MODE) {
      const me = (await frappeGetMe()) as SessionUser;
      setUser(me);
      const def = defaultWorkspaceForUser(me);
      setActiveWorkspaceState((prev) => {
        if (prev && canAccessWorkspace(me, prev)) return prev;
        return def;
      });
      return;
    }
    const boot = await fetchBootstrap(t);
    const applied = applyBootstrapSession(boot.farmBootstrap, boot.user);
    setUser(applied.user);
    setFarmBootstrap(applied.farmBootstrap);
    seedFieldHub(t, boot.fieldHub);
    const def = defaultWorkspaceForUser(applied.user);
    setActiveWorkspaceState((prev) => {
      if (prev && canAccessWorkspace(applied.user, prev)) return prev;
      return def;
    });
  }, [token, seedFieldHub]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (IS_FRAPPE_MODE) {
          const me = await frappeGetMe();
          if (cancelled) return;
          setUser(me as SessionUser);
          setToken("frappe-session");
          setActiveWorkspaceState(defaultWorkspaceForUser(me as SessionUser));
          return;
        }
        const t = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!t) {
          setUser(null);
          setActiveWorkspaceState(null);
          setFarmBootstrap(null);
          return;
        }
        try {
          const boot = await fetchBootstrap(t);
          if (cancelled) return;
          const applied = applyBootstrapSession(boot.farmBootstrap, boot.user);
          setUser(applied.user);
          setFarmBootstrap(applied.farmBootstrap);
          setToken(t);
          seedFieldHub(t, boot.fieldHub);
          setActiveWorkspaceState(defaultWorkspaceForUser(applied.user));
        } catch (e) {
          if ((e as { status?: number }).status === 429) {
            if (!cancelled) setBootstrapped(true);
            return;
          }
          // Token present but bootstrap failed — clear session so login is reachable.
          if (!cancelled) {
            setUser(null);
            setFarmBootstrap(null);
            clearStoredFarmBootstrap();
            setTokenPersist(null);
            setActiveWorkspaceState(null);
          }
        }
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
  }, [setTokenPersist, seedFieldHub]);

  const login = useCallback(
    async (creds: LoginCredentials): Promise<SessionUser> => {
      if (IS_FRAPPE_MODE) {
        await frappeLogin(creds.email, creds.password);
        const u = (await frappeGetMe()) as SessionUser;
        setTokenPersist("frappe-session");
        setUser(u);
        setActiveWorkspaceState(defaultWorkspaceForUser(u));
        return u;
      }
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
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
      try {
        const boot = await fetchBootstrap(t);
        const applied = applyBootstrapSession(boot.farmBootstrap, u);
        setUser(applied.user);
        setFarmBootstrap(applied.farmBootstrap);
        seedFieldHub(t, boot.fieldHub);
      } catch {
        /* non-fatal */
      }
      return u;
    },
    [setTokenPersist, seedFieldHub]
  );

  const logout = useCallback(async () => {
    if (IS_FRAPPE_MODE) {
      await frappeLogout();
      setTokenPersist(null);
      setUser(null);
      setActiveWorkspaceState(null);
      return;
    }
    const t = token ?? localStorage.getItem(AUTH_STORAGE_KEY);
    if (t) {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: readAuthHeaders(t),
      }).catch(() => {});
      await fetch(`${API_BASE_URL}/api/erpnext/session/logout`, {
        method: "POST",
        headers: readAuthHeaders(t),
      }).catch(() => {});
    }
    setErpnextSessionId(null);
    clearStoredFarmBootstrap();
    setFarmBootstrap(null);
    setTokenPersist(null);
    setUser(null);
    setActiveWorkspaceState(null);
    queryClient.clear();
  }, [setTokenPersist, token, queryClient]);

  const setActiveWorkspace = useCallback(
    (w: ActiveWorkspace) => {
      if (user && canAccessWorkspace(user, w)) setActiveWorkspaceState(w);
    },
    [user]
  );

  const establishSession = useCallback(
    (t: string, u: SessionUser, bootstrap?: FarmBootstrap | null) => {
      const applied = applyBootstrapSession(bootstrap, u);
      setTokenPersist(t);
      setUser(applied.user);
      setFarmBootstrap(applied.farmBootstrap);
      setActiveWorkspaceState(defaultWorkspaceForUser(applied.user));
      void fetchBootstrap(t)
        .then((boot) => {
          const refreshed = applyBootstrapSession(boot.farmBootstrap ?? applied.farmBootstrap, boot.user);
          setUser(refreshed.user);
          setFarmBootstrap(refreshed.farmBootstrap);
          seedFieldHub(t, boot.fieldHub);
        })
        .catch(() => {});
    },
    [setTokenPersist, seedFieldHub]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      activeWorkspace,
      bootstrapped,
      farmBootstrap,
      login,
      logout,
      refreshMe,
      establishSession,
      setActiveWorkspace,
    }),
    [user, token, activeWorkspace, bootstrapped, farmBootstrap, login, logout, refreshMe, establishSession, setActiveWorkspace]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
