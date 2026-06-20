/**
 * Unified farm API — routes to Node (legacy) or Frappe (native) based on VITE_API_MODE.
 */
import { getSlugFromPath } from "../lib/tenancy";
import { IS_FRAPPE_MODE, API_BASE_URL, legacyApiUrl } from "./config";
import { callFrappe, postFrappe } from "./frappe.api";
import { readAuthHeaders, jsonAuthHeaders } from "../lib/authHeaders";
import type { CheckinStatus } from "../pages/farm/checkinStatusTypes";
import type { FlockListRow, FieldPerformanceSummary, FlockSyncMeta } from "../hooks/useFlockFieldContext";

function tenantSlug(): string | undefined {
  return getSlugFromPath() ?? undefined;
}

async function legacyFetch<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(legacyApiUrl(path), {
    ...init,
    headers: { ...readAuthHeaders(token), ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchFlocks(token: string | null): Promise<{
  flocks: FlockListRow[];
  flockSync?: FlockSyncMeta;
}> {
  if (IS_FRAPPE_MODE) {
    const data = await callFrappe<{ flocks: FlockListRow[]; flockSync?: FlockSyncMeta }>(
      "flock.get_flocks",
      { slug: tenantSlug() }
    );
    return { flocks: data.flocks ?? [], flockSync: data.flockSync };
  }
  return legacyFetch("/api/flocks", token);
}

export async function fetchCheckinStatus(
  token: string | null,
  flockId: string
): Promise<CheckinStatus> {
  if (IS_FRAPPE_MODE) {
    return callFrappe<CheckinStatus>("flock.get_checkin_status", { flock_id: flockId });
  }
  return legacyFetch(`/api/flocks/${encodeURIComponent(flockId)}/checkin-status`, token);
}

export async function fetchPerformanceSummary(
  token: string | null,
  flockId: string
): Promise<FieldPerformanceSummary & Record<string, unknown>> {
  if (IS_FRAPPE_MODE) {
    return callFrappe("flock.get_performance_summary", { flock_id: flockId });
  }
  return legacyFetch(`/api/flocks/${encodeURIComponent(flockId)}/performance-summary`, token);
}

export type FeedEntryRow = {
  id: string;
  recordedAt?: string;
  logDate?: string;
  feedKg?: number;
  notes?: string;
  submissionStatus?: string;
};

export async function fetchFeedEntries(
  token: string | null,
  flockId: string
): Promise<{ entries: FeedEntryRow[] }> {
  if (IS_FRAPPE_MODE) {
    const data = await callFrappe<{ entries: FeedEntryRow[] }>("feed.get_feed_entries", {
      flock_id: flockId,
    });
    return {
      entries: (data.entries ?? []).map((e) => ({
        ...e,
        recordedAt: e.recordedAt ?? e.logDate,
        submissionStatus: e.submissionStatus?.toLowerCase().replace(/ /g, "_"),
      })),
    };
  }
  return legacyFetch(`/api/flocks/${encodeURIComponent(flockId)}/feed-entries?limit=25`, token);
}

export async function createFeedEntry(
  token: string | null,
  flockId: string,
  body: Record<string, unknown>
): Promise<unknown> {
  if (IS_FRAPPE_MODE) {
    return postFrappe("feed.create_feed_entry", { flock_id: flockId, ...body });
  }
  return legacyFetch(`/api/flocks/${encodeURIComponent(flockId)}/feed-entries`, token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function createMortalityEvent(
  token: string | null,
  flockId: string,
  body: Record<string, unknown>
): Promise<unknown> {
  if (IS_FRAPPE_MODE) {
    return postFrappe("mortality.create_mortality_event", { flock_id: flockId, ...body });
  }
  return legacyFetch(`/api/flocks/${encodeURIComponent(flockId)}/mortality-events`, token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function createRoundCheckin(
  token: string | null,
  flockId: string,
  body: Record<string, unknown>
): Promise<unknown> {
  if (IS_FRAPPE_MODE) {
    return postFrappe("checkin.create_round_checkin", { flock_id: flockId, ...body });
  }
  return legacyFetch(`/api/flocks/${encodeURIComponent(flockId)}/round-checkins`, token, {
    method: "POST",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function fetchPendingFeed(token: string | null) {
  if (IS_FRAPPE_MODE) {
    return callFrappe("feed.get_pending_feed_entries", { slug: tenantSlug() });
  }
  return legacyFetch("/api/feed-entries/pending", token);
}

export async function fetchPendingMortality(token: string | null) {
  if (IS_FRAPPE_MODE) {
    return callFrappe("mortality.get_pending_mortality_events", { slug: tenantSlug() });
  }
  return legacyFetch("/api/mortality-events/pending", token);
}

export async function fetchPendingCheckins(
  token: string | null
): Promise<{ checkins: CheckinListRow[]; total?: number }> {
  if (IS_FRAPPE_MODE) {
    return callFrappe("checkin.get_pending_checkins", { slug: tenantSlug() });
  }
  return legacyFetch("/api/check-ins/pending", token);
}

export async function fetchOpsBoard(token: string | null) {
  if (IS_FRAPPE_MODE) {
    return callFrappe("dashboard.get_ops_board", { slug: tenantSlug() });
  }
  return legacyFetch("/api/farm/ops-board", token);
}

export async function reviewFeedEntry(
  token: string | null,
  name: string,
  action: "approve" | "reject",
  reviewNotes?: string
) {
  if (IS_FRAPPE_MODE) {
    return postFrappe("feed.review_feed_entry", { name, action, reviewNotes });
  }
  return legacyFetch(`/api/feed-entries/${encodeURIComponent(name)}/review`, token, {
    method: "PATCH",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ action, reviewNotes }),
  });
}

export async function reviewMortalityEvent(
  token: string | null,
  name: string,
  status: string,
  notes?: string
) {
  if (IS_FRAPPE_MODE) {
    return postFrappe("mortality.review_mortality_event", { name, status, notes });
  }
  return legacyFetch(`/api/mortality-events/${encodeURIComponent(name)}/review`, token, {
    method: "PATCH",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ status, notes }),
  });
}

export async function reviewCheckin(
  token: string | null,
  name: string,
  action: "approve" | "reject",
  reviewNotes?: string
) {
  if (IS_FRAPPE_MODE) {
    return postFrappe("checkin.review_checkin", { name, action, reviewNotes });
  }
  return legacyFetch(`/api/check-ins/${encodeURIComponent(name)}/review`, token, {
    method: "PATCH",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ action, reviewNotes }),
  });
}

export type CheckinListRow = {
  id: string;
  flockId: string;
  flockCode?: string | null;
  laborerId: string;
  laborerName?: string | null;
  at: string;
  submissionStatus: string;
  coopTemperatureC?: number | null;
  feedKg?: number;
  waterL?: number;
  mortalityAtCheckin?: number;
  mortalityReportedInMortalityLog?: boolean;
  feedAvailable?: boolean;
  waterAvailable?: boolean;
  notesExcerpt?: string;
  hasPhotos?: boolean;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
};

export type CheckinDetailRow = CheckinListRow & {
  notes?: string;
  photoUrl?: string | null;
  photoUrls?: unknown;
};

export async function fetchCheckinsList(
  token: string | null,
  params: {
    flockId?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<{ checkins: CheckinListRow[]; total: number; page: number; pageSize: number }> {
  const q = new URLSearchParams();
  if (params.flockId) q.set("flockId", params.flockId);
  if (params.status) q.set("status", params.status);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  const qs = q.toString();
  return legacyFetch(`/api/check-ins${qs ? `?${qs}` : ""}`, token);
}

export async function fetchCheckinDetail(
  token: string | null,
  id: string
): Promise<{ checkin: CheckinDetailRow }> {
  return legacyFetch(`/api/check-ins/${encodeURIComponent(id)}`, token);
}

export type VetLogListRow = {
  id: string;
  flockId: string;
  flockCode?: string | null;
  authorUserId: string;
  authorName?: string | null;
  logDate: string;
  observations?: string | null;
  actionsTaken?: string | null;
  recommendations?: string | null;
  submissionStatus: string;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  createdAt?: string;
  fcrAtLogTime?: number | null;
  fcrStatus?: string | null;
  fcrTargetMin?: number | null;
  fcrTargetMax?: number | null;
  weighInId?: string | null;
  sampleSize?: number | null;
  avgWeightKg?: number | null;
  cvPct?: number | null;
  underweightPct?: number | null;
  totalFeedUsedKg?: number | null;
  hasWeightSample?: boolean;
  treatmentId?: string | null;
  medicineName?: string | null;
};

export async function fetchVetLogsList(
  token: string | null,
  params: {
    flockId?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
    q?: string;
  }
): Promise<{ logs: VetLogListRow[]; total: number; page: number; pageSize: number }> {
  const q = new URLSearchParams();
  if (params.flockId) q.set("flockId", params.flockId);
  if (params.status) q.set("status", params.status);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  if (params.q) q.set("q", params.q);
  const qs = q.toString();
  return legacyFetch(`/api/vet-logs${qs ? `?${qs}` : ""}`, token);
}

export async function fetchVetLogDetail(
  token: string | null,
  id: string
): Promise<{ log: VetLogListRow }> {
  return legacyFetch(`/api/vet-logs/${encodeURIComponent(id)}`, token);
}

export type FcrBroilerSnapshot = {
  fcrCumulative: number | null;
  reason: string | null;
  fcrTargetMin: number;
  fcrTargetMax: number;
  ageDays: number;
  feedToDateKg: number;
  weightGainedKg: number | null;
  initialTotalWeightKg: number;
  currentTotalBiomassKg: number | null;
  birdsLiveEstimate: number;
  latestWeighDate: string | null;
  status: string;
  playbook: string[];
};

export async function fetchFlockFcrSnapshot(
  token: string | null,
  flockId: string
): Promise<FcrBroilerSnapshot> {
  return legacyFetch(`/api/flocks/${encodeURIComponent(flockId)}/fcr-snapshot`, token);
}

export { IS_FRAPPE_MODE, API_BASE_URL };
