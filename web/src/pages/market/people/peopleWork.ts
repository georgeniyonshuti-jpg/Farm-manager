export const RECRUITMENT_STAGES = [
  ["application", "Application"],
  ["contact", "Contact"],
  ["kyc", "KYC"],
  ["onboarded", "Onboarded"],
  ["closed", "Closed"],
] as const;

export const CONTACT_STATUSES = [
  ["call_scheduled", "Call scheduled"],
  ["called", "Called"],
  ["follow_up", "Follow-up needed"],
  ["unreachable", "Unreachable"],
] as const;

export const CLOSED_STATUSES = [
  ["not_a_fit", "Not a fit"],
  ["unreachable", "Unreachable"],
  ["duplicate", "Duplicate"],
] as const;

export const KYC_STATUSES = [
  ["docs_pending", "Docs pending"],
  ["docs_received", "Docs received"],
] as const;

const LEGACY_DESK: Record<string, { stage: string; status: string | null }> = {
  application: { stage: "application", status: null },
  new: { stage: "application", status: null },
  call_scheduled: { stage: "contact", status: "call_scheduled" },
  call_booked: { stage: "contact", status: "call_scheduled" },
  called: { stage: "contact", status: "called" },
  contacted: { stage: "contact", status: "called" },
  follow_up: { stage: "contact", status: "follow_up" },
  unreachable: { stage: "contact", status: "unreachable" },
  contact: { stage: "contact", status: null },
  kyc: { stage: "kyc", status: null },
  active: { stage: "onboarded", status: null },
  onboarded: { stage: "onboarded", status: null },
  not_a_fit: { stage: "closed", status: "not_a_fit" },
  duplicate: { stage: "closed", status: "duplicate" },
  closed: { stage: "closed", status: null },
};

export function deskPlacement(stage: string, status?: string | null) {
  const known = LEGACY_DESK[stage] || { stage, status: null };
  return { stage: known.stage, status: status || known.status || null };
}

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

export function personDeskMode(stage: string, status?: string | null): PersonDeskMode {
  const desk = deskPlacement(stage, status);
  if (desk.stage === "application") return "schedule";
  if (desk.stage === "contact" && desk.status === "call_scheduled") return "call";
  if (desk.stage === "contact" && desk.status === "called") return "decision";
  if (desk.stage === "contact" && desk.status === "follow_up") return "follow_up";
  if (desk.stage === "kyc") return "kyc";
  if (desk.stage === "onboarded") return "active";
  return "closed";
}

export const LIVE_SELLER_WARNING =
  "This phone is already a live seller. A coordinator keeps that account.";

/** Shown before a call when this phone already belongs to a live seller. Active rows are that account. */
export function liveSellerWarning(contact: { stage?: string | null; alreadyLive?: boolean | null } | null): string | null {
  const stage = contact ? deskPlacement(contact.stage || "").stage : "";
  if (!contact || stage === "onboarded" || !contact.alreadyLive) return null;
  return LIVE_SELLER_WARNING;
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

export type StageActionId =
  | "send_kyc"
  | "call_later"
  | "no_answer"
  | "not_a_fit"
  | "schedule"
  | "unreachable"
  | "reschedule"
  | "save_follow_up"
  | "try_again";

export type StageAction = {
  id: StageActionId;
  label: string;
  primary: boolean;
};

const ACTION_LABEL: Record<StageActionId, string> = {
  send_kyc: "Send to KYC",
  call_later: "Call later",
  no_answer: "No answer",
  not_a_fit: "Not a fit",
  schedule: "Schedule call",
  unreachable: "Unreachable",
  reschedule: "Reschedule",
  save_follow_up: "Save follow-up",
  try_again: "Try again",
};

/** The next moves that belong on this desk. The first one is the main button. */
export function stageActions(input: {
  mode: PersonDeskMode;
  stage?: string;
  status?: string | null;
  recordingNow?: boolean;
  outcome?: string;
}): StageAction[] {
  const ids = actionIds(input);
  return ids.map((id, index) => ({ id, label: ACTION_LABEL[id], primary: index === 0 }));
}

function actionIds(input: {
  mode: PersonDeskMode;
  stage?: string;
  status?: string | null;
  recordingNow?: boolean;
  outcome?: string;
}): StageActionId[] {
  if (input.mode === "schedule") {
    return input.recordingNow === false
      ? ["schedule", "not_a_fit"]
      : ["send_kyc", "call_later", "no_answer", "not_a_fit"];
  }
  if (input.mode === "call") {
    if (input.outcome === "no_answer") return ["no_answer", "unreachable"];
    if (input.outcome === "scheduled") return ["reschedule"];
    return ["send_kyc", "call_later", "not_a_fit"];
  }
  if (input.mode === "decision") return ["send_kyc", "call_later", "not_a_fit"];
  if (input.mode === "follow_up") return ["save_follow_up", "send_kyc", "not_a_fit", "unreachable"];
  if (input.mode === "kyc") return ["not_a_fit"];
  if (input.mode === "active") return ["save_follow_up"];
  const desk = deskPlacement(input.stage || "", input.status);
  if (desk.stage === "contact" && desk.status === "unreachable") return ["try_again"];
  return [];
}

export function approvalGaps(contact: {
  want: string;
  locationConfirmed?: boolean | null;
  ownsBroilers?: boolean | null;
  birdType?: string | null;
  quantityMin?: number | null;
  flockSize?: number | null;
  buyerFor?: string | null;
  willVisit?: boolean | null;
}) {
  const gaps: string[] = [];
  if (contact.locationConfirmed == null) gaps.push("Confirm whether the location is correct.");
  if (contact.want === "sell") {
    if (contact.ownsBroilers == null) gaps.push("Record whether they own broilers.");
    if (contact.ownsBroilers && !contact.birdType) gaps.push("Record the bird type.");
    if (contact.ownsBroilers && contact.quantityMin == null) gaps.push("Record how many birds they have.");
    if (contact.ownsBroilers && contact.flockSize == null) gaps.push("Record how many birds are in the flock.");
  }
  if (contact.want === "buy") {
    if (!contact.buyerFor) gaps.push("Record who they are buying for.");
    if (contact.quantityMin == null) gaps.push("Record how many birds they need in a normal week.");
  }
  if (contact.want === "scout") {
    if (contact.willVisit == null) gaps.push("Record whether they will visit farms.");
  }
  return gaps;
}

/** True when Send to KYC must wait. A draft answer counts; a blank draft keeps the stored one. */
export function kycSendBlocked(
  contact: {
    want: string;
    locationConfirmed?: boolean | null;
    ownsBroilers?: boolean | null;
    birdType?: string | null;
    quantityMin?: number | null;
    flockSize?: number | null;
    buyerFor?: string | null;
    willVisit?: boolean | null;
  },
  draft?: {
    locationConfirmed?: string;
    ownsBroilers?: string;
    birdType?: string;
    quantityMin?: string;
    flockSize?: string;
    buyerFor?: string;
    willVisit?: string;
  }
) {
  const locationConfirmed =
    draft?.locationConfirmed === "yes" ? true : draft?.locationConfirmed === "no" ? false : contact.locationConfirmed;
  const ownsBroilers = draft?.ownsBroilers === "yes" ? true : draft?.ownsBroilers === "no" ? false : contact.ownsBroilers;
  const birdType = draft?.birdType || contact.birdType || null;
  const draftedQuantity = draft?.quantityMin != null && draft.quantityMin !== "" ? Number(draft.quantityMin) : null;
  const quantityMin =
    draftedQuantity != null && Number.isInteger(draftedQuantity) && draftedQuantity >= 0
      ? draftedQuantity
      : contact.quantityMin;
  const draftedFlock = draft?.flockSize != null && draft.flockSize !== "" ? Number(draft.flockSize) : null;
  const flockSize =
    draftedFlock != null && Number.isInteger(draftedFlock) && draftedFlock >= 0 ? draftedFlock : contact.flockSize;
  const buyerFor = draft?.buyerFor ? draft.buyerFor : contact.buyerFor || null;
  const willVisit = draft?.willVisit === "yes" ? true : draft?.willVisit === "no" ? false : contact.willVisit;
  return approvalGaps({
    want: contact.want,
    locationConfirmed,
    ownsBroilers,
    birdType,
    quantityMin,
    flockSize,
    buyerFor,
    willVisit,
  }).length > 0;
}

export function contractBadgeLabel(row: { contractStatus?: string | null; kycContractStatus?: string | null }) {
  const labels: Record<string, string> = {
    not_sent: "Not sent",
    sent: "Contract sent",
    opened: "Opened",
    signed: "Signed, awaiting approval",
    approved: "Approved",
    rejected: "Rejected",
    expired: "Link expired",
  };
  if (row.contractStatus && labels[row.contractStatus]) return labels[row.contractStatus];
  if (row.kycContractStatus === "approved") return "Approved";
  if (row.kycContractStatus === "submitted") return "Needs the new link";
  if (row.kycContractStatus === "rejected") return "Rejected";
  return "Not sent";
}

export function stageLabel(stage: string) {
  const desk = deskPlacement(stage);
  return RECRUITMENT_STAGES.find((item) => item[0] === desk.stage)?.[1] || stage;
}

export function statusLabel(stage: string, status?: string | null) {
  const desk = deskPlacement(stage, status);
  if (desk.stage === "contact") return CONTACT_STATUSES.find((item) => item[0] === desk.status)?.[1] || null;
  if (desk.stage === "closed") return CLOSED_STATUSES.find((item) => item[0] === desk.status)?.[1] || null;
  return null;
}

export function kycDocsStatus(row: {
  stage?: string | null;
  kycContractStatus?: string | null;
  kycLocationStatus?: string | null;
  kycPaymentStatus?: string | null;
  kycIdentityStatus?: string | null;
}) {
  const received = [row.kycContractStatus, row.kycLocationStatus, row.kycPaymentStatus, row.kycIdentityStatus].some(
    (value) => value === "submitted" || value === "approved"
  );
  return received ? "docs_received" : "docs_pending";
}

export function cardStatus(row: {
  stage: string;
  deskStatus?: string | null;
  kycContractStatus?: string | null;
  kycLocationStatus?: string | null;
  kycPaymentStatus?: string | null;
  kycIdentityStatus?: string | null;
}) {
  const desk = deskPlacement(row.stage, row.deskStatus);
  if (desk.stage === "kyc") {
    const id = kycDocsStatus(row);
    return { id, label: KYC_STATUSES.find((item) => item[0] === id)?.[1] || id };
  }
  const label =
    desk.stage === "contact"
      ? CONTACT_STATUSES.find((item) => item[0] === desk.status)?.[1]
      : desk.stage === "closed"
        ? CLOSED_STATUSES.find((item) => item[0] === desk.status)?.[1]
        : null;
  return label ? { id: desk.status || "", label } : null;
}

/** The one badge a funnel card may show. Overdue and a waiting KYC come first. */
export function cardBadge(row: {
  stage: string;
  deskStatus?: string | null;
  overdue?: boolean | null;
  kycContractStatus?: string | null;
  kycLocationStatus?: string | null;
  kycPaymentStatus?: string | null;
  kycIdentityStatus?: string | null;
}): { id: string; label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" } | null {
  if (row.overdue) return { id: "overdue", label: "Call is overdue", tone: "warning" };
  if (kycWaiting(row)) return { id: "kyc_waiting", label: "KYC waiting for review", tone: "warning" };
  const status = cardStatus(row);
  if (!status) return null;
  const needsPerson = status.id === "not_a_fit" || status.id === "unreachable";
  return { id: status.id, label: status.label, tone: needsPerson ? "danger" : "neutral" };
}

export function statusTone(id: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (id === "unreachable" || id === "not_a_fit") return "danger";
  if (id === "duplicate" || id === "docs_pending" || id === "follow_up") return "warning";
  if (id === "docs_received" || id === "called") return "success";
  if (id === "call_scheduled") return "info";
  return "neutral";
}

/** Stages a superuser may send a person to. Onboarded stays on the KYC approval path. */
export function superuserStageChoices(currentStage: string): Array<(typeof RECRUITMENT_STAGES)[number]> {
  const current = deskPlacement(currentStage).stage;
  return RECRUITMENT_STAGES.filter(([value]) => value !== current && value !== "onboarded");
}

/** What the board should show before the server answers a call or a decision. */
export function predictDesk(
  stage: string,
  status: string | null | undefined,
  outcome: string,
  needsFollowUp?: boolean
) {
  const current = deskPlacement(stage, status);
  if (current.stage === "kyc" || current.stage === "onboarded" || current.stage === "closed") return current;
  if (outcome === "scheduled" && (current.stage === "application" || current.status === "called")) {
    return { stage: "contact", status: "call_scheduled" };
  }
  if (outcome === "reached" || outcome === "done") {
    return needsFollowUp
      ? { stage: "contact", status: "follow_up" }
      : { stage: "contact", status: "called" };
  }
  if (outcome === "no_answer" && current.status === "unreachable") return { stage: "application", status: null };
  return current;
}

export function predictDecision(decision: string, kycReady: boolean) {
  if (decision === "not_a_fit") return { stage: "closed", status: "not_a_fit" };
  if (decision === "unreachable") return { stage: "contact", status: "unreachable" };
  if (decision === "follow_up") return { stage: "contact", status: "follow_up" };
  if (decision === "approved") return kycReady ? { stage: "onboarded", status: null } : { stage: "kyc", status: null };
  return null;
}

export function statusesForStage(stage: string) {
  if (stage === "contact") return CONTACT_STATUSES;
  if (stage === "closed") return CLOSED_STATUSES;
  return [];
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
