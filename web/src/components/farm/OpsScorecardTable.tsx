import { Link } from "react-router-dom";
import {
  fcrStatusLabel,
  trendArrowLabel,
  type OpsBoardFlock,
} from "../../lib/dashboardAdapters";
import { DataTable, StatusPill, type DataColumn, type StatusTone } from "../ui";
import { useCompanyNav } from "../../hooks/useCompanyNav";

type Variant = "manager" | "vet";

type Props = {
  flocks: OpsBoardFlock[];
  loading?: boolean;
  variant?: Variant;
  allFlocksHref?: string;
  title?: string;
  subtitle?: string;
};

function fcrTone(status?: string | null): StatusTone {
  if (status === "on_track") return "success";
  if (status === "watch") return "warning";
  if (status === "warning") return "danger";
  return "neutral";
}

/** Shared growth scorecard for Management + Vet dashboards. */
export function OpsScorecardTable({
  flocks,
  loading = false,
  variant = "manager",
  allFlocksHref,
  title = "Growth scorecard",
  subtitle,
}: Props) {
  const { companyHref } = useCompanyNav();
  const href = allFlocksHref ?? companyHref("farm/flocks");
  const managerOnly = variant === "manager";

  const columns: DataColumn<OpsBoardFlock>[] = [
    {
      key: "flock",
      header: "Flock",
      render: (f) => (
        <Link
          to={`${companyHref(`farm/flocks/${f.flockId}`)}#weigh-in`}
          className="font-semibold text-[var(--text-primary)] hover:text-[var(--primary-color)]"
        >
          {f.label}
        </Link>
      ),
    },
    {
      key: "age",
      header: "Age",
      numeric: true,
      render: (f) => `${f.ageDays}d`,
    },
    {
      key: "wt",
      header: "Wt (kg)",
      numeric: true,
      render: (f) => (f.latestWeightKg != null ? Number(f.latestWeightKg).toFixed(2) : "—"),
    },
    {
      key: "wtDelta",
      header: "Wt Δ%",
      numeric: true,
      render: (f) => (
        <span className={(f.weightDeviationPct ?? 0) < -5 ? "text-[var(--status-danger)] font-semibold" : ""}>
          {f.weightDeviationPct != null
            ? `${f.weightDeviationPct >= 0 ? "+" : ""}${f.weightDeviationPct}%`
            : "—"}
        </span>
      ),
    },
    {
      key: "adg",
      header: "ADG g/d",
      numeric: true,
      render: (f) => f.adgGramsPerDay ?? "—",
    },
    {
      key: "lastWeigh",
      header: "Last weigh",
      numeric: true,
      defaultHidden: true,
      render: (f) => (f.daysSinceWeighIn != null ? `${f.daysSinceWeighIn}d` : "—"),
    },
    {
      key: "fcr",
      header: "FCR",
      numeric: true,
      render: (f) =>
        f.latestFcr != null ? (
          <span
            style={{
              color: f.latestFcr > f.expectedFcrRange.max ? "var(--status-danger)" : undefined,
            }}
          >
            {Number(f.latestFcr).toFixed(2)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "targetFcr",
      header: "Target FCR",
      numeric: true,
      defaultHidden: true,
      render: (f) => `${f.expectedFcrRange.min.toFixed(2)}–${f.expectedFcrRange.max.toFixed(2)}`,
    },
    {
      key: "status",
      header: "FCR status",
      badge: true,
      render: (f) => <StatusPill tone={fcrTone(f.fcrStatus)}>{fcrStatusLabel(f.fcrStatus)}</StatusPill>,
    },
    {
      key: "feed",
      header: "Feed (kg)",
      numeric: true,
      render: (f) => (f.feedToDateKg != null ? Number(f.feedToDateKg).toLocaleString() : "—"),
    },
    {
      key: "feedPerBird",
      header: "Feed/bird",
      numeric: true,
      defaultHidden: true,
      render: (f) => f.feedPerBirdKg ?? "—",
    },
    {
      key: "proj",
      header: "Proj. harvest",
      numeric: true,
      defaultHidden: true,
      render: (f) =>
        f.projections?.projectedHarvestWeightKg != null
          ? Number(f.projections.projectedHarvestWeightKg).toFixed(2)
          : "—",
    },
    {
      key: "trend",
      header: "Trend",
      defaultHidden: !managerOnly,
      render: (f) => (
        <span className="text-[var(--text-muted)] whitespace-nowrap">
          {trendArrowLabel(f.trends?.weight)} wt · {trendArrowLabel(f.trends?.fcr)} fcr
        </span>
      ),
    },
  ];

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-color)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] px-4 py-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{title}</p>
          {subtitle ? <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{subtitle}</p> : null}
        </div>
        <Link to={href} className="shrink-0 text-xs font-medium text-[var(--primary-color)] hover:underline">
          All flocks →
        </Link>
      </div>
      {loading ? (
        <div className="px-4 py-6 text-sm text-[var(--text-muted)]">Loading scorecard…</div>
      ) : (
        <DataTable<OpsBoardFlock>
          flush
          columnPicker
          columns={columns}
          rows={flocks}
          rowKey={(f) => f.flockId}
          emptyTitle="No active flocks"
          emptyDescription="Active flocks will appear here with weight and FCR."
          renderMobileCard={(f) => (
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-3">
              <div className="flex items-center justify-between gap-2">
                <Link
                  to={`${companyHref(`farm/flocks/${f.flockId}`)}#weigh-in`}
                  className="font-semibold text-sm text-[var(--text-primary)]"
                >
                  {f.label}
                </Link>
                <StatusPill tone={fcrTone(f.fcrStatus)}>{fcrStatusLabel(f.fcrStatus)}</StatusPill>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {f.ageDays}d · Wt {f.latestWeightKg != null ? Number(f.latestWeightKg).toFixed(2) : "—"} · FCR{" "}
                {f.latestFcr != null ? Number(f.latestFcr).toFixed(2) : "—"}
              </p>
            </div>
          )}
        />
      )}
    </div>
  );
}
