/**
 * Recruitment — growth altitude (sellers + scouts first, channel quality, targets).
 */

import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canAccessPipelineDesk } from "../../auth/permissions";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import { PageHeader } from "../../components/PageHeader";
import { ManagerPage } from "../../components/layout/ManagerPage";
import { ErrorState, SkeletonList } from "../../components/LoadingSkeleton";
import { EmptyState } from "../../components/EmptyState";
import {
  Button,
  Field,
  Input,
  NoticeStrip,
  SegmentedControl,
  StatusPill,
} from "../../components/ui";
import { formatRwf } from "../../lib/formatRwf";
import {
  fetchRecruitmentSummary,
  saveMarketExpectations,
  type MarketExpectations,
  type RecruitmentSummary,
} from "../../api/marketInsights.api";

const DAYS_OPTS = [
  { value: "7", label: "7d" },
  { value: "14", label: "14d" },
  { value: "30", label: "30d" },
];

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

function vsTone(pct: number): "ok" | "warn" | "neutral" {
  if (pct >= 80) return "ok";
  if (pct > 0) return "warn";
  return "neutral";
}

function sourceLabel(source: string) {
  const s = source.toLowerCase();
  if (s === "whatsapp" || s === "wa") return "WhatsApp";
  if (s === "instagram" || s === "ig") return "Instagram";
  if (s === "facebook" || s === "fb") return "Facebook";
  if (s === "google") return "Google";
  if (s === "direct") return "Direct";
  return source;
}

export function MarketRecruitmentPage() {
  const { user, token } = useAuth();
  const { companyHref } = useCompanyNav();
  const allowed = canAccessPipelineDesk(user);

  const [days, setDays] = useState("7");
  const [data, setData] = useState<RecruitmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<MarketExpectations>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const summary = await fetchRecruitmentSummary(token, Number(days));
      setData(summary);
      setDraft(summary.expectations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load recruitment");
    } finally {
      setLoading(false);
    }
  }, [token, days]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function saveTargets() {
    setSaving(true);
    try {
      const next = await saveMarketExpectations(token, draft);
      setDraft(next.expectations);
      setTargetsOpen(false);
      setRefreshKey((n) => n + 1);
    } catch {
      /* keep open */
    }
    setSaving(false);
  }

  if (!allowed) {
    return <Navigate to={companyHref("/farm/pipeline")} replace />;
  }

  if (loading && !data) {
    return (
      <ManagerPage>
        <PageHeader title="Recruitment" />
        <SkeletonList rows={6} />
      </ManagerPage>
    );
  }

  if (error && !data) {
    return (
      <ManagerPage>
        <PageHeader title="Recruitment" />
        <ErrorState message={error} onRetry={() => setRefreshKey((n) => n + 1)} />
      </ManagerPage>
    );
  }

  if (!data) {
    return (
      <ManagerPage>
        <PageHeader title="Recruitment" />
        <EmptyState title="Recruitment is not ready" description="Connect Postgres to load growth metrics." />
      </ManagerPage>
    );
  }

  const sc = data.scorecard;
  const behindScouts = data.scouts.leaderboard.filter((s) => s.tone === "danger").length;
  const worstChannel = [...data.channels]
    .filter((c) => c.sellers >= 2)
    .sort((a, b) => b.deadRatePct - a.deadRatePct)[0];

  return (
    <ManagerPage>
      <PageHeader
        title="Recruitment"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SegmentedControl label="Range" value={days} onChange={setDays} options={DAYS_OPTS} />
            <Button size="sm" variant="secondary" onClick={() => setTargetsOpen(true)}>
              Targets
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRefreshKey((n) => n + 1)}>
              Refresh
            </Button>
            <Link
              to={companyHref("/admin/signups")}
              className="text-sm font-semibold text-[var(--primary-color)] hover:underline"
            >
              Signups CRM →
            </Link>
          </div>
        }
      />

      <div className="space-y-4">
        <p className="type-caption text-[var(--text-muted)]">
          Data as of {new Date(data.dataAsOf).toLocaleString()} · last {data.days} days · sellers &amp; scouts
          first
        </p>

        <div className="flex flex-wrap gap-3">
          {sc.stuckSellers > 0 ? (
            <Link
              to={companyHref("/admin/signups?tab=people&accountType=farmer&stage=contacted")}
              className="text-sm font-semibold text-[var(--primary-color)] hover:underline"
            >
              {sc.stuckSellers} sellers stuck early →
            </Link>
          ) : null}
          {behindScouts > 0 ? (
            <a href="#scout-board" className="text-sm font-semibold text-[var(--primary-color)] hover:underline">
              {behindScouts} scouts below 40% target →
            </a>
          ) : null}
          {worstChannel && worstChannel.deadRatePct >= 50 ? (
            <Link
              to={companyHref("/admin/signups?tab=links")}
              className="text-sm font-semibold text-[var(--primary-color)] hover:underline"
            >
              {sourceLabel(worstChannel.source)} dead rate {worstChannel.deadRatePct}% →
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Link opens" value={String(sc.opens)} hint={`${sc.joinStarted} started joining`} />
          <Kpi
            label="Accounts"
            value={String(sc.accounts)}
            hint={`${sc.failRatePct}% fail rate`}
            tone={sc.failRatePct > 25 ? "warn" : "neutral"}
          />
          <Kpi
            label="Sellers activated"
            value={`${sc.sellersActivated} / ${Math.round(sc.targets.sellers)}`}
            hint={`${sc.sellersVsTargetPct}% of weekly target · ${sc.newSellers} new`}
            tone={vsTone(sc.sellersVsTargetPct)}
          />
          <Kpi
            label="Scouts activated"
            value={`${sc.scoutsActivated} / ${Math.round(sc.targets.scouts)}`}
            hint={`${sc.scoutsVsTargetPct}% of weekly target · ${sc.newScouts} new`}
            tone={vsTone(sc.scoutsVsTargetPct)}
          />
        </div>

        <section className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-elevated)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Channels</h2>
            <p className="type-caption text-[var(--text-muted)]">
              Open → account → activated listing → first paid
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--border-color)] type-caption text-[var(--text-muted)]">
                <tr>
                  <th className="px-2 py-2 font-medium">Source</th>
                  <th className="px-2 py-2 font-medium">Opens</th>
                  <th className="px-2 py-2 font-medium">Accounts</th>
                  <th className="px-2 py-2 font-medium">Sellers act.</th>
                  <th className="px-2 py-2 font-medium">Dead %</th>
                  <th className="px-2 py-2 font-medium">Days to list</th>
                  <th className="px-2 py-2 font-medium">First paid</th>
                  <th className="px-2 py-2 font-medium">Scouts</th>
                </tr>
              </thead>
              <tbody>
                {data.channels.map((c) => (
                  <tr key={c.source} className="border-b border-[var(--border-color)]">
                    <td className="px-2 py-2 font-medium text-[var(--text-primary)]">
                      {sourceLabel(c.source)}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{c.opens}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {c.accounts}
                      <span className="ml-1 type-caption text-[var(--text-muted)]">
                        ({c.openToAccountPct}%)
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {c.sellersActivated}
                      <span className="ml-1 type-caption text-[var(--text-muted)]">
                        ({c.accountToActivatedPct}%)
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <StatusPill tone={c.deadRatePct >= 50 ? "danger" : c.deadRatePct >= 25 ? "warning" : "neutral"}>
                        {c.deadRatePct}%
                      </StatusPill>
                    </td>
                    <td className="px-2 py-2 tabular-nums text-[var(--text-secondary)]">
                      {c.avgDaysToListing != null ? `${c.avgDaysToListing}d` : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{c.firstPaid}</td>
                    <td className="px-2 py-2 tabular-nums">{c.scouts}</td>
                  </tr>
                ))}
                {!data.channels.length ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-6 text-center text-[var(--text-muted)]">
                      No channel activity in this window.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section id="scout-board" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Scout management</h2>
              <p className="type-caption text-[var(--text-muted)]">
                Target {data.expectations.scoutLotsPerWeek} lots · {data.expectations.scoutSellersPerWeek}{" "}
                sellers · {data.expectations.scoutBirdsPerWeek} birds / week
              </p>
            </div>
            <div className="flex flex-wrap gap-3 type-caption text-[var(--text-secondary)]">
              <span>Apps pending {data.scouts.applications.pending}</span>
              <span>Approved {data.scouts.applications.approved}</span>
              <Link
                to={companyHref("/farm/pipeline?tab=scouts&panel=pay")}
                className="font-semibold text-[var(--primary-color)] hover:underline"
              >
                Unpaid {data.scouts.unpaidCommissions.count} ·{" "}
                {formatRwf(data.scouts.unpaidCommissions.amountRwf)} →
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border-color)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--border-color)] bg-[var(--surface-subtle)] type-caption text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Scout</th>
                  <th className="px-3 py-2 font-medium">District</th>
                  <th className="px-3 py-2 font-medium">Lots</th>
                  <th className="px-3 py-2 font-medium">Sellers</th>
                  <th className="px-3 py-2 font-medium">Birds</th>
                  <th className="px-3 py-2 font-medium">vs target</th>
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
                        tone={s.tone === "ok" ? "success" : s.tone === "warn" ? "warning" : "danger"}
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

          {data.scouts.inactive.length ? (
            <NoticeStrip tone="warning">
              {data.scouts.inactive.length} scouts inactive (no lot in 14d):{" "}
              {data.scouts.inactive
                .slice(0, 5)
                .map((s) => s.name)
                .join(", ")}
              {data.scouts.inactive.length > 5 ? "…" : ""}
            </NoticeStrip>
          ) : null}

          {data.scouts.coverageGaps.some((g) => g.gap) ? (
            <section className="rounded-[var(--radius-md)] border border-[var(--border-color)] bg-[var(--surface-elevated)] p-4">
              <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
                Coverage gaps (demand, no scout lots 30d)
              </h3>
              <ul className="space-y-1 type-caption text-[var(--text-secondary)]">
                {data.scouts.coverageGaps
                  .filter((g) => g.gap)
                  .slice(0, 8)
                  .map((g) => (
                    <li key={g.district}>
                      <span className="font-medium text-[var(--text-primary)]">{g.district}</span> —{" "}
                      {g.openDemands} open demands · {g.birdsWanted} birds wanted
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </section>
      </div>

      {targetsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg space-y-4 rounded-[var(--radius-xl)] border border-[var(--border-color)] bg-[var(--surface-elevated)] p-card shadow-[var(--shadow-elevated)]">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[var(--text-primary)]">Weekly targets</h2>
              <Button size="sm" variant="ghost" onClick={() => setTargetsOpen(false)}>
                Close
              </Button>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Recruitment uses new activated sellers/scouts. Scout board uses lots/sellers/birds per scout.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["newSellersPerWeek", "New sellers / week"],
                  ["newScoutsPerWeek", "New scouts / week"],
                  ["newBuyersPerWeek", "New buyers / week"],
                  ["scoutLotsPerWeek", "Scout lots / week"],
                  ["scoutSellersPerWeek", "Scout sellers / week"],
                  ["scoutBirdsPerWeek", "Scout birds / week"],
                  ["deadAfterDays", "Dead after (days)"],
                  ["sellerDaysToFirstListing", "Days to first listing"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input
                    type="number"
                    min={0}
                    value={String(draft[key] ?? "")}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                  />
                </Field>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setTargetsOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void saveTargets()} disabled={saving} loading={saving}>
                {saving ? "Saving…" : "Save targets"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ManagerPage>
  );
}
