import { normalizeRwandaPhone, rwandaPhoneError } from "./rwandaPhone.js";
import { normalizePlace } from "./rwandaLocations.js";

/** Starter agreements. Replace the wording when legal text is ready. */
export const KYC_CONTRACTS = {
  sell: [
    "Seller agreement",
    "I am the person who keeps these birds, or I am allowed to sell them.",
    "The birds I offer are the type and number I state.",
    "I will keep the location and the mobile-money number I confirm up to date.",
    "Cleva may refuse a listing that does not match what I confirmed here.",
  ].join("\n\n"),
  buy: [
    "Buyer agreement",
    "I am buying birds for my own business.",
    "I will pay from the mobile-money number I confirm.",
    "I will take birds from the location I confirm, or arrange delivery as agreed.",
    "A reservation is not final until Cleva confirms it.",
  ].join("\n\n"),
  scout: [
    "Scout agreement",
    "I will visit farms in the area I confirm and record what I actually see.",
    "I will not invent a flock or a price.",
    "Commission is paid to the mobile-money number I confirm, after Cleva approves the work.",
    "Cleva can stop my access if a visit record is false.",
  ].join("\n\n"),
};

const TASKS = new Set(["contract", "location", "payment", "identity"]);

export function contractFor(want) {
  if (want === "buy" || want === "scout") return KYC_CONTRACTS[want];
  return KYC_CONTRACTS.sell;
}

export function kycClear(contact) {
  if (!contact) return false;
  return (
    contact.kycContractStatus === "approved" &&
    contact.kycLocationStatus === "approved" &&
    contact.kycPaymentStatus === "approved" &&
    contact.kycIdentityStatus === "approved"
  );
}

/** Call approval opens KYC. The account becomes Active only when KYC is already clear. */
export function stageAfterDecision(decision, contact) {
  if (decision === "not_a_fit" || decision === "unreachable") return decision;
  if (decision === "follow_up") return "follow_up";
  if (decision === "approved") return kycClear(contact) ? "active" : "kyc";
  return null;
}

/**
 * People already Active keep trading. Everyone else with a recruitment row waits.
 * No row means an older account that never entered recruitment.
 */
export function tradingAllowed(contact) {
  if (!contact) return { allow: true };
  if (contact.stage === "active") return { allow: true };
  if (contact.stage === "kyc") {
    return {
      allow: false,
      code: "kyc_required",
      error: "Sign the contract, confirm your location, confirm mobile money, and add your ID. Cleva still has to approve those.",
    };
  }
  return {
    allow: false,
    code: "not_ready",
    error: "Cleva has not marked you ready yet.",
  };
}

function clean(value, max) {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, max) : null;
}

function imageRef(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (s.length > 500000) return undefined;
  if (s.startsWith("data:image/") || s.startsWith("https://")) return s;
  return undefined;
}

export function validateKycTask(input = {}, contact = {}) {
  const task = String(input.task || "");
  if (!TASKS.has(task)) return { ok: false, error: "Choose a task." };
  const review = input.review ? String(input.review) : null;
  if (review && review !== "approved" && review !== "rejected") {
    return { ok: false, error: "Review must approve or reject." };
  }
  if (review === "rejected") {
    return { ok: true, task, review, status: "rejected" };
  }
  if (task === "contract") {
    const signatureUrl = imageRef(input.signatureUrl);
    if (signatureUrl === undefined) return { ok: false, error: "Draw a signature, or attach a signature image." };
    if (!signatureUrl) return { ok: false, error: "Draw a signature." };
    return {
      ok: true,
      task,
      review,
      status: review === "approved" ? "approved" : "submitted",
      signatureUrl,
      snapshot: contractFor(contact.want),
    };
  }
  if (task === "location") {
    const located = normalizePlace(input.district, input.sector, { required: true });
    if (!located.ok) return { ok: false, error: located.error };
    const place = clean(input.place, 200);
    if (!place) return { ok: false, error: "Add a short description of the place." };
    return {
      ok: true,
      task,
      review,
      status: review === "approved" ? "approved" : "submitted",
      district: located.district,
      sector: located.sector,
      place,
    };
  }
  if (task === "identity") {
    const idNumber = String(input.idNumber ?? "").replace(/[\s-]/g, "");
    if (!/^[A-Za-z0-9]{5,20}$/.test(idNumber)) return { ok: false, error: "Enter the ID number." };
    const photoUrl = imageRef(input.photoUrl);
    if (photoUrl === undefined) return { ok: false, error: "Upload a photo of the ID." };
    if (!photoUrl) return { ok: false, error: "Upload a photo of the ID." };
    return {
      ok: true,
      task,
      review,
      status: review === "approved" ? "approved" : "submitted",
      idNumber,
      photoUrl,
    };
  }
  const phoneError = rwandaPhoneError(input.momoPhone, { required: true });
  if (phoneError) return { ok: false, error: phoneError };
  const proofUrl = imageRef(input.proofUrl);
  if (proofUrl === undefined) return { ok: false, error: "Upload a screenshot of the mobile-money number." };
  if (!proofUrl) return { ok: false, error: "Upload a screenshot of the mobile-money number." };
  return {
    ok: true,
    task,
    review,
    status: review === "approved" ? "approved" : "submitted",
    momoPhone: normalizeRwandaPhone(input.momoPhone),
    proofUrl,
  };
}
