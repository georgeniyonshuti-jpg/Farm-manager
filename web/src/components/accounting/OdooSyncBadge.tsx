/**
 * OdooSyncBadge — shows accounting sync status in a compact badge.
 * Intentionally uses plain language so non-accountant managers understand it.
 *
 * Pass `approvalsHref` to render a clickable "Fix →" link next to the badge
 * when the status requires human action (failed, pending_approval, not_queued).
 */

type AccountingStatus =
  | "not_applicable"
  | "pending_approval"
  | "approved"
  | "queued_for_odoo"
  | "syncing_to_odoo"
  | "sent_to_odoo"
  | "failed";

interface Props {
  status: AccountingStatus | string | null | undefined;
  /** When set, refines the badge for rows joined to `odoo_sync_outbox` (overrides "Approved — sending…" confusion). */
  outboxStatus?: string | null;
  odooMoveName?: string | null;
  compact?: boolean;
  /** When provided and status needs action, shows a clickable link to the approvals page. */
  approvalsHref?: string;
}

const LABELS: Record<AccountingStatus, string> = {
  not_applicable: "No accounting",
  pending_approval: "Awaiting approval",
  approved: "Approved — sending…",
  queued_for_odoo: "Queued for Odoo",
  syncing_to_odoo: "Syncing to Odoo…",
  sent_to_odoo: "Sent to Odoo",
  failed: "Odoo sync failed",
};

const CLASSES: Record<AccountingStatus, string> = {
  not_applicable: "bg-gray-100 text-gray-500",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  queued_for_odoo: "bg-sky-100 text-sky-900",
  syncing_to_odoo: "bg-indigo-100 text-indigo-900",
  sent_to_odoo: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
};

const ACTION_NEEDED: (AccountingStatus | string)[] = ["pending_approval", "failed", "not_queued"];

/**
 * @param {string | null | undefined} outbox
 * @param {string | null | undefined} source
 */
function resolveOutboxDisplay(outbox: string | null | undefined, source: string | null | undefined): AccountingStatus {
  const o = String(outbox ?? "");
  if (o === "failed") return "failed";
  if (o === "sent") return "sent_to_odoo";
  if (o === "pending") return "queued_for_odoo";
  if (o === "processing") return "syncing_to_odoo";
  if (o === "cancelled") return "not_applicable";
  const src = String(source ?? "");
  if (o === "not_queued" || !o) {
    if (src === "pending_approval") return "pending_approval";
    return (source ? "approved" : "not_applicable") as AccountingStatus;
  }
  return "approved";
}

export function OdooSyncBadge({ status, outboxStatus, odooMoveName, compact = false, approvalsHref }: Props) {
  const base = (status ?? "not_applicable") as AccountingStatus;
  const s = outboxStatus != null && outboxStatus !== "" ? resolveOutboxDisplay(outboxStatus, base) : base;
  if (s === "not_applicable" && !odooMoveName) return null;
  const label = LABELS[s as AccountingStatus] ?? s;
  const cls = CLASSES[s as AccountingStatus] ?? "bg-gray-100 text-gray-500";
  const needsAction = ACTION_NEEDED.includes(s) && approvalsHref;

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
        {s === "sent_to_odoo" && <span>✓</span>}
        {s === "failed" && <span>✗</span>}
        {s === "pending_approval" && <span>⏳</span>}
        {s === "queued_for_odoo" && <span>○</span>}
        {s === "syncing_to_odoo" && <span>↻</span>}
        {!compact && label}
        {s === "sent_to_odoo" && odooMoveName && (
          <span className="ml-1 font-mono opacity-70">{odooMoveName}</span>
        )}
      </span>
      {needsAction && (
        <a
          href={approvalsHref}
          className="text-xs text-blue-600 hover:underline whitespace-nowrap"
        >
          Fix →
        </a>
      )}
    </span>
  );
}
