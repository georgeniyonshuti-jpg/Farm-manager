import type { FieldFlockTriageRow } from "../../context/ActiveFlockContext";

export type FieldFlockTriageMode = "vet_visit" | "checkin";

/** Overdue always needs action; otherwise require today's visit/check-in for the mode. */
export function triageNeedsAction(row: FieldFlockTriageRow, mode: FieldFlockTriageMode): boolean {
  if (row.isOverdue) return true;
  return mode === "vet_visit" ? !row.visitDoneToday : !row.checkinDoneToday;
}

export function sortTriageRows(rows: FieldFlockTriageRow[]): FieldFlockTriageRow[] {
  return [...rows].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    if (a.isOverdue && b.isOverdue) return b.overdueMinutes - a.overdueMinutes;
    return new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime();
  });
}

/** Human overdue duration for field cards — never raw "1616m". */
export function formatOverdueMinutes(minutes: number): string {
  const m = Math.max(1, Math.floor(Number(minutes) || 0));
  if (m < 60) return `${m}m`;
  const days = Math.floor(m / (60 * 24));
  const hours = Math.floor((m % (60 * 24)) / 60);
  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  return `${hours}h`;
}
