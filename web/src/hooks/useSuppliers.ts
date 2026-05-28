import { useCallback, useState } from "react";
import { API_BASE_URL } from "../api/config";
import { jsonAuthHeaders, readAuthHeaders } from "../lib/authHeaders";

export type SupplierOption = {
  id: string;
  name: string;
};

export function useSuppliers(token: string | null) {
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  const loadSuppliers = useCallback(async () => {
    setLoadingSuppliers(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/suppliers`, { headers: readAuthHeaders(token) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Could not load suppliers");
      const rows = Array.isArray((d as { suppliers?: SupplierOption[] }).suppliers) ? (d as { suppliers: SupplierOption[] }).suppliers : [];
      setSuppliers(rows);
      return rows;
    } finally {
      setLoadingSuppliers(false);
    }
  }, [token]);

  const createSupplier = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Supplier name is required");
    const r = await fetch(`${API_BASE_URL}/api/suppliers`, {
      method: "POST",
      headers: jsonAuthHeaders(token),
      body: JSON.stringify({ name: trimmed }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d as { error?: string }).error ?? "Could not create supplier");
    const created = (d as { supplier?: SupplierOption }).supplier;
    await loadSuppliers();
    return created ?? null;
  }, [loadSuppliers, token]);

  return { suppliers, loadingSuppliers, loadSuppliers, createSupplier };
}
