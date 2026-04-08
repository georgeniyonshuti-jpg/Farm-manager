import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../api/config";
import { readAuthHeaders } from "../lib/authHeaders";
import type { CheckinStatus } from "../pages/farm/checkinStatusTypes";

export type FlockListRow = {
  id: string;
  label: string;
  code?: string | null;
  placementDate?: string;
  initialCount?: number;
};

export type FieldPerformanceSummary = {
  birdsLiveEstimate: number;
  computedBirdsLiveEstimate?: number;
  verifiedLiveCount?: number | null;
  mortalityToDate: number;
};

/**
 * Flock list + check-in status + performance summary for field-operation pages.
 */
export function useFlockFieldContext(token: string | null) {
  const [flocks, setFlocks] = useState<FlockListRow[]>([]);
  const [flockId, setFlockId] = useState("");
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [performance, setPerformance] = useState<FieldPerformanceSummary | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFlocks = useCallback(async () => {
    if (!token) {
      setFlocks([]);
      setFlockId("");
      setListLoading(false);
      return;
    }
    setError(null);
    setListLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/api/flocks`, { headers: readAuthHeaders(token) });
      const d = await r.json();
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Flocks failed");
      const list = (d.flocks as FlockListRow[]) ?? [];
      setFlocks(list);
      setFlockId((prev) => (prev && list.some((f) => f.id === prev) ? prev : list[0]?.id ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setFlocks([]);
      setFlockId("");
    } finally {
      setListLoading(false);
    }
  }, [token]);

  const loadDetails = useCallback(async () => {
    if (!token || !flockId) {
      setStatus(null);
      setPerformance(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      const [sr, pr] = await Promise.all([
        fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/checkin-status`, {
          headers: readAuthHeaders(token),
        }),
        fetch(`${API_BASE_URL}/api/flocks/${encodeURIComponent(flockId)}/performance-summary`, {
          headers: readAuthHeaders(token),
        }),
      ]);
      const sd = await sr.json();
      const pd = await pr.json();
      if (!sr.ok) throw new Error((sd as { error?: string }).error ?? "Status failed");
      if (!pr.ok) throw new Error((pd as { error?: string }).error ?? "Performance failed");
      setStatus(sd as CheckinStatus);
      setPerformance({
        birdsLiveEstimate: Number((pd as { birdsLiveEstimate?: number }).birdsLiveEstimate) || 0,
        computedBirdsLiveEstimate: (pd as { computedBirdsLiveEstimate?: number }).computedBirdsLiveEstimate,
        verifiedLiveCount: (pd as { verifiedLiveCount?: number | null }).verifiedLiveCount ?? null,
        mortalityToDate: Number((pd as { mortalityToDate?: number }).mortalityToDate) || 0,
      });
      setError(null);
    } catch (e) {
      setStatus(null);
      setPerformance(null);
      setError(e instanceof Error ? e.message : "Context failed");
    } finally {
      setDetailLoading(false);
    }
  }, [token, flockId]);

  useEffect(() => {
    void loadFlocks();
  }, [loadFlocks]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  return {
    flocks,
    flockId,
    setFlockId,
    status,
    performance,
    listLoading,
    detailLoading,
    error,
    loadFlocks,
    loadDetails,
  };
}
