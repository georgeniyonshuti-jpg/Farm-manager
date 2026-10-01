import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../ui";
import { useLaborerT } from "../../i18n/laborerI18n";
import type { FieldFlockTriageRow } from "../../context/ActiveFlockContext";
import { useActiveFlock } from "../../context/ActiveFlockContext";
import { fieldRoute } from "../../lib/fieldRoutes";
import { useCompanyNav } from "../../hooks/useCompanyNav";
import {
  formatOverdueMinutes,
  sortTriageRows,
  triageNeedsAction,
  type FieldFlockTriageMode,
} from "./fieldFlockTriage";

export type { FieldFlockTriageMode };
export { sortTriageRows, triageNeedsAction, formatOverdueMinutes };

type Props = {
  rows: FieldFlockTriageRow[];
  mode: FieldFlockTriageMode;
  loading?: boolean;
};

export function FieldFlockTriageList({ rows, mode, loading }: Props) {
  const navigate = useNavigate();
  const { companyHref } = useCompanyNav();
  const { setActiveFlockId } = useActiveFlock();

  const tOverdue = useLaborerT("OVERDUE");
  const tDue = useLaborerT("Due");
  const tNext = useLaborerT("Next");
  const tStartVisit = useLaborerT("Start vet visit");
  const tStartRound = useLaborerT("Start round");
  const tFlocks = useLaborerT("flocks");
  const tVisitsDue = useLaborerT("visits due");
  const tRoundsDue = useLaborerT("rounds due");
  const tAllCaughtUp = useLaborerT("All visits complete for this round");
  const tAllRoundsDone = useLaborerT("All rounds complete for this shift");

  const sorted = useMemo(() => sortTriageRows(rows), [rows]);

  const overdueCount = sorted.filter((r) => r.isOverdue).length;
  const pendingCount = sorted.filter((r) => triageNeedsAction(r, mode)).length;
  const nextFlockId = useMemo(() => {
    const next = sorted.find((r) => triageNeedsAction(r, mode));
    return next?.flockId ?? null;
  }, [sorted, mode]);

  const ctaLabel = mode === "vet_visit" ? tStartVisit : tStartRound;
  const actionPath =
    mode === "vet_visit" ? "/farm/vet-logs?log=1&step=1" : "/farm/checkin?log=1&step=1";

  if (loading) return null;
  if (!sorted.length) return null;

  if (pendingCount === 0) {
    return (
      <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700">
        {mode === "vet_visit" ? tAllCaughtUp : tAllRoundsDone}
      </section>
    );
  }

  const summaryText =
    overdueCount > 0
      ? `${pendingCount} ${mode === "vet_visit" ? tVisitsDue : tRoundsDue} · ${overdueCount} ${tOverdue.toLowerCase()}`
      : `${pendingCount} ${mode === "vet_visit" ? tVisitsDue : tRoundsDue}`;

  return (
    <section className="space-y-3" aria-label="Flock queue">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{summaryText}</p>
        <span className="text-xs text-[var(--text-muted)]">
          {sorted.length} {tFlocks}
        </span>
      </div>
      <ul className="space-y-2">
        {sorted.map((row) => {
          const needsAction = triageNeedsAction(row, mode);
          const isNext = needsAction && row.flockId === nextFlockId;
          const statusLine = row.isOverdue
            ? `${tOverdue} · ${formatOverdueMinutes(row.overdueMinutes)}`
            : `${tDue} ${new Date(row.nextDueAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Africa/Kigali",
              })}`;
          return (
            <li
              key={row.flockId}
              className={[
                "min-h-[5.5rem] rounded-xl border bg-[var(--surface-card)] p-3 shadow-sm",
                isNext
                  ? "border-[var(--primary-color)]/50 ring-1 ring-[var(--primary-color)]/25"
                  : "border-[var(--border-color)]",
              ].join(" ")}
            >
              <div className="flex h-full flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {isNext ? (
                    <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--primary-color)]">
                      {tNext}
                    </p>
                  ) : null}
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{row.label}</p>
                  <p
                    className={`mt-0.5 text-xs ${row.isOverdue ? "font-semibold text-red-500" : "text-[var(--text-muted)]"}`}
                  >
                    {needsAction ? "" : "✓ "}
                    {statusLine}
                  </p>
                </div>
                {needsAction ? (
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 self-center"
                    onClick={() => {
                      setActiveFlockId(row.flockId);
                      navigate(companyHref(fieldRoute(actionPath, row.flockId)));
                    }}
                  >
                    {ctaLabel}
                  </Button>
                ) : (
                  <span className="shrink-0 self-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                    ✓
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
