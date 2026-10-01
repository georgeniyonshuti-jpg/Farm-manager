import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "../EmptyState";
import { useAuth } from "../../auth/AuthContext";
import {
  fetchInsightsEmbedToken,
  fetchInsightsMeta,
  resolveEmbedDashboardIds,
  type InsightsMeta,
  type InsightsPack,
} from "../../api/insights.api";

const DEFAULT_SDK_URL =
  (import.meta.env.VITE_SUPERSET_SDK_URL as string | undefined) ||
  "https://unpkg.com/@superset-ui/embedded-sdk@0.1.3/bundle/index.js";

/** Native filter ids from production/superset/cleva_security_manager.py */
const FILTER_BARN = "NATIVE_FILTER-BARN";
const FILTER_FLOCK = "NATIVE_FILTER-FLOCK";

type SupersetSdk = {
  embedDashboard: (opts: {
    id: string;
    supersetDomain: string;
    mountPoint: HTMLElement;
    fetchGuestToken: () => Promise<string>;
    dashboardUiConfig?: Record<string, unknown>;
    iframeSandboxExtras?: string[];
  }) => Promise<unknown> | unknown;
};

declare global {
  interface Window {
    supersetEmbeddedSdk?: SupersetSdk;
  }
}

function loadSupersetSdk(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const base = src.split("?")[0];
    if (window.supersetEmbeddedSdk?.embedDashboard) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src^="${base}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Insights SDK")));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Insights SDK"));
    document.head.appendChild(script);
  });
}

export type InsightsScope = {
  barn: string | null;
  flock: string | null;
};

/** Minimal rison encoder for Superset 4.1 `native_filters` URL params. */
function risonEncode(value: unknown): string {
  if (value === null || value === undefined) return "!n";
  if (value === true) return "!t";
  if (value === false) return "!f";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "!n";
    return String(value);
  }
  if (typeof value === "string") {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return value;
    return `'${value.replace(/'/g, "!'")}'`;
  }
  if (Array.isArray(value)) {
    return `!(${value.map(risonEncode).join(",")})`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined
    );
    return `(${entries
      .map(([k, v]) => {
        const key = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(k) ? k : risonEncode(k);
        return `${key}:${risonEncode(v)}`;
      })
      .join(",")})`;
  }
  return "!n";
}

function selectFilterMask(id: string, column: string, selected: string) {
  return {
    id,
    extraFormData: {
      filters: [{ col: column, op: "IN", val: [selected] }],
    },
    filterState: { value: [selected], label: selected },
    ownState: {},
  };
}

/** Build Superset 4.1 rison `native_filters` from host Barn/Flock scope only.
 *  Company isolation stays on guest-token RLS — do not inject Farm Company here
 *  (meta.farmCompany is ERP Company name, not Farm Company id).
 */
export function buildNativeFilterUrlParams(scope?: InsightsScope): Record<string, string> {
  const native: Record<string, unknown> = {};
  if (scope?.barn) {
    native[FILTER_BARN] = selectFilterMask(FILTER_BARN, "Barn", scope.barn);
  }
  if (scope?.flock) {
    native[FILTER_FLOCK] = selectFilterMask(FILTER_FLOCK, "Flock", scope.flock);
  }
  return Object.keys(native).length ? { native_filters: risonEncode(native) } : {};
}

type Props = {
  refreshKey?: number;
  onDataAsOf?: (value: string | null) => void;
  packs?: InsightsPack[];
  /** Host-owned Barn / Flock scope (Superset filter bar is hidden). */
  scope?: InsightsScope;
};

async function embedOne(
  mountPoint: HTMLElement,
  dashboardUuid: string,
  supersetUrl: string,
  token: string | null,
  scope: InsightsScope | undefined,
  onDataAsOf?: (value: string | null) => void
) {
  await window.supersetEmbeddedSdk!.embedDashboard({
    id: dashboardUuid,
    supersetDomain: supersetUrl,
    mountPoint,
    fetchGuestToken: async () => {
      const payload = await fetchInsightsEmbedToken(token, dashboardUuid);
      if (payload.dataAsOf) onDataAsOf?.(payload.dataAsOf);
      return payload.token;
    },
    dashboardUiConfig: {
      hideTitle: true,
      hideChartControls: true,
      hideTab: false,
      filters: { visible: false, expanded: false },
      urlParams: {
        standalone: "2",
        show_filters: "0",
        expand_filters: "0",
        ...buildNativeFilterUrlParams(scope),
      },
    },
    iframeSandboxExtras: ["allow-top-navigation", "allow-popups-to-escape-sandbox"],
  });
}

function InsightsSkeleton() {
  return (
    <div className="cf-insights-skeleton grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-subtle)]"
        />
      ))}
      <div className="col-span-2 h-48 animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-subtle)] sm:col-span-4" />
    </div>
  );
}

export function SupersetInsightsEmbed({
  refreshKey = 0,
  onDataAsOf,
  packs,
  scope,
}: Props) {
  const { token } = useAuth();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [message, setMessage] = useState("Loading Insights…");
  const [detail, setDetail] = useState<string | undefined>();
  const packsKey = JSON.stringify((packs || []).map((p) => [p.id, p.enabled]));
  const scopeKey = `${scope?.barn || ""}|${scope?.flock || ""}`;

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setMessage("Loading Insights…");
    setDetail(undefined);

    (async () => {
      try {
        const nextMeta: InsightsMeta = await fetchInsightsMeta(token);
        if (cancelled) return;
        onDataAsOf?.(nextMeta.dataAsOf ?? null);

        if (!nextMeta.configured) {
          setPhase("empty");
          setMessage("Insights is not configured yet.");
          setDetail(
            nextMeta.error ||
              "Ask your Cleva administrator to finish farm analytics setup for this company."
          );
          return;
        }

        const resolved = resolveEmbedDashboardIds(nextMeta, packs || nextMeta.packs);
        if (resolved.mode === "empty" || !resolved.ids.length) {
          setPhase("empty");
          setMessage("No Insights packs selected.");
          setDetail("Open Widgets and enable at least one pack, or ask an admin to finish setup.");
          return;
        }
        if (!nextMeta.supersetUrl) {
          setPhase("empty");
          setMessage("Insights dashboard is missing.");
          setDetail("The tenant Command Center UUID is not set on the ERPNext site.");
          return;
        }

        await loadSupersetSdk(DEFAULT_SDK_URL);
        if (cancelled) return;
        if (!window.supersetEmbeddedSdk?.embedDashboard) {
          setPhase("error");
          setMessage("Analytics embed SDK failed to load.");
          setDetail("Check your network connection and try Refresh.");
          return;
        }

        const root = mountRef.current;
        if (!root) return;
        root.innerHTML = "";

        const effectiveScope: InsightsScope = {
          barn: scope?.barn ?? null,
          flock: scope?.flock ?? null,
        };

        const supersetUrl = nextMeta.supersetUrl;
        const iframeClass =
          "cf-superset-iframe w-full border-0 [&_iframe]:block [&_iframe]:h-[calc(100dvh-12rem)] [&_iframe]:min-h-[70vh] [&_iframe]:w-full [&_iframe]:border-0";

        if (resolved.mode === "mega" || resolved.ids.length === 1) {
          const mountPoint = document.createElement("div");
          mountPoint.className = iframeClass;
          root.appendChild(mountPoint);
          await embedOne(mountPoint, resolved.ids[0], supersetUrl, token, effectiveScope, onDataAsOf);
        } else {
          for (let i = 0; i < resolved.ids.length; i++) {
            const section = document.createElement("div");
            section.className = "space-y-2";
            const heading = document.createElement("h3");
            heading.className = "type-caption px-0.5 font-semibold text-[var(--text-primary)]";
            heading.textContent = resolved.labels[i] || `Pack ${i + 1}`;
            section.appendChild(heading);
            const mountPoint = document.createElement("div");
            mountPoint.className = iframeClass;
            section.appendChild(mountPoint);
            root.appendChild(section);
            await embedOne(mountPoint, resolved.ids[i], supersetUrl, token, effectiveScope, onDataAsOf);
            if (cancelled) return;
          }
        }

        if (!cancelled) setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        setPhase("error");
        setMessage("Could not load Insights.");
        setDetail(e instanceof Error ? e.message : "Unknown error");
      }
    })();

    return () => {
      cancelled = true;
      if (mountRef.current) mountRef.current.innerHTML = "";
    };
  }, [token, refreshKey, onDataAsOf, packsKey, packs, scopeKey, scope]);

  if (phase === "empty" || phase === "error") {
    return <EmptyState title={message} description={detail} variant="compact" />;
  }

  return (
    <div className="cf-superset-embed relative w-full flex-1">
      {phase === "loading" ? (
        <div className="absolute inset-x-0 top-0 z-10 bg-[var(--surface-page)] pb-4">
          <InsightsSkeleton />
        </div>
      ) : null}
      <div ref={mountRef} className="w-full" />
    </div>
  );
}

/** Derive unique barn / flock labels for the Trends scope strip. */
export function useInsightsScopeOptions(
  flocks: Array<{ label: string; barn?: string | null }>
) {
  return useMemo(() => {
    const barns = Array.from(
      new Set(flocks.map((f) => String(f.barn || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    const flockLabels = flocks
      .map((f) => String(f.label || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return { barns, flockLabels };
  }, [flocks]);
}
