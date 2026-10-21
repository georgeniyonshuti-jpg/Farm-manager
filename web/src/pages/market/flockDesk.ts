export type FlockDeskStatus = "needs_review" | "verified" | "with_scout";

export function flockDeskStatus(row: {
  verificationStatus?: string | null;
  assignedScoutUserId?: string | null;
}): FlockDeskStatus | null {
  const status = row.verificationStatus || "verified";
  if (status === "rejected") return null;
  if (status === "pending" || status === "pending_review") return "needs_review";
  if (row.assignedScoutUserId) return "with_scout";
  return "verified";
}

export function flockStatusLabel(status: FlockDeskStatus): string {
  if (status === "needs_review") return "Needs review";
  if (status === "with_scout") return "With a scout";
  return "Verified";
}

export function placeLabel(row: { sector?: string | null; district?: string | null }): string {
  return [row.sector, row.district].filter(Boolean).join(", ") || "—";
}
