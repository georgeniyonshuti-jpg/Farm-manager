import { useCallback, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CheckinStatus } from "../pages/farm/checkinStatusTypes";
import type { HubCheckinBannerVariant } from "../components/farm/HubCheckinBanner";
import { API_BASE_URL } from "../api/config";
import { fetchJsonWithNetworkRetry } from "../lib/apiFetch";
import { readAuthHeaders } from "../lib/authHeaders";
import { useHubAggregatePoll } from "./useHubAggregatePoll";
import type { FieldOpsHubBannerLabels, FieldOpsBannerSummary } from "./useFieldOpsHubStatus";
import { stripTenantPrefix } from "../lib/tenancy";

import type { FieldFlockTriageRow } from "../context/ActiveFlockContext";

export type VetVisitStatus = CheckinStatus & {
  lastVisitAt?: string | null;
  visitBadge?: string;
};

export type AggregateVetVisitPayload = {
  primaryFlockId?: string | null;
  primaryStatus?: VetVisitStatus | null;
  summary?: {
    anyOverdue?: boolean;
    overdueCount?: number;
    maxOverdueMinutes?: number;
    overdueLabels?: string[];
    minutesUntilSoonestNext?: number | null;
    soonestFlockLabel?: string | null;
    primaryFlockId?: string | null;
    flockList?: FieldFlockTriageRow[] | null;
  } | null;
};

export const AGGREGATE_VET_VISIT_QUERY_KEY = "aggregate-vet-visit-status";

export async function fetchAggregateVetVisitStatus(token: string | null): Promise<AggregateVetVisitPayload> {
  return fetchJsonWithNetworkRetry<AggregateVetVisitPayload>(
    `${API_BASE_URL}/api/me/aggregate-vet-visit-status`,
    { headers: readAuthHeaders(token) }
  );
}

export function useFieldOpsVetVisitStatus(token: string | null, labels: FieldOpsHubBannerLabels) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const hubVisible = stripTenantPrefix(location.pathname) === "/dashboard/vet";

  const query = useQuery({
    queryKey: [AGGREGATE_VET_VISIT_QUERY_KEY, token],
    queryFn: () => fetchAggregateVetVisitStatus(token),
    enabled: Boolean(token) && hubVisible,
    staleTime: 20_000,
  });

  const load = useCallback(async () => {
    if (!hubVisible) return;
    await queryClient.invalidateQueries({ queryKey: [AGGREGATE_VET_VISIT_QUERY_KEY, token] });
  }, [queryClient, token, hubVisible]);

  useHubAggregatePoll(load, hubVisible);

  useEffect(() => {
    const onSubmitted = () => void load();
    window.addEventListener("farm:vet-visit-submitted", onSubmitted);
    return () => window.removeEventListener("farm:vet-visit-submitted", onSubmitted);
  }, [load]);

  const ad = query.data;
  const status = ad?.primaryStatus ?? null;
  const s = ad?.summary;
  let bannerSummary: FieldOpsBannerSummary | null = null;
  if (s) {
    let overdueCount = Number(s.overdueCount);
    if (!Number.isFinite(overdueCount)) {
      overdueCount = s.anyOverdue ? Math.max(1, Array.isArray(s.overdueLabels) ? s.overdueLabels.length : 1) : 0;
    }
    bannerSummary = {
      anyOverdue: Boolean(s.anyOverdue),
      overdueCount,
      maxOverdueMinutes: Number(s.maxOverdueMinutes) || 0,
      overdueLabels: Array.isArray(s.overdueLabels) ? s.overdueLabels.map(String) : [],
      minutesUntilSoonestNext: s.minutesUntilSoonestNext != null ? Number(s.minutesUntilSoonestNext) : null,
      soonestFlockLabel: s.soonestFlockLabel != null ? String(s.soonestFlockLabel) : null,
    };
  }

  const loading = query.isLoading || (query.isFetching && !query.data);
  const loadError = query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null;

  const visitBanner = useMemo((): { variant: HubCheckinBannerVariant; text: string } | null => {
    if (loading) return { variant: "loading", text: labels.loading };
    if (loadError) return { variant: "error", text: labels.error };
    if (!status && !bannerSummary) return { variant: "warn", text: labels.noSchedule };
    if (bannerSummary?.anyOverdue && status) {
      if (bannerSummary.overdueCount > 1) {
        return { variant: "warn", text: `${bannerSummary.overdueCount} ${labels.multiFlock}` };
      }
      return null;
    }
    if (bannerSummary?.anyOverdue && !status) {
      const mins = Math.max(1, bannerSummary.maxOverdueMinutes);
      const extra =
        bannerSummary.overdueLabels.length > 0
          ? ` (${bannerSummary.overdueLabels.slice(0, 3).join(", ")})`
          : "";
      return {
        variant: "error",
        text: `${labels.overduePrefix} ${mins} ${labels.overdueSuffix}${extra}`,
      };
    }
    if (
      bannerSummary &&
      !bannerSummary.anyOverdue &&
      bannerSummary.minutesUntilSoonestNext != null &&
      bannerSummary.soonestFlockLabel
    ) {
      const minsLeft = Math.max(1, bannerSummary.minutesUntilSoonestNext);
      return {
        variant: "ok",
        text: `${labels.onTrack} ${labels.about} ${minsLeft} ${labels.untilNext} (${bannerSummary.soonestFlockLabel})`,
      };
    }
    if (!status) return { variant: "warn", text: labels.noSchedule };
    const now = Date.now();
    const next = new Date(status.nextDueAt).getTime();
    if (now > next) {
      const mins = Math.floor((now - next) / 60000);
      return {
        variant: "error",
        text: `${labels.overduePrefix} ${Math.max(1, mins)} ${labels.overdueSuffix}`,
      };
    }
    const minsLeft = Math.floor((next - now) / 60000);
    return {
      variant: "ok",
      text: `${labels.onTrack} ${labels.about} ${Math.max(1, minsLeft)} ${labels.untilNext}`,
    };
  }, [loading, loadError, status, bannerSummary, labels]);

  const isOverdue = visitBanner?.variant === "error" || visitBanner?.variant === "warn";

  const primaryFlockId =
    ad?.primaryFlockId != null
      ? String(ad.primaryFlockId)
      : s?.primaryFlockId != null
        ? String(s.primaryFlockId)
        : null;
  const flockList = useMemo((): FieldFlockTriageRow[] => {
    if (!Array.isArray(s?.flockList)) return [];
    return s.flockList.map((row) => ({
      flockId: String(row.flockId),
      label: String(row.label),
      isOverdue: Boolean(row.isOverdue),
      overdueMinutes: Number(row.overdueMinutes) || 0,
      nextDueAt: String(row.nextDueAt),
      visitDoneToday: Boolean(row.visitDoneToday),
      checkinDoneToday: Boolean(row.checkinDoneToday),
    }));
  }, [s?.flockList]);

  return {
    status,
    loading,
    loadError,
    load,
    bannerSummary,
    visitBanner,
    isOverdue,
    primaryFlockId,
    flockList,
  };
}
