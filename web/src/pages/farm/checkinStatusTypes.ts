export type CheckinBadge = "ok" | "upcoming" | "overdue";

export type CheckinStatus = {
  flockId: string;
  label: string;
  placementDate: string;
  ageDays: number;
  targetSlaughterDays: { min: number; max: number };
  intervalHours: number;
  intervalSource: string;
  lastCheckinAt: string | null;
  nextDueAt: string;
  overdueMs: number;
  isOverdue: boolean;
  checkinBadge: CheckinBadge;
  photosRequiredPerRound: number;
  bands: { untilDay: number; intervalHours: number }[];
  fcrCheckinHint?: { severity: string; message: string } | null;
  feedToDateKg?: number | null;
};
