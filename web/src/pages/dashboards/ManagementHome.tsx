/**
 * Command Center — Today (native) + Trends (embedded Superset Insights).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { isPipelineSalesRole } from "../../auth/permissions";
import { useOpsBoardData } from "../../hooks/useOpsBoardData";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import {
  fetchInsightsPacks,
  saveInsightsPacks,
  type InsightsPack,
} from "../../api/insights.api";
import { ManagementToday, fcrKpiLabel } from "./ManagementToday";
import { PageHeader } from "../../components/PageHeader";
import { PageTabs, TableToolbar, FacetFilter } from "../../components/ui";
import { Button } from "../../components/ui/Button";
import { IconButton } from "../../components/ui/IconButton";
import {
  SupersetInsightsEmbed,
  useInsightsScopeOptions,
  type InsightsScope,
} from "../../components/insights/SupersetInsightsEmbed";
import type { GrowthInsight } from "../../lib/dashboardAdapters";

function isManagerTier(role: string | undefined): boolean {
  return role === "superuser" || role === "manager" || role === "company_admin";
}

function useInsightsPacks(token: string | null, canConfigure: boolean) {
  const [note, setNote] = useState<string>("");
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<InsightsPack[]>([]);
  const [applied, setApplied] = useState<InsightsPack[]>([]);

  useEffect(() => {
    if (!token) return;
    fetchInsightsPacks(token)
      .then((d) => {
        const packs = d.packs ?? [];
        setDraft(packs);
        setApplied(packs);
        setNote(d.note ?? "");
      })
      .catch(() => {});
  }, [token, canConfigure]);

  async function save() {
    setSaving(true);
    try {
      const next = await saveInsightsPacks(token, draft);
      const packs = next.packs ?? draft;
      setDraft(packs);
      setApplied(packs);
      setNote(next.note ?? note);
      setConfigOpen(false);
    } catch {
      /* keep modal open */
    }
    setSaving(false);
  }

  function toggle(id: string) {
    setDraft((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    );
  }

  return { note, configOpen, setConfigOpen, draft, applied, toggle, save, saving };
}

export function ManagementHome() {
  const { token, user } = useAuth();
  const { companyHref } = useCompanyNav();
  const [searchParams, setSearchParams] = useSearchParams();
  const homeTab = searchParams.get("tab") === "trends" ? "trends" : "today";
  const { data, reload } = useOpsBoardData(token);
  const role = user?.role ?? "manager";
  const canConfigurePacks = isManagerTier(role);
  const { note, configOpen, setConfigOpen, draft, applied, toggle, save, saving } = useInsightsPacks(
    token,
    canConfigurePacks
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [dataAsOf, setDataAsOf] = useState<string | null>(null);
  const onDataAsOf = useCallback((v: string | null) => setDataAsOf(v), []);
  const [scopeBarn, setScopeBarn] = useState<string>("");
  const [scopeFlock, setScopeFlock] = useState<string>("");

  const flocks = data?.flocks ?? [];
  const growthInsights = (data?.growthInsights ?? []) as GrowthInsight[];
  const farmScore = data?.farmHealthScore ?? null;
  const { barns, flockLabels } = useInsightsScopeOptions(flocks);

  const flockOptions = useMemo(() => {
    if (!scopeBarn) return flockLabels;
    return flocks
      .filter((f) => String(f.barn || "") === scopeBarn)
      .map((f) => String(f.label || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [flocks, flockLabels, scopeBarn]);

  const insightsScope: InsightsScope = useMemo(
    () => ({
      barn: scopeBarn || null,
      flock: scopeFlock || null,
    }),
    [scopeBarn, scopeFlock]
  );

  function handleRefresh() {
    reload();
    if (homeTab === "trends") setRefreshKey((k) => k + 1);
  }

  async function handleSavePacks() {
    await save();
    setRefreshKey((k) => k + 1);
  }

  if (isPipelineSalesRole(user)) {
    return <Navigate to={companyHref("/farm/pipeline")} replace />;
  }

  return (
    <div
      className={
        homeTab === "trends"
          ? "flex w-full flex-col gap-3 pb-4"
          : "w-full space-y-stack pb-12"
      }
    >
      <PageHeader
        title={homeTab === "trends" ? "Trends" : "Today"}
        tabs={
          <PageTabs
            aria-label="Home view"
            value={homeTab}
            onChange={(v) => {
              const next = new URLSearchParams(searchParams);
              if (v === "trends") next.set("tab", "trends");
              else next.delete("tab");
              setSearchParams(next, { replace: true });
            }}
            options={[
              { value: "today", label: "Today" },
              { value: "trends", label: "Trends" },
            ]}
          />
        }
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {homeTab === "trends" && dataAsOf ? (
              <span className="type-caption text-[var(--text-muted)]">Data as of {dataAsOf}</span>
            ) : null}
            <Link
              to={`${companyHref("farm/reports")}?type=farm_operations`}
              className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors"
            >
              Reports
            </Link>
            <Button variant="secondary" size="sm" onClick={handleRefresh}>
              Refresh
            </Button>
            {canConfigurePacks && homeTab === "trends" ? (
              <Button variant="secondary" size="sm" onClick={() => setConfigOpen(true)}>
                Widgets
              </Button>
            ) : null}
          </div>
        }
      />

      {homeTab === "today" ? (
        <ManagementToday
          flocks={flocks}
          farmScore={farmScore}
          growthInsights={growthInsights}
          totalLive={flocks.reduce((s, f) => s + Number(f.birdsLiveEstimate ?? 0), 0)}
          mort7d={flocks.reduce((s, f) => s + Number(f.mortality7d ?? 0), 0)}
          fcrLabel={fcrKpiLabel(flocks)}
          overdueCount={flocks.reduce((s, f) => s + Number(f.overdueRounds ?? 0), 0)}
          companyHref={companyHref}
          role={role}
        />
      ) : null}

      {homeTab === "trends" ? (
        <>
          {configOpen && canConfigurePacks ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--border-color)] bg-[var(--surface-elevated)] p-card shadow-[var(--shadow-elevated)] space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-[var(--text-primary)]">Insights packs</h2>
                  <IconButton size="sm" label="Close" onClick={() => setConfigOpen(false)}>
                    ×
                  </IconButton>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {note ||
                    "With all packs on you get the full Command Center. Turn some off to show only those packs."}
                </p>
                <div className="space-y-2">
                  {draft.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 cursor-pointer rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-card)] px-3 py-2.5 hover:bg-[var(--surface-elevated)] transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={() => toggle(p.id)}
                        className="h-4 w-4 rounded accent-[var(--primary-color)]"
                      />
                      <span className="text-sm text-[var(--text-primary)]">{p.label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setConfigOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSavePacks} disabled={saving} loading={saving}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <TableToolbar
            filters={
              <>
                <FacetFilter
                  label="Barn"
                  value={scopeBarn || "all"}
                  allValue="all"
                  allLabel="All barns"
                  onChange={(v) => {
                    setScopeBarn(v === "all" ? "" : v);
                    setScopeFlock("");
                  }}
                  options={barns.map((b) => ({ value: b, label: b }))}
                />
                <FacetFilter
                  label="Flock"
                  value={scopeFlock || "all"}
                  allValue="all"
                  allLabel="All flocks"
                  onChange={(v) => setScopeFlock(v === "all" ? "" : v)}
                  options={flockOptions.map((label) => ({ value: label, label }))}
                />
              </>
            }
            actions={
              scopeBarn || scopeFlock ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setScopeBarn("");
                    setScopeFlock("");
                  }}
                >
                  Clear scope
                </Button>
              ) : null
            }
          />

          <SupersetInsightsEmbed
            refreshKey={refreshKey}
            onDataAsOf={onDataAsOf}
            packs={applied}
            scope={insightsScope}
          />
        </>
      ) : null}
    </div>
  );
}
