/**
 * Market trends — deep dive (Superset Market Command Center embed).
 * Mirrors farm ManagementHome → Trends altitude.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { Button, SegmentedControl } from "../../components/ui";
import { INSIGHTS_LANE, LaneNav } from "../../components/layout/LaneNav";
import { IconButton } from "../../components/ui/IconButton";
import { EmptyState } from "../../components/EmptyState";
import { SkeletonList } from "../../components/LoadingSkeleton";
import { SupersetInsightsEmbed } from "../../components/insights/SupersetInsightsEmbed";
import {
  fetchMarketInsightsMeta,
  fetchMarketInsightsPacks,
  saveMarketInsightsPacks,
  type MarketInsightsMeta,
} from "../../api/marketInsights.api";
import type { InsightsPack } from "../../api/insights.api";

function isManagerTier(role: string | undefined): boolean {
  return role === "superuser" || role === "sales_coordinator";
}

export function MarketTrendsPage() {
  const { user, token } = useAuth();
  const { companyHref } = useCompanyNav();
  const allowed = canAccessPipelineDesk(user);
  const canConfigure = isManagerTier(user?.role);

  const [meta, setMeta] = useState<MarketInsightsMeta | null>(null);
  const [packs, setPacks] = useState<InsightsPack[]>([]);
  const [draft, setDraft] = useState<InsightsPack[]>([]);
  const [note, setNote] = useState("");
  const [activePack, setActivePack] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dataAsOf, setDataAsOf] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const onDataAsOf = useCallback((v: string | null) => setDataAsOf(v), []);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [m, packRes] = await Promise.all([
        fetchMarketInsightsMeta(token),
        fetchMarketInsightsPacks(token).catch(() => null),
      ]);
      setMeta(m);
      const next =
        packRes?.packs?.length
          ? packRes.packs
          : m.packs?.length
            ? m.packs
            : [
                { id: "overview", label: "Overview", enabled: true },
                { id: "supply", label: "Supply", enabled: true },
                { id: "demand", label: "Demand", enabled: true },
                { id: "scouts", label: "Scouts", enabled: true },
                { id: "sales", label: "Sales", enabled: true },
              ];
      setPacks(next);
      setDraft(next);
      setNote(packRes?.note || m.packsNote || "");
      if (!next.some((p) => p.id === activePack && p.enabled)) {
        const first = next.find((p) => p.enabled);
        if (first) setActivePack(first.id);
      }
    } catch {
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [token, activePack]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  async function handleSavePacks() {
    setSaving(true);
    try {
      const next = await saveMarketInsightsPacks(token, draft);
      const packsNext = next.packs ?? draft;
      setDraft(packsNext);
      setPacks(packsNext);
      setNote(next.note ?? note);
      setConfigOpen(false);
      setRefreshKey((k) => k + 1);
    } catch {
      /* keep open */
    }
    setSaving(false);
  }

  if (!allowed) {
    return <Navigate to={companyHref("/farm/pipeline")} replace />;
  }

  const enabled = packs.filter((p) => p.enabled);
  const embedReady =
    meta?.mode === "superset" &&
    meta.configured &&
    Boolean(meta.supersetUrl) &&
    (Boolean(meta.dashboardUuid) || Object.keys(meta.packDashboards || {}).length > 0);

  const embedPacks = enabled.map((p) => ({
    ...p,
    enabled: p.id === activePack,
  }));

  return (
    <ManagerPage>
      <div className="flex w-full flex-col gap-3 pb-4">
        <PageHeader
          title="Insights"
          tabs={<LaneNav chrome label="Insights" items={INSIGHTS_LANE} />}
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {dataAsOf ? (
                <span className="type-caption text-[var(--text-muted)]">Data as of {dataAsOf}</span>
              ) : null}
              <Button variant="secondary" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
                Refresh
              </Button>
              {canConfigure && embedReady ? (
                <Button variant="ghost" size="sm" onClick={() => setConfigOpen(true)}>
                  Widgets
                </Button>
              ) : null}
            </div>
          }
        />

        {configOpen && canConfigure ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md space-y-4 rounded-[var(--radius-xl)] border border-[var(--border-color)] bg-[var(--surface-elevated)] p-card shadow-[var(--shadow-elevated)]">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[var(--text-primary)]">Market Insights packs</h2>
                <IconButton size="sm" label="Close" onClick={() => setConfigOpen(false)}>
                  ×
                </IconButton>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                {note ||
                  "Overview is liquidity and GMV. Supply / Demand are separate funnels. Scouts and Sales dig into field and money."}
              </p>
              <div className="space-y-2">
                {draft.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2.5 transition-colors hover:bg-[var(--surface-elevated)]"
                  >
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={() =>
                        setDraft((prev) =>
                          prev.map((x) => (x.id === p.id ? { ...x, enabled: !x.enabled } : x))
                        )
                      }
                      className="h-4 w-4 rounded accent-[var(--primary-color)]"
                    />
                    <span className="text-sm text-[var(--text-primary)]">{p.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setConfigOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void handleSavePacks()} disabled={saving} loading={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {loading && !meta ? <SkeletonList rows={4} /> : null}

        {!loading && !embedReady ? (
          <EmptyState
            title="Market Command Center is not linked yet"
            description={
              meta?.error ||
              "Superset market packs need Farm Postgres connected and MARKET_INSIGHTS_PACK_* UUIDs on farmapi. Overview still shows live KPIs."
            }
            action={
              <Link
                to={companyHref("/dashboard/market")}
                className="inline-flex min-h-control-sm items-center rounded-control bg-[var(--primary-color)] px-2.5 text-xs font-medium text-[var(--text-on-primary)]"
              >
                Open Market overview
              </Link>
            }
          />
        ) : null}

        {embedReady && enabled.length > 1 ? (
          <SegmentedControl
            label="Pack"
            value={activePack}
            onChange={setActivePack}
            options={enabled.map((p) => ({ value: p.id, label: p.label }))}
          />
        ) : null}

        {embedReady ? (
          <SupersetInsightsEmbed
            refreshKey={refreshKey}
            onDataAsOf={onDataAsOf}
            packs={embedPacks}
            surface="market"
            metaOverride={{ ...meta!, packs: embedPacks }}
          />
        ) : null}
      </div>
    </ManagerPage>
  );
}
