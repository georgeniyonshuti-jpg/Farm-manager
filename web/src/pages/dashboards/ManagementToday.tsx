import { Link } from "react-router-dom";
import type { OpsBoardFlock, GrowthInsight } from "../../lib/dashboardAdapters";
import { fcrStatusLabel } from "../../lib/dashboardAdapters";
import { Button } from "../../components/ui/Button";
import { StatusPill, type StatusTone } from "../../components/ui/StatusPill";

export type ActItem = {
  id: string;
  flockId?: string;
  flock: string;
  reason: string;
  age: string;
  href: string;
  cta: string;
  kind: "health" | "ops" | "stock";
};

function ageLabel(days: number | null | undefined): string {
  if (days == null) return "—";
  if (days < 1) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function buildActItems(
  flocks: OpsBoardFlock[],
  growthInsights: GrowthInsight[],
  companyHref: (path: string) => string
): ActItem[] {
  const items: ActItem[] = [];
  for (const f of flocks) {
    if (f.overdueRounds > 0) {
      items.push({
        id: `overdue-${f.flockId}`,
        flockId: f.flockId,
        flock: f.label,
        reason: `${f.overdueRounds} overdue check-in${f.overdueRounds === 1 ? "" : "s"}`,
        age: `Age ${f.ageDays}d`,
        href: companyHref("/farm/checkin-review"),
        cta: "Review",
        kind: "health",
      });
    }
    if ((f.daysSinceWeighIn ?? 0) >= 7) {
      items.push({
        id: `weigh-${f.flockId}`,
        flockId: f.flockId,
        flock: f.label,
        reason: "Missing weigh-in",
        age: ageLabel(f.daysSinceWeighIn ?? null),
        href: companyHref(`/farm/flocks/${encodeURIComponent(f.flockId)}`),
        cta: "Open flock",
        kind: "ops",
      });
    }
    if (f.withdrawalBlockers > 0) {
      items.push({
        id: `wd-${f.flockId}`,
        flockId: f.flockId,
        flock: f.label,
        reason: "Withdrawal blocker",
        age: `Age ${f.ageDays}d`,
        href: companyHref("/farm/treatments"),
        cta: "Medicine",
        kind: "health",
      });
    }
  }
  for (const g of growthInsights) {
    if (g.category === "feed" || /stock|out of feed|inventory/i.test(g.message)) {
      items.push({
        id: g.id,
        flockId: g.flockId,
        flock: g.flockLabel ?? "Farm",
        reason: g.message,
        age: "Stock",
        href: companyHref("/farm/inventory"),
        cta: "Inventory",
        kind: "stock",
      });
    }
  }
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}

export function sortActForRole(items: ActItem[], role: string): ActItem[] {
  const weight = (k: ActItem["kind"]) => {
    if (role === "vet_manager") return k === "health" ? 0 : k === "ops" ? 1 : 2;
    return k === "ops" ? 0 : k === "health" ? 1 : 2;
  };
  return [...items].sort((a, b) => weight(a.kind) - weight(b.kind));
}

export function fcrKpiLabel(flocks: OpsBoardFlock[]): string {
  const withFcr = flocks.filter((f) => f.latestFcr != null);
  if (!withFcr.length) return "Insufficient data";
  const onTrack = withFcr.filter((f) => f.fcrStatus === "on_track").length;
  if (onTrack === withFcr.length) return "On track";
  return fcrStatusLabel(withFcr[0]?.fcrStatus) || `${onTrack}/${withFcr.length} on track`;
}

function scoreTone(score: number | null): StatusTone {
  if (score == null) return "neutral";
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "danger";
}

function scoreMessage(score: number | null, flockCount: number, overdueCount: number): string {
  if (flockCount === 0) return "Place a flock to start your daily pulse.";
  if (score == null) return "Health score appears once flocks have enough data.";
  if (overdueCount > 0) return `${overdueCount} flock${overdueCount === 1 ? "" : "s"} need a check-in.`;
  if (score >= 80) return "Farm is in good shape — keep the rhythm.";
  if (score >= 60) return "A few signals to watch. Review Act below.";
  return "Attention needed. Clear Act items first.";
}

const TONE_SOFT: Record<StatusTone, string> = {
  success: "bg-[var(--status-success-soft)] text-[var(--status-success)]",
  warning: "bg-[var(--status-warning-soft)] text-[var(--status-warning)]",
  danger: "bg-[var(--status-danger-soft)] text-[var(--status-danger)]",
  info: "bg-[var(--status-info-soft)] text-[var(--status-info)]",
  neutral: "bg-[var(--status-neutral-soft)] text-[var(--status-neutral)]",
};

const TONE_BAR: Record<StatusTone, string> = {
  success: "bg-[var(--status-success)]",
  warning: "bg-[var(--status-warning)]",
  danger: "bg-[var(--status-danger)]",
  info: "bg-[var(--status-info)]",
  neutral: "bg-[var(--status-neutral)]",
};

const KIND_TONE: Record<ActItem["kind"], StatusTone> = {
  health: "danger",
  ops: "warning",
  stock: "info",
};

type Kpi = {
  label: string;
  value: string;
  to: string;
  tone: StatusTone;
  hint: string;
};

function riskTone(score: number): StatusTone {
  if (score >= 70) return "danger";
  if (score >= 40) return "warning";
  return "success";
}

function KpiTile({ kpi, href }: { kpi: Kpi; href: string }) {
  return (
    <Link
      to={href}
      className={[
        "group relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-color)] p-card shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]",
        kpi.tone === "success"
          ? "bg-[var(--status-success-soft)]/70"
          : kpi.tone === "warning"
            ? "bg-[var(--status-warning-soft)]/70"
            : kpi.tone === "danger"
              ? "bg-[var(--status-danger-soft)]/70"
              : kpi.tone === "info"
                ? "bg-[var(--status-info-soft)]/70"
                : "bg-[var(--surface-card)]",
      ].join(" ")}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${TONE_BAR[kpi.tone]}`} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-1.5">
        <p className="type-label text-[var(--text-secondary)]">{kpi.label}</p>
        <span
          className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[10px] font-bold ${TONE_SOFT[kpi.tone]}`}
        >
          ●
        </span>
      </div>
      <p className="mt-2 pl-1.5 font-display text-2xl font-semibold tabular-nums leading-none text-[var(--text-primary)] animate-count">
        {kpi.value}
      </p>
      <p className="mt-2 pl-1.5 type-caption text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]">
        {kpi.hint}
      </p>
    </Link>
  );
}

export function ManagementToday({
  flocks,
  farmScore,
  growthInsights,
  totalLive,
  mort7d,
  fcrLabel,
  overdueCount,
  companyHref,
  role,
}: {
  flocks: OpsBoardFlock[];
  farmScore: number | null;
  growthInsights: GrowthInsight[];
  totalLive: number;
  mort7d: number;
  fcrLabel: string;
  overdueCount: number;
  companyHref: (path: string) => string;
  role: string;
}) {
  const act = sortActForRole(buildActItems(flocks, growthInsights, companyHref), role);
  const tone = scoreTone(farmScore);
  const flockCount = flocks.length;
  const topFlocks = [...flocks]
    .sort((a, b) => Number(b.riskScore ?? 0) - Number(a.riskScore ?? 0) || Number(b.overdueRounds) - Number(a.overdueRounds))
    .slice(0, 6);

  const fcrTone: StatusTone =
    /insufficient|watch|warning|off/i.test(fcrLabel) && fcrLabel !== "On track"
      ? /insufficient/i.test(fcrLabel)
        ? "neutral"
        : "warning"
      : "success";

  const kpis: Kpi[] = [
    {
      label: "Farm health",
      value: farmScore != null ? `${farmScore}` : "—",
      to: "/farm/flocks",
      tone,
      hint: farmScore != null ? "out of 100" : "waiting on data",
    },
    {
      label: "Live birds",
      value: totalLive.toLocaleString(),
      to: "/farm/flocks",
      tone: "info",
      hint: flockCount === 0 ? "no active flocks" : `${flockCount} flock${flockCount === 1 ? "" : "s"}`,
    },
    {
      label: "7-day mortality",
      value: String(mort7d),
      to: "/farm/mortality",
      tone: mort7d > 0 ? "danger" : "success",
      hint: mort7d > 0 ? "review losses" : "steady",
    },
    {
      label: "FCR vs target",
      value: fcrLabel === "Insufficient data" ? "—" : fcrLabel,
      to: "/farm/slaughter",
      tone: fcrTone,
      hint: fcrLabel === "Insufficient data" ? "need weigh-ins" : "conversion",
    },
    {
      label: "Overdue",
      value: String(overdueCount),
      to: "/farm/checkin-review",
      tone: overdueCount > 0 ? "danger" : "success",
      hint: overdueCount > 0 ? "check-ins waiting" : "all caught up",
    },
  ];

  return (
    <div className="space-y-section animate-fade-up">
      {/* Farm pulse hero */}
      <section
        className={[
          "relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-color)] p-card shadow-[var(--shadow-card)]",
          "bg-[linear-gradient(135deg,var(--primary-color-soft)_0%,var(--surface-card)_48%,var(--status-info-soft)_100%)]",
        ].join(" ")}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--primary-color)]/10 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-[var(--status-info)]/10 blur-2xl"
          aria-hidden
        />

        <div className="relative flex flex-wrap items-center gap-card">
          <div
            className={[
              "flex h-[7.25rem] w-[7.25rem] shrink-0 flex-col items-center justify-center rounded-full border-4 bg-[var(--surface-card)] shadow-[var(--shadow-card)]",
              tone === "success"
                ? "border-[var(--status-success)]"
                : tone === "warning"
                  ? "border-[var(--status-warning)]"
                  : tone === "danger"
                    ? "border-[var(--status-danger)]"
                    : "border-[var(--border-color)]",
            ].join(" ")}
          >
            <p className="font-display text-3xl font-bold tabular-nums leading-none text-[var(--text-primary)]">
              {farmScore != null ? farmScore : "—"}
            </p>
            <p className="mt-1 type-caption text-[var(--text-muted)]">/ 100</p>
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="type-h2 text-[var(--text-primary)]">Farm pulse</h2>
              <StatusPill tone={tone}>
                {flockCount === 0 ? "Setup" : overdueCount > 0 ? "Action" : tone === "success" ? "Healthy" : tone === "warning" ? "Watch" : tone === "danger" ? "Critical" : "Warming up"}
              </StatusPill>
            </div>
            <p className="max-w-xl text-sm text-[var(--text-secondary)]">
              {scoreMessage(farmScore, flockCount, overdueCount)}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <StatusPill tone="info">{flockCount} flocks</StatusPill>
              <StatusPill tone="neutral">{totalLive.toLocaleString()} live</StatusPill>
              <Link
                to={`${companyHref("/dashboard/management")}?tab=trends`}
                className="text-xs font-semibold text-[var(--primary-color-dark)] hover:underline"
              >
                Open Trends →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* KPI mosaic */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <KpiTile key={kpi.label} kpi={kpi} href={companyHref(kpi.to)} />
        ))}
      </section>

      <div className="grid gap-section lg:grid-cols-5">
        {/* Act */}
        <section className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] lg:col-span-2">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)]/70 px-card py-stack">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Act</h2>
            <StatusPill tone={act.length ? "warning" : "success"}>
              {act.length ? `${act.length} open` : "Clear"}
            </StatusPill>
          </div>
          {act.length === 0 ? (
            <div className="flex flex-col items-start gap-2 bg-[var(--status-success-soft)]/40 px-card py-section">
              <p className="text-sm font-semibold text-[var(--status-success)]">Nothing overdue</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Farm is clear. Use Trends when you want deeper charts.
              </p>
            </div>
          ) : (
            <ul>
              {act.slice(0, 8).map((row) => {
                const kt = KIND_TONE[row.kind];
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)]/60 px-card py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0 flex items-start gap-2">
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TONE_BAR[kt]}`} aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{row.flock}</p>
                        <p className="type-caption text-[var(--text-secondary)]">
                          {row.reason} · {row.age}
                        </p>
                      </div>
                    </div>
                    <Link to={row.href}>
                      <Button size="xs" variant="secondary">
                        {row.cta}
                      </Button>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Flocks at a glance */}
        <section className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] lg:col-span-3">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)]/70 px-card py-stack">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Flocks at a glance</h2>
            <Link
              to={companyHref("/farm/flocks")}
              className="text-xs font-semibold text-[var(--primary-color-dark)] hover:underline"
            >
              All flocks
            </Link>
          </div>

          {topFlocks.length === 0 ? (
            <div className="relative overflow-hidden px-card py-section">
              <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,var(--primary-color-soft),transparent_55%),radial-gradient(circle_at_80%_60%,var(--status-info-soft),transparent_50%)]"
                aria-hidden
              />
              <div className="relative space-y-3">
                <p className="text-sm font-semibold text-[var(--text-primary)]">No active flocks yet</p>
                <p className="max-w-md text-xs text-[var(--text-secondary)]">
                  Today lights up with health, mortality, and FCR as soon as birds are on the ground.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link to={companyHref("/farm/flocks")}>
                    <Button size="sm" variant="primary">
                      Open flocks
                    </Button>
                  </Link>
                  <Link to={`${companyHref("/dashboard/management")}?tab=trends`}>
                    <Button size="sm" variant="secondary">
                      Browse Trends
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-2 p-card sm:grid-cols-2">
              {topFlocks.map((f) => {
                const rt = riskTone(Number(f.riskScore ?? 0));
                return (
                  <Link
                    key={f.flockId}
                    to={companyHref(`/farm/flocks/${encodeURIComponent(f.flockId)}`)}
                    className="rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-subtle)]/70 p-3 transition-colors hover:bg-[var(--primary-color-soft)]/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{f.label}</p>
                        <p className="type-caption text-[var(--text-muted)]">
                          {f.barn || "No barn"} · {f.ageDays}d
                        </p>
                      </div>
                      <StatusPill tone={rt}>Risk {Math.round(Number(f.riskScore ?? 0))}</StatusPill>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs tabular-nums text-[var(--text-secondary)]">
                      <span>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {Number(f.birdsLiveEstimate ?? 0).toLocaleString()}
                        </span>{" "}
                        live
                      </span>
                      <span>
                        Mort 7d{" "}
                        <span className="font-semibold text-[var(--text-primary)]">{f.mortality7d}</span>
                      </span>
                      <span>
                        FCR{" "}
                        <span className="font-semibold text-[var(--text-primary)]">
                          {f.latestFcr != null ? f.latestFcr.toFixed(2) : "—"}
                        </span>
                      </span>
                    </div>
                    {f.overdueRounds > 0 ? (
                      <p className="mt-2 text-[11px] font-semibold text-[var(--status-danger)]">
                        {f.overdueRounds} overdue check-in{f.overdueRounds === 1 ? "" : "s"}
                      </p>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
