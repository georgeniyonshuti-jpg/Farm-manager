import {
  fetchCheckinStatus,
  fetchFlocks,
  fetchPerformanceSummary,
} from "../api/farm.api";
import type { CheckinStatus } from "../pages/farm/checkinStatusTypes";
import type { FieldPerformanceSummary, FlockListRow, FlockSyncMeta } from "./useFlockFieldContext";

export const FLOCKS_QUERY_KEY = "farm-flocks";
export const FLOCK_DETAIL_QUERY_KEY = "farm-flock-detail";

export type FlocksQueryResult = {
  flocks: FlockListRow[];
  flockSync: FlockSyncMeta | null;
};

export type FlockDetailResult = {
  status: CheckinStatus;
  performance: FieldPerformanceSummary;
};

export function flocksQueryKey(token: string | null, tenantSlug: string) {
  return [FLOCKS_QUERY_KEY, token, tenantSlug] as const;
}

export function flockDetailQueryKey(token: string | null, flockId: string) {
  return [FLOCK_DETAIL_QUERY_KEY, token, flockId] as const;
}

export async function fetchFlocksQuery(token: string): Promise<FlocksQueryResult> {
  const d = await fetchFlocks(token);
  return {
    flocks: d.flocks ?? [],
    flockSync:
      d.flockSync ?? {
        stale: false,
        lastSyncedAt: null,
        syncError: null,
        hasLoadedFromDb: true,
      },
  };
}

export async function fetchFlockDetailQuery(
  token: string,
  flockId: string
): Promise<FlockDetailResult> {
  const [status, pd] = await Promise.all([
    fetchCheckinStatus(token, flockId),
    fetchPerformanceSummary(token, flockId),
  ]);
  return {
    status,
    performance: {
      birdsLiveEstimate: Number(pd.birdsLiveEstimate) || 0,
      computedBirdsLiveEstimate: pd.computedBirdsLiveEstimate as number | undefined,
      verifiedLiveCount: (pd.verifiedLiveCount as number | null | undefined) ?? null,
      mortalityToDate: Number(pd.mortalityToDate ?? (pd as { mortality?: number }).mortality) || 0,
    },
  };
}
