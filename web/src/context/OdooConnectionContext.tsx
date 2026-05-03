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

export type OdooConnectionStatus = {
  connected: boolean;
  uid?: number | null;
  error?: string;
  customers?: number;
  vendors?: number;
  invoices?: number;
  bills?: number;
  journalEntries?: number;
  products?: number;
  accounts?: number;
};

const POLL_MS = 7 * 60 * 1000;

type OdooConnectionContextValue = {
  status: OdooConnectionStatus | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

const OdooConnectionContext = createContext<OdooConnectionContextValue | null>(null);

export function OdooConnectionProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [status, setStatus] = useState<OdooConnectionStatus | null>(null);
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
      const res = await fetch(`${API_BASE_URL}/api/odoo-setup/status`, {
        headers: readAuthHeaders(token),
      });
      const data = (await res.json().catch(() => ({}))) as
        | OdooConnectionStatus
        | { error?: string };
      if (!res.ok) {
        const msg = "error" in data && data.error ? String(data.error) : "Could not load Odoo status";
        setStatus({ connected: false, error: msg, uid: null });
        setError(msg);
        return;
      }
      setStatus(data as OdooConnectionStatus);
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
    <OdooConnectionContext.Provider value={value}>{children}</OdooConnectionContext.Provider>
  );
}

export function useOdooConnection(): OdooConnectionContextValue {
  const ctx = useContext(OdooConnectionContext);
  if (!ctx) {
    throw new Error("useOdooConnection must be used within OdooConnectionProvider");
  }
  return ctx;
}
