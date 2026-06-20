import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CheckinStatus, OpsGlanceSummary } from "../pages/farm/FarmCheckinPage";
import type { HubCheckinBannerVariant } from "../components/farm/HubCheckinBanner";
import { API_BASE_URL } from "../api/config";
import { fetchJsonWithNetworkRetry } from "../lib/apiFetch";
import { readAuthHeaders } from "../lib/authHeaders";
import { useHubAggregatePoll } from "./useHubAggregatePoll";

export type FieldOpsHubBannerLabels = {
  loading: string;
  error: string;
  noSchedule: string;
  overduePrefix: string;
  overdueSuffix: string;
  onTrack: string;
  about: string;
  untilNext: string;
  multiFlock: string;
};

export type FieldOpsBannerSummary = {
  anyOverdue: boolean;
  overdueCount: number;
  maxOverdueMinutes: number;
  overdueLabels: string[];
  minutesUntilSoonestNext: number | null;
  soonestFlockLabel: string | null;
};

export function useFieldOpsHubStatus(token: string | null, labels: FieldOpsHubBannerLabels) {
  const [status, setStatus] = useState<CheckinStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const didInitialLoadRef = useRef(false);
  const [bannerSummary, setBannerSummary] = useState<FieldOpsBannerSummary | null>(null);
  const [opsGlance, setOpsGlance] = useState<OpsGlanceSummary | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    if (!didInitialLoadRef.current) setLoading(true);
    try {
      const ad = await fetchJsonWithNetworkRetry<{
        primaryStatus?: CheckinStatus | null;
        summary?: {
          anyOverdue?: boolean;
          overdueCount?: number;
          maxOverdueMinutes?: number;
          overdueLabels?: string[];
          minutesUntilSoonestNext?: number | null;
          soonestFlockLabel?: string | null;
          opsGlance?: OpsGlanceSummary | null;
        } | null;
      }>(`${API_BASE_URL}/api/me/aggregate-checkin-status`, { headers: readAuthHeaders(token) });
      setStatus(ad.primaryStatus ?? null);
      const s = ad.summary;
      if (s) {
        let overdueCount = Number(s.overdueCount);
        if (!Number.isFinite(overdueCount)) {
          overdueCount = s.anyOverdue ? Math.max(1, Array.isArray(s.overdueLabels) ? s.overdueLabels.length : 1) : 0;
        }
        setBannerSummary({
          anyOverdue: Boolean(s.anyOverdue),
          overdueCount,
          maxOverdueMinutes: Number(s.maxOverdueMinutes) || 0,
          overdueLabels: Array.isArray(s.overdueLabels) ? s.overdueLabels.map(String) : [],
          minutesUntilSoonestNext: s.minutesUntilSoonestNext != null ? Number(s.minutesUntilSoonestNext) : null,
          soonestFlockLabel: s.soonestFlockLabel != null ? String(s.soonestFlockLabel) : null,
        });
        setOpsGlance(s.opsGlance ?? null);
      } else {
        setBannerSummary(null);
        setOpsGlance(null);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load schedule");
    } finally {
      didInitialLoadRef.current = true;
      setLoading(false);
    }
  }, [token]);

  useHubAggregatePoll(load);

  useEffect(() => {
    const onSubmitted = () => void load();
    window.addEventListener("farm:checkin-submitted", onSubmitted);
    return () => window.removeEventListener("farm:checkin-submitted", onSubmitted);
  }, [load]);

  const roundBanner = useMemo((): { variant: HubCheckinBannerVariant; text: string } | null => {
    if (loading) return { variant: "loading", text: labels.loading };
    if (loadError) return { variant: "error", text: labels.error };
    if (!status && !bannerSummary) return { variant: "warn", text: labels.noSchedule };
    if (bannerSummary?.anyOverdue && status) {
      if (bannerSummary.overdueCount > 1) {
        return {
          variant: "warn",
          text: `${bannerSummary.overdueCount} ${labels.multiFlock}`,
        };
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

  const otherOverdueCount =
    status && bannerSummary?.anyOverdue ? Math.max(0, bannerSummary.overdueCount - 1) : 0;

  return {
    status,
    loading,
    loadError,
    load,
    bannerSummary,
    opsGlance,
    roundBanner,
    otherOverdueCount,
  };
}
