import { useCallback, useEffect, useState } from "react";
import type { CheckinStatus } from "../pages/farm/checkinStatusTypes";
import {
  fetchCheckinStatus,
  fetchFlocks,
  fetchPerformanceSummary,
} from "../api/farm.api";

export type FlockListRow = {
  id: string;
  label: string;
  code?: string | null;
  placementDate?: string;
  initialCount?: number;
  barnName?: string | null;
};

export type FieldPerformanceSummary = {
  birdsLiveEstimate: number;
  computedBirdsLiveEstimate?: number;
  verifiedLiveCount?: number | null;
  mortalityToDate: number;
};

export type FlockSyncMeta = {
  stale: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  hasLoadedFromDb: boolean;
};

export type UseFlockFieldContextOptions = {
  defaultFlockId?: string;
};

export function useFlockFieldContext(
  token: string | null,
  options?: UseFlockFieldContextOptions
) {
  const defaultAll = options?.defaultFlockId === "";
  const [flocks, setFlocks] = useState<FlockListRow[]>([]);
  const [flockId, setFlockId] = useState(defaultAll ? "" : "");
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [performance, setPerformance] = useState<FieldPerformanceSummary | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flockSync, setFlockSync] = useState<FlockSyncMeta | null>(null);

  const loadFlocks = useCallback(async () => {
    if (!token) {
      setFlocks([]);
      setFlockId("");
      setFlockSync(null);
      setListLoading(false);
      return;
    }
    setError(null);
    setListLoading(true);
    try {
      const d = await fetchFlocks(token);
      const list = d.flocks ?? [];
      setFlocks(list);
      setFlockId((prev) => {
        if (prev && list.some((f) => f.id === prev)) return prev;
        if (defaultAll) return "";
        return list[0]?.id ?? "";
      });
      setFlockSync(
        d.flockSync ?? {
          stale: false,
          lastSyncedAt: null,
          syncError: null,
          hasLoadedFromDb: true,
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setFlocks([]);
      setFlockId("");
      setFlockSync(null);
    } finally {
      setListLoading(false);
    }
  }, [token, defaultAll]);

  const loadDetails = useCallback(async () => {
    if (!token || !flockId) {
      setStatus(null);
      setPerformance(null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      const [sd, pd] = await Promise.all([
        fetchCheckinStatus(token, flockId),
        fetchPerformanceSummary(token, flockId),
      ]);
      setStatus(sd);
      setPerformance({
        birdsLiveEstimate: Number(pd.birdsLiveEstimate) || 0,
        computedBirdsLiveEstimate: pd.computedBirdsLiveEstimate as number | undefined,
        verifiedLiveCount: (pd.verifiedLiveCount as number | null | undefined) ?? null,
        mortalityToDate: Number(pd.mortalityToDate ?? pd.mortality) || 0,
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
    flockSync,
    loadFlocks,
    loadDetails,
  };
}
