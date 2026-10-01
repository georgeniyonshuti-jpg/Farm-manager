import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "react-router-dom";
import {
  fetchFlockDetailQuery,
  fetchFlocksQuery,
  flockDetailQueryKey,
  flocksQueryKey,
} from "./flockFieldQueries";
import {
  resolveActiveFlockId,
  useActiveFlockOptional,
} from "../context/ActiveFlockContext";
import { readFlockIdFromSearch } from "../lib/fieldRoutes";
import { readStoredActiveFlock } from "../lib/activeFlockStorage";

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
  /** Field task hubs: auto-pick when one flock; default first when many and none selected. */
  autoSelectSingleFlock?: boolean;
};

const FLOCKS_STALE_MS = 60_000;
const DETAIL_STALE_MS = 45_000;

export function useFlockFieldContext(
  token: string | null,
  options?: UseFlockFieldContextOptions
) {
  const defaultAll = options?.defaultFlockId === "";
  const autoSelectSingleFlock = options?.autoSelectSingleFlock === true;
  const activeFlock = useActiveFlockOptional();
  const activeFlockId = activeFlock?.activeFlockId ?? "";
  const primaryFlockIdFromHub = activeFlock?.primaryFlockId ?? null;
  const setActiveFlockId = activeFlock?.setActiveFlockId;
  const { slug } = useParams<{ slug?: string }>();
  const tenantSlug = slug ?? "default-farm";
  const location = useLocation();
  const queryClient = useQueryClient();

  const flocksQuery = useQuery({
    queryKey: flocksQueryKey(token, tenantSlug),
    queryFn: () => fetchFlocksQuery(token!),
    enabled: Boolean(token),
    staleTime: FLOCKS_STALE_MS,
  });

  const flocks = flocksQuery.data?.flocks ?? [];
  const flockSync = flocksQuery.data?.flockSync ?? null;
  const listLoading = Boolean(token) && flocksQuery.isLoading && !flocksQuery.data;

  const flockId = activeFlockId;

  const detailQuery = useQuery({
    queryKey: flockDetailQueryKey(token, flockId),
    queryFn: () => fetchFlockDetailQuery(token!, flockId),
    enabled: Boolean(token && flockId),
    staleTime: DETAIL_STALE_MS,
    placeholderData: (prev) => prev,
  });

  const status = detailQuery.data?.status ?? null;
  const performance = detailQuery.data?.performance ?? null;
  const detailLoading = Boolean(token && flockId) && detailQuery.isFetching && !detailQuery.data;
  const error =
    (flocksQuery.error instanceof Error ? flocksQuery.error.message : null) ??
    (detailQuery.error instanceof Error ? detailQuery.error.message : null);

  const setFlockId = useCallback(
    (id: string) => {
      setActiveFlockId?.(id);
    },
    [setActiveFlockId]
  );

  useEffect(() => {
    if (!setActiveFlockId || !flocks.length || flocksQuery.isLoading) return;
    const ids = flocks.map((f) => f.id);
    const resolved = resolveActiveFlockId({
      flockIds: ids,
      urlFlockId: readFlockIdFromSearch(location.search),
      storedFlockId: readStoredActiveFlock(tenantSlug),
      primaryFlockId: primaryFlockIdFromHub,
      allowEmpty: defaultAll && !autoSelectSingleFlock,
    });
    if (resolved && resolved !== activeFlockId) {
      setActiveFlockId(resolved, { syncUrl: false });
    }
  }, [
    flocks,
    flocksQuery.isLoading,
    setActiveFlockId,
    location.search,
    tenantSlug,
    primaryFlockIdFromHub,
    defaultAll,
    autoSelectSingleFlock,
    activeFlockId,
  ]);

  useEffect(() => {
    if (!setActiveFlockId || !flocks.length) return;
    const urlId = readFlockIdFromSearch(location.search);
    if (!urlId || !flocks.some((f) => f.id === urlId)) return;
    if (urlId !== activeFlockId) {
      setActiveFlockId(urlId, { syncUrl: false });
    }
  }, [location.search, flocks, activeFlockId, setActiveFlockId]);

  const loadFlocks = useCallback(async () => {
    if (!token) return;
    await queryClient.invalidateQueries({ queryKey: flocksQueryKey(token, tenantSlug) });
  }, [queryClient, token, tenantSlug]);

  const loadDetails = useCallback(async () => {
    if (!token || !flockId) return;
    await queryClient.invalidateQueries({ queryKey: flockDetailQueryKey(token, flockId) });
  }, [queryClient, token, flockId]);

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

/** Warm flock list + active flock detail after home hub loads. */
export function prefetchFieldFlockContext(
  queryClient: QueryClient,
  token: string,
  tenantSlug: string,
  flockId?: string | null
) {
  void queryClient.prefetchQuery({
    queryKey: flocksQueryKey(token, tenantSlug),
    queryFn: () => fetchFlocksQuery(token),
    staleTime: FLOCKS_STALE_MS,
  });
  if (flockId) {
    void queryClient.prefetchQuery({
      queryKey: flockDetailQueryKey(token, flockId),
      queryFn: () => fetchFlockDetailQuery(token, flockId),
      staleTime: DETAIL_STALE_MS,
    });
  }
}
