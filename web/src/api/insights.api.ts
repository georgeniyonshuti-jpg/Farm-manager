/**
 * Farm Insights API — Superset embed meta/token + pack preferences.
 */
import { API_BASE_URL } from "./config";
import { jsonAuthHeaders, readAuthHeaders } from "../lib/authHeaders";

export type InsightsPack = {
  id: string;
  label: string;
  enabled: boolean;
};

export type InsightsMeta = {
  configured: boolean;
  reason?: string;
  error?: string;
  code?: string;
  supersetUrl?: string;
  dashboardUuid?: string;
  /** Per-pack embedded dashboard UUIDs from ERP site_config */
  packDashboards?: Record<string, string>;
  dataAsOf?: string | null;
  farmCompany?: string;
  /** Farm Company ids for guest RLS / native filters (from ERP). */
  companies?: string[];
  packs?: InsightsPack[];
  packsNote?: string;
  advancedSsoUrl?: string;
};

export type InsightsEmbedToken = {
  token: string;
  supersetUrl: string;
  dashboardUuid: string;
  ttlSeconds: number;
  dataAsOf?: string | null;
  companies?: string[];
  rlsApplied?: boolean;
};

export async function fetchInsightsMeta(token: string | null): Promise<InsightsMeta> {
  const res = await fetch(`${API_BASE_URL}/api/insights/meta`, {
    headers: readAuthHeaders(token),
  });
  const data = (await res.json().catch(() => ({}))) as InsightsMeta & {
    pack_dashboards?: Record<string, string>;
  };
  if (!res.ok) {
    return {
      configured: false,
      error: data.error || `Insights meta failed (${res.status})`,
      code: data.code,
      packs: data.packs,
    };
  }
  return {
    ...data,
    packDashboards: data.packDashboards || data.pack_dashboards || {},
  };
}

export async function fetchInsightsEmbedToken(
  token: string | null,
  dashboardUuid?: string
): Promise<InsightsEmbedToken> {
  const q = dashboardUuid ? `?dashboardUuid=${encodeURIComponent(dashboardUuid)}` : "";
  const res = await fetch(`${API_BASE_URL}/api/insights/embed/token${q}`, {
    headers: readAuthHeaders(token),
  });
  const data = (await res.json().catch(() => ({}))) as InsightsEmbedToken & {
    error?: string;
    code?: string;
  };
  if (!res.ok || !data.token) {
    throw new Error(data.error || `Could not mint Insights guest token (${res.status})`);
  }
  return data;
}

export async function fetchInsightsPacks(
  token: string | null
): Promise<{ packs: InsightsPack[]; note?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/insights/packs`, {
    headers: readAuthHeaders(token),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Packs failed (${res.status})`);
  }
  return data as { packs: InsightsPack[]; note?: string };
}

export async function saveInsightsPacks(
  token: string | null,
  packs: InsightsPack[]
): Promise<{ packs: InsightsPack[]; note?: string }> {
  const res = await fetch(`${API_BASE_URL}/api/insights/packs`, {
    method: "PUT",
    headers: jsonAuthHeaders(token),
    body: JSON.stringify({ packs }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Save packs failed (${res.status})`);
  }
  return data as { packs: InsightsPack[]; note?: string };
}

/**
 * Decide which dashboard UUID(s) to embed based on pack prefs.
 * - All core packs enabled (or no pack UUIDs): mega Command Center
 * - Subset: one UUID per enabled pack that has a dashboard
 */
export function resolveEmbedDashboardIds(
  meta: InsightsMeta,
  packs: InsightsPack[] | undefined
): { mode: "mega" | "stack" | "empty"; ids: string[]; labels: string[] } {
  const mega = meta.dashboardUuid || "";
  const packMap = meta.packDashboards || {};
  const list = packs && packs.length ? packs : [];
  const enabled = list.filter((p) => p.enabled);
  const coreIds = ["executive", "growth", "feed", "health", "operations"];
  const allCoreOn =
    !list.length ||
    coreIds.every((id) => {
      const p = list.find((x) => x.id === id);
      return !p || p.enabled;
    });

  if (allCoreOn || Object.keys(packMap).length === 0) {
    return mega
      ? { mode: "mega", ids: [mega], labels: ["Command Center"] }
      : { mode: "empty", ids: [], labels: [] };
  }

  const ids: string[] = [];
  const labels: string[] = [];
  for (const p of enabled) {
    const uuid = packMap[p.id];
    if (uuid) {
      ids.push(uuid);
      labels.push(p.label);
    }
  }
  if (!ids.length) {
    return mega
      ? { mode: "mega", ids: [mega], labels: ["Command Center"] }
      : { mode: "empty", ids: [], labels: [] };
  }
  return { mode: "stack", ids, labels };
}
