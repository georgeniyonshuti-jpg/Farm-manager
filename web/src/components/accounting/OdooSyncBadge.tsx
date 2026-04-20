/**
 * OdooSyncBadge — shows accounting sync status in a compact badge.
 * Intentionally uses plain language so non-accountant managers understand it.
 */

type AccountingStatus =
  | "not_applicable"
  | "pending_approval"
  | "approved"
  | "sent_to_odoo"
  | "failed";

interface Props {
  status: AccountingStatus | string | null | undefined;
  odooMoveName?: string | null;
  compact?: boolean;
}

const LABELS: Record<AccountingStatus, string> = {
  not_applicable: "No accounting",
  pending_approval: "Awaiting approval",
  approved: "Approved — sending…",
  sent_to_odoo: "Sent to Odoo",
  failed: "Odoo sync failed",
};

const CLASSES: Record<AccountingStatus, string> = {
  not_applicable: "bg-gray-100 text-gray-500",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  sent_to_odoo: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
};

export function OdooSyncBadge({ status, odooMoveName, compact = false }: Props) {
  const s = (status ?? "not_applicable") as AccountingStatus;
  if (s === "not_applicable" && !odooMoveName) return null;
  const label = LABELS[s] ?? s;
  const cls = CLASSES[s] ?? "bg-gray-100 text-gray-500";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {s === "sent_to_odoo" && <span>✓</span>}
      {s === "failed" && <span>✗</span>}
      {s === "pending_approval" && <span>⏳</span>}
      {!compact && label}
      {s === "sent_to_odoo" && odooMoveName && (
        <span className="ml-1 font-mono opacity-70">{odooMoveName}</span>
      )}
    </span>
  );
}
