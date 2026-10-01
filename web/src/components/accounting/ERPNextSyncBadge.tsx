/**
 * ERPNextSyncBadge — compact sync status for farm operations → ERPNext.
 */

import { Link } from "react-router-dom";

export type ERPNextSyncState = "synced" | "pending" | "failed" | "none";

type Props = {
  state: ERPNextSyncState;
  reference?: string | null;
  compact?: boolean;
  href?: string;
};

const LABELS: Record<ERPNextSyncState, string> = {
  synced: "Synced",
  pending: "Pending",
  failed: "Failed",
  none: "—",
};

const TONE: Record<ERPNextSyncState, string> = {
  synced: "border-[var(--status-success)]/30 bg-[var(--status-success-soft)] text-[var(--status-success)]",
  pending: "border-[var(--status-warning)]/30 bg-[var(--status-warning-soft)] text-[var(--status-warning)]",
  failed: "border-[var(--status-danger)]/30 bg-[var(--status-danger-soft)] text-[var(--status-danger)]",
  none: "border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--text-muted)]",
};

export function ERPNextSyncBadge({ state, reference, compact = false, href }: Props) {
  if (state === "none" && !href) return null;

  const label = LABELS[state];
  const cls = `inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[state]}`;
  const body = (
    <>
      {state === "synced" && <span aria-hidden>✓</span>}
      {state === "failed" && <span aria-hidden>✗</span>}
      {state === "pending" && <span aria-hidden>○</span>}
      {!compact && <span>{label}</span>}
      {state === "synced" && reference ? (
        <span className="ml-0.5 font-mono opacity-70">{reference}</span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link to={href} className={`${cls} hover:opacity-90`} title={LABELS[state]}>
        {body}
      </Link>
    );
  }

  return (
    <span className={cls} title={LABELS[state]}>
      {body}
    </span>
  );
}
