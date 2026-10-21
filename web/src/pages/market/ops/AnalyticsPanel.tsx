import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../../../auth/AuthContext";
import { ErrorState, SkeletonList } from "../../../components/LoadingSkeleton";
import { EmptyState } from "../../../components/EmptyState";
import {
  Button,
  Metric,
  NoticeStrip,
  SegmentedControl,
  StatusPill,
} from "../../../components/ui";
import {
  fetchMarketAnalyticsSummary,
  fetchMarketInsightsMeta,
  type MarketAnalyticsSummary,
  type MarketInsightsMeta,
} from "../../../api/marketInsights.api";
import type { InsightsPack } from "../../../api/insights.api";
import { formatRwf } from "../../../lib/formatRwf";
import { SupersetInsightsEmbed } from "../../../components/insights/SupersetInsightsEmbed";

const DAYS_OPTS = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];

const PACK_COLORS = ["var(--brand-primary)", "#2a9d8f", "#e9c46a", "#f4a261", "#264653"];

type Props = {
  /** glance = native manager KPIs; deep = Superset Command Center. */
  mode?: "glance" | "deep";
};

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn" | "neutral";
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-elevated)] px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="type-caption text-[var(--text-muted)]">{label}</p>
        {tone === "ok" ? <StatusPill tone="success">On track</StatusPill> : null}
        {tone === "warn" ? <StatusPill tone="warning">Below</StatusPill> : null}
      </div>
      <p className="mt-1 truncate text-xl font-semibold tracking-tight text-[var(--text-primary)]">
        {value}
      </p>
      {hint ? <p className="mt-0.5 type-caption text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

function FunnelBars({ steps }: { steps: { stage: string; count: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={s.stage} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2">
          <span className="type-caption text-[var(--text-secondary)]">{s.stage}</span>
          <div className="h-7 overflow-hidden rounded-md bg-[var(--surface-subtle)]">
            <div
              className="flex h-full items-center px-2 text-xs font-medium text-white transition-[width] duration-500"
              style={{
                width: `${Math.max(4, (s.count / max) * 100)}%`,
                background: PACK_COLORS[i % PACK_COLORS.length],
              }}
            >
              {s.count > 0 ? s.count : ""}
            </div>
          </div>
          <span className="text-right type-caption tabular-nums text-[var(--text-muted)]">
            {s.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-elevated)] p-4">
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {children}
    </section>
  );
}

export function AnalyticsPanel({ mode = "glance" }: Props) {
  const { token } = useAuth();
  const [days, setDays] = useState("30");
  const [meta, setMeta] = useState<MarketInsightsMeta | null>(null);
  const [data, setData] = useState<MarketAnalyticsSummary | null>(null);
  const [packs, setPacks] = useState<InsightsPack[]>([]);
  const [activePack, setActivePack] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const preferNative = mode === "glance";
  const preferDeep = mode === "deep";

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [m, summary] = await Promise.all([
        fetchMarketInsightsMeta(token),
        fetchMarketAnalyticsSummary(token, Number(days)),
      ]);
      setMeta(m);
      setData(summary);
      const nextPacks = (m.packs || []).length
        ? m.packs!
        : [
            { id: "overview", label: "Overview", enabled: true },
            { id: "supply", label: "Supply", enabled: true },
            { id: "demand", label: "Demand", enabled: true },
            { id: "scouts", label: "Scouts", enabled: true },
            { id: "sales", label: "Sales", enabled: true },
          ];
      setPacks(nextPacks);
      if (!nextPacks.some((p) => p.id === activePack && p.enabled)) {
        const first = nextPacks.find((p) => p.enabled);
        if (first) setActivePack(first.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load analytics");
    } finally {
      setLoading(false);
    }
  }, [token, days, activePack]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const enabledPacks = useMemo(() => packs.filter((p) => p.enabled), [packs]);
  const supersetReady =
    meta?.mode === "superset" &&
    meta.configured &&
    Boolean(meta.supersetUrl) &&
    (Boolean(meta.dashboardUuid) || Object.keys(meta.packDashboards || {}).length > 0);
  /** Glance stays native; deep prefers Superset when provisioned. */
  const useSuperset = preferDeep && Boolean(supersetReady);

  const embedPacks = useMemo(() => {
    if (!useSuperset) return enabledPacks;
    return enabledPacks.map((p) => ({
      ...p,
      enabled: p.id === activePack,
    }));
  }, [useSuperset, enabledPacks, activePack]);

  const embedMeta = useMemo(() => {
    if (!meta || !useSuperset) return null;
    return { ...meta, packs: embedPacks };
  }, [meta, useSuperset, embedPacks]);

  if (loading && !data && !(preferDeep && meta)) {
    return <SkeletonList rows={6} />;
  }
  if (error && !data && !supersetReady) {
    return <ErrorState message={error} onRetry={() => setRefreshKey((n) => n + 1)} />;
  }
  if (preferDeep && !loading && !data && !supersetReady) {
    return (
      <EmptyState
        title="Market trends is not ready"
        description="Finish Farm Postgres → Superset market pack setup, or open Market overview for live KPIs."
        action={
          <Link
            to="/dashboard/market"
            className="inline-flex min-h-control-sm items-center rounded-control bg-[var(--primary-color)] px-2.5 text-xs font-medium text-[var(--text-on-primary)]"
          >
            Open Market overview
          </Link>
        }
      />
    );
  }

  if (!data && !useSuperset && !loading) {
    return (
      <EmptyState
        title="Market overview is not ready"
        description="Connect Postgres or finish Superset market pack setup."
      />
    );
  }

  const k = data?.overview.kpis;
  const matchTone =
    k && k.matchRatePct >= k.matchRateTargetPct
      ? "ok"
      : k && k.matchRatePct > 0
        ? "warn"
        : "neutral";
  const sellTone =
    k && k.sellThroughPct >= k.sellThroughTargetPct
      ? "ok"
      : k && k.sellThroughPct > 0
        ? "warn"
        : "neutral";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Pack"
          value={activePack}
          onChange={setActivePack}
          options={enabledPacks.map((p) => ({ value: p.id, label: p.label }))}
        />
        <div className="flex flex-wrap items-center gap-2">
          {preferNative || !useSuperset ? (
            <SegmentedControl
              label="Range"
              value={days}
              onChange={setDays}
              options={DAYS_OPTS}
            />
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => setRefreshKey((n) => n + 1)}>
            Refresh
          </Button>
        </div>
      </div>

      {data ? (
        <p className="type-caption text-[var(--text-muted)]">
          Data as of {new Date(data.dataAsOf).toLocaleString()} · last {data.days} days
          {useSuperset ? " · Superset embed" : " · Live from Farm"}
        </p>
      ) : null}

      {useSuperset ? (
        <>
          <NoticeStrip tone="info">
            Market Command Center — denser BI, filters, and pack deep dives.
          </NoticeStrip>
          <SupersetInsightsEmbed
            refreshKey={refreshKey}
            packs={embedPacks}
            surface="market"
            metaOverride={embedMeta}
          />
        </>
      ) : data && k ? (
        <div className="space-y-4">
          {preferDeep && !supersetReady ? (
            <NoticeStrip tone="warning">
              Superset packs are not linked yet — showing live Farm KPIs until provisioning finishes.
            </NoticeStrip>
          ) : null}
          {activePack === "overview" ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="GMV" value={formatRwf(k.gmvRwf)} hint={`${k.birdsSold} birds sold`} />
                <Kpi
                  label="Match rate"
                  value={`${k.matchRatePct}%`}
                  hint={`Target ${k.matchRateTargetPct}%`}
                  tone={matchTone}
                />
                <Kpi
                  label="Sell-through"
                  value={`${k.sellThroughPct}%`}
                  hint={`Target ${k.sellThroughTargetPct}%`}
                  tone={sellTone}
                />
                <Kpi
                  label="Take rate"
                  value={`${k.takeRatePct}%`}
                  hint={formatRwf(k.commissionRwf)}
                />
                <Kpi label="Listings live" value={String(k.listingsLive)} />
                <Kpi
                  label="Sellers : buyers"
                  value={
                    k.sellerBuyerRatio != null
                      ? `${k.activeSellers} : ${k.activeBuyers}`
                      : `${k.activeSellers} / ${k.activeBuyers}`
                  }
                />
                <Kpi label="Reach opens" value={String(k.reachOpens)} />
                <Kpi label="Signups ok" value={String(k.signupsOk)} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <ChartFrame title="GMV trend (12 weeks)">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.overview.gmvTrend}>
                        <defs>
                          <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} hide />
                        <YAxis tick={{ fontSize: 11 }} width={48} />
                        <Tooltip
                          formatter={(v: number) => formatRwf(v)}
                          labelFormatter={(l) => String(l).slice(0, 10)}
                        />
                        <Area
                          type="monotone"
                          dataKey="gmv"
                          stroke="var(--brand-primary)"
                          fill="url(#gmvFill)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </ChartFrame>
                <ChartFrame title="Match rate by week">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.overview.matchTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} hide />
                        <YAxis tick={{ fontSize: 11 }} width={36} unit="%" />
                        <Tooltip />
                        <Bar dataKey="matchRatePct" radius={[4, 4, 0, 0]}>
                          {data.overview.matchTrend.map((_, i) => (
                            <Cell key={i} fill={PACK_COLORS[i % PACK_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartFrame>
              </div>

              <ChartFrame title="Liquidity by district">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.overview.byRegion.slice(0, 12)} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="district" width={100} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="birdsListed" name="Birds listed" fill="var(--brand-primary)" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="buyers" name="Buyers" fill="#2a9d8f" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartFrame>
            </>
          ) : null}

          {activePack === "supply" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartFrame title="Seller funnel">
                <FunnelBars steps={data.supply.funnel} />
                <p className="mt-3 type-caption text-[var(--text-muted)]">
                  Expect first listing within {data.supply.expectationDaysToListing} days of signup.
                </p>
              </ChartFrame>
              <ChartFrame title="Sell-through">
                <div className="grid grid-cols-3 gap-3">
                  <Metric label="Listed" value={String(data.supply.listed)} />
                  <Metric label="Matched" value={String(data.supply.sold)} />
                  <Metric label="Expired" value={String(data.supply.expired)} />
                </div>
                <p className="mt-4 text-2xl font-semibold text-[var(--text-primary)]">
                  {data.supply.sellThroughPct}%
                </p>
                <p className="type-caption text-[var(--text-muted)]">Sell-through this period</p>
                <div className="mt-4 h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.supply.byRegion.slice(0, 8)}>
                      <XAxis dataKey="district" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} width={40} />
                      <Tooltip />
                      <Bar dataKey="birdsListed" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartFrame>
            </div>
          ) : null}

          {activePack === "demand" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartFrame title="Buyer funnel">
                <FunnelBars steps={data.demand.funnel} />
                <p className="mt-3 type-caption text-[var(--text-muted)]">
                  Expect first demand within {data.demand.expectationDaysToDemand} days.
                </p>
              </ChartFrame>
              <ChartFrame title="Buyer stages">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.demand.peopleByStage}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                      <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} width={36} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#2a9d8f" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartFrame>
            </div>
          ) : null}

          {activePack === "scouts" ? (
            <div className="space-y-4">
              <NoticeStrip tone="info">
                Expected per week: {data.scouts.expectations.sellersPerWeek} sellers ·{" "}
                {data.scouts.expectations.lotsPerWeek} lots · {data.scouts.expectations.birdsPerWeek}{" "}
                birds (scaled to {data.days}d).
              </NoticeStrip>
              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-color)]">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-[var(--border-color)] bg-[var(--surface-subtle)] type-caption text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Scout</th>
                      <th className="px-3 py-2 font-medium">District</th>
                      <th className="px-3 py-2 font-medium">Lots</th>
                      <th className="px-3 py-2 font-medium">Sellers</th>
                      <th className="px-3 py-2 font-medium">Birds</th>
                      <th className="px-3 py-2 font-medium">vs expect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.scouts.leaderboard.map((s) => (
                      <tr key={s.scoutId} className="border-b border-[var(--border-color)]">
                        <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{s.name}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{s.district}</td>
                        <td className="px-3 py-2 tabular-nums">{s.lots}</td>
                        <td className="px-3 py-2 tabular-nums">{s.sellers}</td>
                        <td className="px-3 py-2 tabular-nums">{s.birds}</td>
                        <td className="px-3 py-2">
                          <StatusPill
                            tone={s.vsExpected.lotsPct >= 80 ? "success" : s.vsExpected.lotsPct >= 40 ? "warning" : "danger"}
                          >
                            {s.vsExpected.lotsPct}% lots
                          </StatusPill>
                        </td>
                      </tr>
                    ))}
                    {!data.scouts.leaderboard.length ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-[var(--text-muted)]">
                          No scout activity in this window.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {activePack === "sales" ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartFrame title="Sales through app vs scout">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <Kpi
                    label="App birds sold"
                    value={String(data.sales.channel.appBirdsSold)}
                    hint={`${data.sales.channel.appLots} lots`}
                  />
                  <Kpi
                    label="Scout birds sold"
                    value={String(data.sales.channel.scoutBirdsSold)}
                    hint={`${data.sales.channel.scoutLots} lots`}
                  />
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.sales.gmvTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                      <XAxis dataKey="week" hide />
                      <YAxis tick={{ fontSize: 11 }} width={48} />
                      <Tooltip formatter={(v: number) => formatRwf(v)} />
                      <Area type="monotone" dataKey="gmv" stroke="#264653" fill="#26465333" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </ChartFrame>
              <ChartFrame title="Settlement & cycle time">
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <Metric
                    label="To update"
                    value={
                      data.sales.cycle.hoursToUpdate != null
                        ? `${data.sales.cycle.hoursToUpdate}h`
                        : "—"
                    }
                  />
                  <Metric
                    label="Buyer pay"
                    value={
                      data.sales.cycle.hoursToBuyerPay != null
                        ? `${data.sales.cycle.hoursToBuyerPay}h`
                        : "—"
                    }
                  />
                  <Metric
                    label="Payout lag"
                    value={
                      data.sales.cycle.hoursPayoutLag != null
                        ? `${data.sales.cycle.hoursPayoutLag}h`
                        : "—"
                    }
                  />
                </div>
                <ul className="space-y-2">
                  {data.sales.settlements.map((s) => (
                    <li
                      key={`${s.side}-${s.status}`}
                      className="flex items-center justify-between type-caption"
                    >
                      <span className="text-[var(--text-secondary)]">
                        {s.side} · {s.status}
                      </span>
                      <span className="tabular-nums text-[var(--text-primary)]">
                        {s.count} · {formatRwf(s.amountRwf)}
                      </span>
                    </li>
                  ))}
                  {!data.sales.settlements.length ? (
                    <li className="text-[var(--text-muted)]">No settlements in this window.</li>
                  ) : null}
                </ul>
              </ChartFrame>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
