/**
 * ERPNextSyncBadge — compact sync status for farm operations → ERPNext.
 */

export type ERPNextSyncState = "synced" | "pending" | "failed" | "none";

type Props = {
  state: ERPNextSyncState;
  reference?: string | null;
  compact?: boolean;
};

const LABELS: Record<ERPNextSyncState, string> = {
  synced: "Synced to ERPNext",
  pending: "Sync pending",
  failed: "Sync failed",
  none: "Not synced",
};

const CLASSES: Record<ERPNextSyncState, string> = {
  synced: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-700",
  none: "bg-gray-100 text-gray-500",
};

export function ERPNextSyncBadge({ state, reference, compact = false }: Props) {
  const label = LABELS[state];
  const cls = CLASSES[state];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {state === "synced" && <span>✓</span>}
      {state === "failed" && <span>✗</span>}
      {state === "pending" && <span>○</span>}
      {!compact && label}
      {state === "synced" && reference && (
        <span className="ml-1 font-mono opacity-70">{reference}</span>
      )}
    </span>
  );
}

/** @deprecated use ERPNextSyncBadge */
export { ERPNextSyncBadge as OdooSyncBadge };
