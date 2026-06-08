import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { canViewOdooConnectionStatus } from "../auth/permissions";
import { API_BASE_URL } from "../api/config";
import { readAuthHeaders } from "../lib/authHeaders";

export type ERPNextConnectionStatus = {
  connected: boolean;
  user?: string | null;
  error?: string;
  company?: string;
  companies?: number;
  customers?: number;
  loans?: number;
  accounts?: number;
  erpnextUrl?: string;
  authMode?: "session" | "api_key" | "none" | string;
  /** @deprecated Odoo uid — kept for backward compatibility */
  uid?: number | null;
};

/** @deprecated use ERPNextConnectionStatus */
export type OdooConnectionStatus = ERPNextConnectionStatus;

const POLL_MS = 7 * 60 * 1000;

type ERPNextConnectionContextValue = {
  status: ERPNextConnectionStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

const ERPNextConnectionContext = createContext<ERPNextConnectionContextValue | null>(null);

export function ERPNextConnectionProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [status, setStatus] = useState<ERPNextConnectionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!token || !canViewOdooConnectionStatus(user)) {
      setStatus(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/erpnext/status`, {
        headers: readAuthHeaders(token),
      });
      const data = (await res.json().catch(() => ({}))) as ERPNextConnectionStatus & { error?: string };
      if (!res.ok) {
        const msg = data.error ? String(data.error) : "Could not load ERPNext status";
        setStatus({ connected: false, error: msg, uid: null });
        setError(msg);
        return;
      }
      setStatus(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setStatus({ connected: false, error: msg, uid: null });
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!token || !canViewOdooConnectionStatus(user)) return;
    const t = window.setInterval(() => void refetch(), POLL_MS);
    return () => window.clearInterval(t);
  }, [refetch, token, user]);

  const value = useMemo(
    () => ({ status, loading, error, refetch }),
    [status, loading, error, refetch]
  );

  return (
    <ERPNextConnectionContext.Provider value={value}>{children}</ERPNextConnectionContext.Provider>
  );
}

export function useERPNextConnection(): ERPNextConnectionContextValue {
  const ctx = useContext(ERPNextConnectionContext);
  if (!ctx) {
    throw new Error("useERPNextConnection must be used within ERPNextConnectionProvider");
  }
  return ctx;
}

/** Backward compatibility aliases */
export const OdooConnectionProvider = ERPNextConnectionProvider;
export function useOdooConnection(): ERPNextConnectionContextValue {
  return useERPNextConnection();
}
