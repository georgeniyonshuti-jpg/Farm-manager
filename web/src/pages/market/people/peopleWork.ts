export const RECRUITMENT_STAGES = [
  ["application", "Application"],
  ["call_scheduled", "Call scheduled"],
  ["called", "Called"],
  ["follow_up", "Follow-up needed"],
  ["kyc", "KYC"],
  ["unreachable", "Unreachable"],
  ["not_a_fit", "Not a fit"],
] as const;

export const PEOPLE_SORTS = [
  ["newest", "Newest"],
  ["name", "Name"],
  ["district", "District"],
  ["overdue", "Overdue first"],
] as const;

export const PEOPLE_WANTS = [
  ["sell", "Seller"],
  ["buy", "Buyer"],
  ["scout", "Scout"],
] as const;

export type PersonDeskMode = "schedule" | "call" | "decision" | "follow_up" | "kyc" | "active" | "closed";

export function personDeskMode(stage: string): PersonDeskMode {
  if (stage === "application") return "schedule";
  if (stage === "call_scheduled") return "call";
  if (stage === "called") return "decision";
  if (stage === "follow_up") return "follow_up";
  if (stage === "kyc") return "kyc";
  if (stage === "active") return "active";
  return "closed";
}

export function personDeskTitle(mode: PersonDeskMode) {
  if (mode === "schedule") return "Schedule the verification call";
  if (mode === "call") return "Record the verification call";
  if (mode === "decision") return "Decide after the call";
  if (mode === "follow_up") return "Follow up";
  if (mode === "kyc") return "Review the contract, place, payment, and ID";
  if (mode === "active") return "They are active";
  return "This application is closed";
}

export function approvalGaps(contact: {
  want: string;
  locationConfirmed?: boolean | null;
  ownsBroilers?: boolean | null;
  birdType?: string | null;
  quantityMin?: number | null;
}) {
  const gaps: string[] = [];
  if (contact.locationConfirmed == null) gaps.push("Confirm whether the location is correct.");
  if (contact.want === "sell") {
    if (contact.ownsBroilers == null) gaps.push("Record whether they own broilers.");
    if (contact.ownsBroilers && !contact.birdType) gaps.push("Record the bird type.");
    if (contact.ownsBroilers && contact.quantityMin == null) gaps.push("Record how many birds they have.");
  }
  return gaps;
}

export function stageLabel(stage: string) {
  if (stage === "active") return "Active";
  return RECRUITMENT_STAGES.find((item) => item[0] === stage)?.[1] || stage;
}

export function wantLabel(want: string) {
  return PEOPLE_WANTS.find((item) => item[0] === want)?.[1] || want;
}

export function roleBrief(want: string) {
  if (want === "buy") return "They applied to buy birds.";
  if (want === "scout") return "They applied to visit farms and list birds.";
  return "They applied to sell birds.";
}

export function kycWaiting(row: {
  kycContractStatus?: string | null;
  kycLocationStatus?: string | null;
  kycPaymentStatus?: string | null;
  kycIdentityStatus?: string | null;
}) {
  return [row.kycContractStatus, row.kycLocationStatus, row.kycPaymentStatus, row.kycIdentityStatus].includes("submitted");
}

export function listingState(row: { want: string; flockCount?: number | null; listedCount?: number | null }) {
  if (row.want !== "sell") return null;
  const flocks = Number(row.flockCount || 0);
  const listed = Number(row.listedCount || 0);
  if (flocks <= 0) return "No flock yet";
  if (listed <= 0) return "Flock not listed";
  return "Listed";
}
