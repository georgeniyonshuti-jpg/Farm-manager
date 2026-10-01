export type OpsGlanceSummary = {
  activeFlockCount: number;
  checkinDoneTodayCount: number;
  feedLoggedTodayCount: number;
  vetLoggedRecentCount: number;
  vetRecentWindowDays: number;
  oldestMissing?: {
    checkin?: { flockId: string; label: string; hours: number } | null;
    feed?: { flockId: string; label: string; hours: number } | null;
    vet?: { flockId: string; label: string; days: number } | null;
  } | null;
  focus?: "checkin" | "feed" | "vet" | null;
};
