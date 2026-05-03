import { useCallback, useState } from "react";
import { API_BASE_URL } from "../api/config";
import { jsonAuthHeaders, readAuthHeaders } from "../lib/authHeaders";

export type BarnNameOption = {
  id: string;
  name: string;
};

export function useBarnNames(token: string | null) {
  const [barnNames, setBarnNames] = useState<BarnNameOption[]>([]);

  const loadBarnNames = useCallback(async () => {
    const r = await fetch(`${API_BASE_URL}/api/barn-names`, { headers: readAuthHeaders(token) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d as { error?: string }).error ?? "Could not load barn names");
    const rows = Array.isArray((d as { barnNames?: BarnNameOption[] }).barnNames)
      ? (d as { barnNames: BarnNameOption[] }).barnNames
      : [];
    setBarnNames(rows);
    return rows;
  }, [token]);

  const createBarnName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Barn name is required");
      const r = await fetch(`${API_BASE_URL}/api/barn-names`, {
        method: "POST",
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ name: trimmed }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Could not create barn name");
      const created = (d as { barnName?: BarnNameOption }).barnName;
      await loadBarnNames();
      return created ?? null;
    },
    [loadBarnNames, token]
  );

  return { barnNames, loadBarnNames, createBarnName };
}
