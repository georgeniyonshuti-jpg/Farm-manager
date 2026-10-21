/** What the desk should do next. A row with no action stays off the page. */

export const FLOCK_STEPS = ["approve", "price", "visit", "post"] as const;
export type FlockStep = (typeof FLOCK_STEPS)[number];

export const FLOCK_STEP_LABEL: Record<FlockStep, string> = {
  approve: "Approve",
  price: "Price",
  visit: "Visit",
  post: "Post",
};

const OPEN_LOT = new Set(["open", "partial", "draft"]);
const PENDING = new Set(["pending", "pending_review"]);
const CALL_STAGES = new Set(["new", "contacted", "call_booked"]);

export type DeskLot = {
  id: string;
  status: string;
  verificationStatus?: string | null;
  listingPhase?: string | null;
};

export function flockStep(
  lot: DeskLot,
  opts: { verifyIds: ReadonlySet<string>; pricePublished: boolean }
): FlockStep | null {
  if (!OPEN_LOT.has(lot.status)) return null;
  if (lot.verificationStatus === "rejected") return null;
  if (lot.listingPhase === "live") return null;
  if (opts.verifyIds.has(lot.id) || PENDING.has(String(lot.verificationStatus || ""))) return "approve";
  if (!opts.pricePublished) return "price";
  if (lot.listingPhase === "weighed") return null;
  return "visit";
}

export function personNeedsCall(stage: string, hasAccount: boolean): boolean {
  if (!CALL_STAGES.has(stage)) return false;
  if (hasAccount) return false;
  return true;
}
