import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../auth/AuthContext";
import { ErrorState, SkeletonList } from "../../../components/LoadingSkeleton";
import { useCompanyNav } from "../../../hooks/useCompanyNav";
import {
  fetchMarketJobs,
  fetchMarketLeads,
  fetchMarketOpsSummary,
  fetchMarketReach,
  fetchOpsCommissions,
  fetchVerifyQueue,
  fetchWeighQueue,
} from "../../../api/pipeline.api";
import type { MarketOpsTab } from "../MarketOpsPage";
import { formatRwf } from "../../../lib/formatRwf";
import {
  DEMO_COMMISSIONS,
  DEMO_JOBS,
  DEMO_LEADS,
  DEMO_OPS_SUMMARY,
  DEMO_VERIFY,
  DEMO_WEIGH,
  isMarketDemoEligibleError,
} from "./demoMarketData";
import { useMarketDemoFlag } from "./useMarketDemoFlag";

type Props = {
  queue?: string;
  onOpenTab: (tab: MarketOpsTab, opts?: { panel?: string; queue?: string }) => void;
};

type QueueCard = {
  key: string;
  label: string;
  value: number | string;
  /** Live figure only (money, counts) — never explanatory prose. */
  meta?: string;
  tone: "neutral" | "warning" | "danger" | "info";
  onClick: () => void;
};

export function TodayPanel({ queue, onOpenTab }: Props) {
  const { token } = useAuth();
  const { companyHref } = useCompanyNav();
  const [apiFailed, setApiFailed] = useState(false);
  const demo = useMarketDemoFlag(apiFailed);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ops, setOps] = useState<{
    openLotBirds: number;
    committedThisWeek: number;
    accruedUnpaidRwf: number;
    newLeads?: number;
    openExceptions?: number;
  } | null>(null);
  const [weighDue, setWeighDue] = useState(0);
  const [verifyPending, setVerifyPending] = useState(0);
  const [unpaidLocks, setUnpaidLocks] = useState(0);
  const [openJobs, setOpenJobs] = useState(0);
  const [unpaidCommissions, setUnpaidCommissions] = useState(0);
  const [newLeads, setNewLeads] = useState(0);
  const [jobs, setJobs] = useState<typeof DEMO_JOBS>([]);
  const [reach, setReach] = useState<{
    todayOpened: number;
    week: { opened: number; joinStarted: number; accounts: number };
    sources: { source: string; opened: number; joinStarted: number; accounts: number }[];
    links: { source: string; url: string }[];
  } | null>(null);

  const reload = useCallback(async () => {
    if (!token && !demo) return;
    setLoading(true);
    setError(null);
    try {
      if (demo) {
        setOps(DEMO_OPS_SUMMARY);
        setWeighDue(DEMO_WEIGH.length);
        setVerifyPending(
          DEMO_VERIFY.companies.length +
            DEMO_VERIFY.buyers.length +
            DEMO_VERIFY.lots.length +
            DEMO_VERIFY.profiles.length
        );
        setUnpaidLocks(
          DEMO_JOBS.filter(
            (j) =>
              j.status === "committed" &&
              (j.buyerPaymentStatus == null ||
                j.buyerPaymentStatus === "unpaid" ||
                j.buyerPaymentStatus === "pending")
          ).length
        );
        setOpenJobs(DEMO_JOBS.length);
        setJobs(DEMO_JOBS);
        setUnpaidCommissions(DEMO_COMMISSIONS.length);
        setNewLeads(DEMO_LEADS.length);
        setReach(null);
        setApiFailed(false);
        return;
      }
      const [summary, weigh, verify, jobsRes, commissions, leads, reachRes] = await Promise.all([
        fetchMarketOpsSummary(token).catch(() => null),
        fetchWeighQueue(token, true).catch(() => ({ lots: [], dueThisWeek: 0, visitFeeRwf: 0 })),
        fetchVerifyQueue(token).catch(() => ({
          companies: [],
          buyers: [],
          lots: [],
          profiles: [],
          scouts: [],
        })),
        fetchMarketJobs(token, "open").catch(() => ({ jobs: [] })),
        fetchOpsCommissions(token, "accrued").catch(() => ({ commissions: [] })),
        fetchMarketLeads(token, "new").catch(() => ({ leads: [] })),
        fetchMarketReach(token).catch(() => null),
      ]);
      // If every call soft-failed empty and summary is null, try a hard probe
      if (!summary) {
        try {
          await fetchMarketOpsSummary(token);
        } catch (e) {
          if (isMarketDemoEligibleError(e)) {
            setApiFailed(true);
            return;
          }
        }
      }
      setApiFailed(false);
      setOps(summary);
      setWeighDue(weigh.dueThisWeek ?? weigh.lots.length);
      const v =
        (verify.companies?.length ?? 0) +
        (verify.buyers?.length ?? 0) +
        (verify.lots?.length ?? 0) +
        (verify.profiles?.length ?? 0) +
        (verify.scouts?.length ?? 0);
      setVerifyPending(v);
      setUnpaidLocks(
        jobsRes.jobs.filter(
          (j) =>
            j.status === "committed" &&
            (j.buyerPaymentStatus == null ||
              j.buyerPaymentStatus === "unpaid" ||
              j.buyerPaymentStatus === "pending")
        ).length
      );
      setOpenJobs(jobsRes.jobs.length);
      setJobs(jobsRes.jobs);
      setUnpaidCommissions(commissions.commissions.length);
      setNewLeads(leads.leads.length);
      setReach(reachRes);
    } catch (e) {
      if (isMarketDemoEligibleError(e)) {
        setApiFailed(true);
        return;
      }
      setError(e instanceof Error ? e.message : "Could not load market queues");
    } finally {
      setLoading(false);
    }
  }, [token, demo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) return <SkeletonList rows={4} />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;

  const cards: QueueCard[] = [
    {
      key: "weigh",
      label: "Needs weigh",
      value: weighDue,
      tone: weighDue ? "warning" : "neutral",
      onClick: () => onOpenTab("scouts", { panel: "weigh" }),
    },
    {
      key: "verify",
      label: "Pending verify",
      value: verifyPending,
      tone: verifyPending ? "warning" : "neutral",
      onClick: () => onOpenTab("buyers", { panel: "verify" }),
    },
    {
      key: "leads",
      label: "New leads",
      value: newLeads || ops?.newLeads || 0,
      tone: (newLeads || ops?.newLeads || 0) ? "info" : "neutral",
      onClick: () => onOpenTab("buyers", { panel: "leads" }),
    },
    {
      key: "locks",
      label: "Unpaid locks",
      value: unpaidLocks,
      tone: unpaidLocks ? "danger" : "neutral",
      onClick: () => onOpenTab("buyers", { panel: "locks" }),
    },
    {
      key: "jobs",
      label: "Open handovers",
      value: openJobs || ops?.openExceptions || 0,
      tone: (openJobs || ops?.openExceptions || 0) ? "danger" : "neutral",
      onClick: () => onOpenTab("today", { queue: "jobs" }),
    },
    {
      key: "pay",
      label: "Pay scouts",
      value: unpaidCommissions,
      meta: ops != null ? formatRwf(ops.accruedUnpaidRwf) : undefined,
      tone: unpaidCommissions ? "warning" : "neutral",
      onClick: () => onOpenTab("scouts", { panel: "pay" }),
    },
  ];

  return (
    <div className="space-y-stack">
      <LinkOpens reach={reach} />

      <div className="flex flex-wrap gap-3">
        <Link
          to={companyHref("/dashboard/market")}
          className="text-sm font-semibold text-[var(--primary-color)] hover:underline"
        >
          Market overview →
        </Link>
        <Link
          to={companyHref("/dashboard/market/recruitment")}
          className="text-sm font-semibold text-[var(--primary-color)] hover:underline"
        >
          Recruitment →
        </Link>
      </div>

      {!demo && ops ? (
        <div className="flex flex-wrap gap-3 type-caption tabular-nums text-[var(--text-primary)]">
          <span>{ops.openLotBirds} birds open</span>
          <span>{ops.committedThisWeek} booked this week</span>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={c.onClick}
            className={[
              "rounded-[var(--radius-xl)] border border-[var(--border-color)] px-4 py-3 text-left transition hover:border-[var(--border-strong)]",
              c.tone === "danger"
                ? "bg-[var(--status-danger-soft)]"
                : c.tone === "warning"
                  ? "bg-[var(--status-warning-soft)]"
                  : c.tone === "info"
                    ? "bg-[var(--status-info-soft)]"
                    : "bg-[var(--surface-card)]",
            ].join(" ")}
          >
            <p className="type-label text-[var(--text-primary)]">{c.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {c.value}
            </p>
            {c.meta ? (
              <p className="mt-1 type-caption tabular-nums text-[var(--text-primary)]">{c.meta}</p>
            ) : null}
          </button>
        ))}
      </div>

      {queue === "jobs" ? (
        <JobsInline jobs={jobs} onDone={() => onOpenTab("today")} />
      ) : null}
    </div>
  );
}

function sourceLabel(source: string): string {
  if (source === "instagram") return "Instagram";
  if (source === "whatsapp") return "WhatsApp";
  if (source === "facebook") return "Facebook";
  if (source === "direct") return "Direct";
  return source;
}

function LinkOpens({
  reach,
}: {
  reach: {
    todayOpened: number;
    week: { opened: number; joinStarted: number; accounts: number };
    sources: { source: string; opened: number }[];
    links: { source: string; url: string }[];
  } | null;
}) {
  const { companyHref } = useCompanyNav();
  const week = reach?.week ?? { opened: 0, joinStarted: 0, accounts: 0 };
  const sourceLine = (reach?.sources ?? [])
    .filter((row) => row.opened > 0)
    .map((row) => `${sourceLabel(row.source)} ${row.opened}`)
    .join(" · ");

  return (
    <section className="rounded-[var(--radius-xl)] border border-[var(--border-color)] bg-[var(--surface-card)] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="type-label text-[var(--text-primary)]">Link opens</p>
          <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {reach?.todayOpened ?? 0}
            <span className="ml-2 type-caption font-sans font-medium text-[var(--text-secondary)]">today</span>
          </p>
        </div>
        <Link
          to={companyHref("/admin/signups?tab=funnel")}
          className="text-sm font-semibold text-[var(--primary-color)] hover:underline"
        >
          Open Signups
        </Link>
      </div>
      <p className="mt-2 text-sm text-[var(--text-primary)]">
        Last 7 days · {week.opened} opened · {week.joinStarted} started joining · {week.accounts} accounts
      </p>
      {sourceLine ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{sourceLine}</p> : null}
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        People, failed attempts, and ad links live in Signups.
      </p>
    </section>
  );
}

function JobsInline({
  jobs,
  onDone,
}: {
  jobs: typeof DEMO_JOBS;
  onDone: () => void;
}) {
  return (
    <div className="table-block">
      <div className="table-toolbar items-center justify-between">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Open handovers</p>
        <button type="button" className="text-xs font-semibold text-[var(--text-secondary)] hover:underline" onClick={onDone}>
          Close
        </button>
      </div>
      {jobs.length === 0 ? (
        <p className="px-card py-6 type-caption text-[var(--text-muted)]">No open handovers.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-color)]">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-card py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-[var(--text-primary)]">
                  {j.buyerName ?? "Buyer"} · {j.birds} birds
                </p>
                <p className="type-caption text-[var(--text-muted)]">
                  {j.lotFarmLabel ?? j.publicRef ?? j.lotId.slice(0, 8)} · {j.handshake ?? j.status}
                  {j.exceptionKind && j.exceptionKind !== "none" ? ` · ${j.exceptionKind}` : ""}
                </p>
              </div>
              <p className="tabular-nums text-[var(--text-secondary)]">
                {j.buyerPaymentStatus ?? "—"} / {j.farmerPayoutStatus ?? "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
