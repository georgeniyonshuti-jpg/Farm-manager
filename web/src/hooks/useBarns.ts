import { useCallback, useState } from "react";
import { API_BASE_URL } from "../api/config";
import { jsonAuthHeaders, readAuthHeaders } from "../lib/authHeaders";

export type BarnOption = {
  id: string;
  name: string;
};

export function useBarns(token: string | null) {
  const [barns, setBarns] = useState<BarnOption[]>([]);
  const [loadingBarns, setLoadingBarns] = useState(false);

  const loadBarns = useCallback(async () => {
    setLoadingBarns(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/barns`, { headers: readAuthHeaders(token) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Could not load barns");
      const rows = Array.isArray((d as { barns?: BarnOption[] }).barns) ? (d as { barns: BarnOption[] }).barns : [];
      setBarns(rows);
      return rows;
    } finally {
      setLoadingBarns(false);
    }
  }, [token]);

  const createBarn = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Barn name is required");
    const r = await fetch(`${API_BASE_URL}/api/barns`, {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify({ name: trimmed }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d as { error?: string }).error ?? "Could not create barn");
    const created = (d as { barn?: BarnOption }).barn;
    await loadBarns();
    return created ?? null;
  }, [loadBarns, token]);

  return { barns, loadingBarns, loadBarns, createBarn };
}
