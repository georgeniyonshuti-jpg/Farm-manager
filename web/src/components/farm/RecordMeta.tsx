import type { ReactNode } from "react";
import { StatusPill, type StatusTone } from "../ui/StatusPill";

type Props = {
  createdBy?: string | null;
  editedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastSynced?: string | null;
  approvalStatus?: string | null;
  source?: string | null;
  extra?: ReactNode;
  className?: string;
};

function fmt(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString(undefined, { timeZone: "Africa/Kigali" });
}

function approvalTone(status?: string | null): StatusTone {
  if (!status) return "neutral";
  if (status === "approved" || status === "active") return "success";
  if (status === "pending_review" || status === "pending") return "warning";
  if (status === "rejected" || status === "failed") return "danger";
  return "info";
}

/** Trust strip: who / when / sync / approval. */
export function RecordMeta({
  createdBy,
  editedBy,
  createdAt,
  updatedAt,
  lastSynced,
  approvalStatus,
  source,
  extra,
  className = "",
}: Props) {
  const bits: string[] = [];
  if (createdBy) bits.push(`Created by ${createdBy}`);
  if (editedBy) bits.push(`Edited by ${editedBy}`);
  const created = fmt(createdAt);
  const updated = fmt(updatedAt);
  if (created) bits.push(created);
  else if (updated) bits.push(`Updated ${updated}`);
  const synced = fmt(lastSynced);
  if (synced) bits.push(`Synced ${synced}`);
  if (source) bits.push(source);

  return (
    <div className={`flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)] ${className}`}>
      {approvalStatus ? <StatusPill tone={approvalTone(approvalStatus)}>{approvalStatus}</StatusPill> : null}
      {bits.length ? <span>{bits.join(" · ")}</span> : null}
      {extra}
    </div>
  );
}

/** Compact “Saved” indicator for forms after successful submit. */
export function SavedIndicator({ visible, label = "Saved" }: { visible: boolean; label?: string }) {
  if (!visible) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--status-success)]" role="status">
      ✓ {label}
    </span>
  );
}
