/**
 * Recruitment queue: one person per phone, before or after they have an account.
 * A seller here is not a public listing.
 */

import { toE164 } from "./crmBridge.js";
import { kycClear, stageAfterDecision, tradingAllowed, validateKycTask, contractFor } from "./kyc.js";
import { maskIdNumber } from "./sellerContractText.js";
import { patchPeopleOnboarding } from "./peopleOnboarding.js";
import { normalizePlace } from "./rwandaLocations.js";
import { rwandaPhoneError } from "./rwandaPhone.js";

export { contractFor, kycClear, stageAfterDecision, tradingAllowed, validateKycTask };

export const CONTACT_STAGES = ["application", "contact", "kyc", "onboarded", "closed"];
const CONTACT_STATUSES = new Set(["call_scheduled", "called", "follow_up", "unreachable"]);
const CLOSED_STATUSES = new Set(["not_a_fit", "unreachable", "duplicate"]);
/** Old stage names still accepted on input. They become a stage plus a status tag. */
const LEGACY_PLACEMENT = {
  new: ["application", null],
  application: ["application", null],
  contacted: ["contact", "called"],
  called: ["contact", "called"],
  call_booked: ["contact", "call_scheduled"],
  call_scheduled: ["contact", "call_scheduled"],
  follow_up: ["contact", "follow_up"],
  unreachable: ["contact", "unreachable"],
  contact: ["contact", null],
  kyc: ["kyc", null],
  active: ["onboarded", null],
  onboarded: ["onboarded", null],
  not_a_fit: ["closed", "not_a_fit"],
  duplicate: ["closed", "duplicate"],
  closed: ["closed", null],
};
const STAGE_RANK = {
  application: 0,
  contact: 1,
  kyc: 2,
  onboarded: 3,
};
const TERMINAL = new Set(["onboarded", "closed"]);
const BIRD_TYPES = new Set(["broiler", "hybrid", "layer", "other"]);
const BUYER_FOR = new Set(["butcher", "restaurant", "hotel", "vendor", "institution", "household"]);
const BIRD_FORMS = new Set(["slaughtered", "alive", "either"]);
const DECISIONS = new Set(["approved", "not_a_fit", "unreachable", "follow_up"]);
const SOURCES = new Set(["whatsapp", "signup", "market_form"]);
const TOUCH_KINDS = new Set(["call", "whatsapp", "note"]);
const TOUCH_OUTCOMES = new Set(["reached", "no_answer", "scheduled", "done"]);

export function wantFor(input) {
  const raw = String(input?.want || input?.accountType || "").trim().toLowerCase();
  if (raw === "buy" || raw === "buyer") return "buy";
  if (raw === "scout") return "scout";
  if (raw === "sell" || raw === "farmer" || raw === "seller") return "sell";
  return null;
}

export function normalizeContactInput(input = {}) {
  const phone = toE164(input.phone);
  if (!phone) return { ok: false, error: "A valid phone is required." };
  const want = wantFor(input) || "sell";
  const source = SOURCES.has(String(input.source || "")) ? String(input.source) : "whatsapp";
  const birds = input.birdCount ?? input.birds;
  const birdCount = birds == null || birds === "" ? null : Number(birds);
  if (birdCount != null && (!Number.isInteger(birdCount) || birdCount < 0)) {
    return { ok: false, error: "Bird count must be a whole number." };
  }
  return {
    ok: true,
    phone,
    want,
    source,
    name: clean(input.name || input.contactName, 200),
    district: clean(input.district, 80),
    sector: clean(input.sector, 80),
    birdCount,
    userId: input.userId ? String(input.userId) : null,
  };
}

/** Existing facts win. A later signup does not move the stage backwards or sideways. */
export function fieldsAfterUpsert(existing, incoming) {
  if (!existing) {
    return {
      name: incoming.name,
      district: incoming.district,
      sector: incoming.sector,
      birdCount: incoming.birdCount,
      want: incoming.want,
      stage: "application",
      source: incoming.source,
      userId: incoming.userId,
    };
  }
  return {
    name: existing.name || incoming.name || null,
    district: existing.district || incoming.district || null,
    sector: existing.sector || incoming.sector || null,
    birdCount: existing.birdCount ?? incoming.birdCount ?? null,
    want: existing.want || incoming.want,
    stage: existing.stage,
    source: existing.source || incoming.source,
    userId: existing.userId || incoming.userId || null,
  };
}

function statusAllowed(stage, status) {
  if (!status) return false;
  if (stage === "contact") return CONTACT_STATUSES.has(status);
  if (stage === "closed") return CLOSED_STATUSES.has(status);
  return false;
}

/** Stage plus the small status tag. Unknown input returns null. */
export function placementFor(stage, deskStatus) {
  const known = LEGACY_PLACEMENT[String(stage || "").trim()];
  if (!known) return null;
  const [nextStage, inferred] = known;
  const asked = deskStatus === undefined || deskStatus === null || deskStatus === "" ? inferred : String(deskStatus).trim();
  if (asked && !statusAllowed(nextStage, asked)) return null;
  return { stage: nextStage, deskStatus: asked || null };
}

export function canonicalStage(stage) {
  return placementFor(stage)?.stage || null;
}

/** Compatibility stage for people_onboarding, which still uses the older names. */
export function onboardingStageFor(stage, deskStatus) {
  const current = placementFor(stage, deskStatus) || { stage: "application", deskStatus: null };
  if (current.stage === "application") return "new";
  if (current.stage === "contact" && current.deskStatus === "call_scheduled") return "call_booked";
  if (current.stage === "contact" && current.deskStatus === "unreachable") return "unreachable";
  if (current.stage === "contact" || current.stage === "kyc") return "contacted";
  if (current.stage === "onboarded") return "active";
  if (current.deskStatus === "unreachable") return "unreachable";
  if (current.stage === "closed") return "not_a_fit";
  return "new";
}

export function nextStageAfterTouch(stage, outcome, answers = {}, deskStatus) {
  const current = placementFor(stage, deskStatus) || { stage: "application", deskStatus: null };
  if (current.stage === "kyc" || current.stage === "onboarded" || current.stage === "closed") return current;
  if (outcome === "scheduled" && (current.stage === "application" || current.deskStatus === "called")) {
    return { stage: "contact", deskStatus: "call_scheduled" };
  }
  if (outcome === "reached" || outcome === "done") {
    return answers.needsFollowUp
      ? { stage: "contact", deskStatus: "follow_up" }
      : { stage: "contact", deskStatus: "called" };
  }
  if (outcome === "no_answer" && current.deskStatus === "unreachable") {
    return { stage: "application", deskStatus: null };
  }
  return current;
}

/**
 * A different application starts the interview again.
 * Same type is a no-op. Name, phone, and place are left alone.
 */
export function applicationChange(currentWant, nextWant) {
  const want = wantFor({ want: nextWant });
  if (!want) return { ok: false, error: "Choose sell, buy, or scout." };
  if (wantFor({ want: currentWant }) === want) return { ok: true, changed: false, want };
  return { ok: true, changed: true, want, stage: "contact", deskStatus: "call_scheduled" };
}

const APPLICATION_RESET_SQL = [
  "stage = 'contact'",
  "desk_status = 'call_scheduled'",
  "decision = NULL",
  "decided_at = NULL",
  "decided_by = NULL",
  "bird_count = NULL",
  "owns_broilers = NULL",
  "bird_type = NULL",
  "quantity_min = NULL",
  "quantity_max = NULL",
  "can_slaughter = NULL",
  "can_deliver = NULL",
  "flock_size = NULL",
  "ready_in_weeks = NULL",
  "buyer_for = NULL",
  "bird_form = NULL",
  "delivery_required = NULL",
  "will_visit = NULL",
  "farms_known = NULL",
  "kyc_contract_status = 'missing'",
  "kyc_location_status = 'missing'",
  "kyc_payment_status = 'missing'",
  "kyc_identity_status = 'missing'",
];

/** A sales officer works the recruitment list. Live accounts and KYC clearance stay with the coordinator. */
export function salesOfficerActionAllowed(role, { stage, decision, contact, changingApplication } = {}) {
  if (role !== "sales_officer") return { ok: true };
  if (changingApplication) return { ok: true };
  if (canonicalStage(stage) === "onboarded" || canonicalStage(contact?.stage) === "onboarded") {
    return { ok: false, status: 403, error: "Onboarded people stay with the coordinator." };
  }
  if (decision === "approved" && kycClear(contact)) {
    return { ok: false, status: 403, error: "A coordinator approves a live account." };
  }
  return { ok: true };
}

export function areaContextSentence({ sector, district, verifiedFlocks, buyersNearby } = {}) {
  const place = String(sector || "").trim() ? "this sector" : String(district || "").trim() ? "this district" : "";
  if (!place) return null;
  const flocks = Number(verifiedFlocks) || 0;
  const buyers = Number(buyersNearby) || 0;
  const flockBit =
    flocks === 0
      ? `No verified flocks in ${place} yet.`
      : flocks === 1
        ? `1 verified flock already in ${place}.`
        : `${flocks} verified flocks already in ${place}.`;
  if (!buyers) return flockBit;
  const buyerBit = buyers === 1 ? "1 buyer nearby wants birds." : `${buyers} buyers nearby want birds.`;
  return `${flockBit} ${buyerBit}`;
}

export async function recruitmentAreaContext(dbQuery, contact) {
  const sector = String(contact?.sector || "").trim();
  const district = String(contact?.district || "").trim();
  if (!sector && !district) return { sentence: null };
  const flocks = await dbQuery(
    `SELECT COUNT(*)::int AS n
       FROM pipeline_lots l
      WHERE l.status IS DISTINCT FROM 'cancelled'
        AND COALESCE(l.verification_status, 'verified') = 'verified'
        AND l.assigned_scout_user_id IS NULL
        AND (
          ($1 <> '' AND lower(COALESCE(l.sector, '')) = lower($1))
          OR ($1 = '' AND lower(COALESCE(l.district, '')) = lower($2))
        )`,
    [sector, district]
  );
  const buyers = await dbQuery(
    `SELECT COUNT(*)::int AS n
       FROM pipeline_buyers b
      WHERE b.active = true
        AND (
          ($1 <> '' AND lower(COALESCE(b.sector, '')) = lower($1))
          OR ($2 <> '' AND lower(COALESCE(b.district, '')) = lower($2))
        )`,
    [sector, district]
  );
  return {
    sentence: areaContextSentence({
      sector,
      district,
      verifiedFlocks: flocks.rows[0]?.n || 0,
      buyersNearby: buyers.rows[0]?.n || 0,
    }),
  };
}

export function stageMoveAllowed(from, to, role) {
  const current = canonicalStage(from) || "application";
  const next = canonicalStage(to);
  if (!next) return { ok: false, error: "Unknown stage." };
  if (current === next) return { ok: true };
  if (next === "onboarded") {
    return { ok: false, error: "Onboarded starts when the contract, location, and payment are approved." };
  }
  if (next === "closed") return { ok: true };
  const back = (STAGE_RANK[next] ?? 0) < (STAGE_RANK[current] ?? 0);
  const leavingTerminal = TERMINAL.has(current) && !TERMINAL.has(next);
  if ((back || leavingTerminal) && role !== "superuser") {
    return { ok: false, error: "Only a superuser can move a person backwards." };
  }
  return { ok: true };
}

function boolOrNull(value) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function wholeOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

function choiceOrNull(value, allowed) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (!allowed.has(text)) return undefined;
  return text;
}

/** Structured verification answers. Role decides which facts are required before approval. */
export function normalizeCallAnswers(want, input = {}) {
  const answers = {
    locationConfirmed: boolOrNull(input.locationConfirmed),
    locationCorrected: clean(input.locationCorrected, 120),
    ownsBroilers: boolOrNull(input.ownsBroilers),
    birdType: BIRD_TYPES.has(String(input.birdType || "")) ? String(input.birdType) : null,
    quantityMin: wholeOrNull(input.quantityMin),
    quantityMax: wholeOrNull(input.quantityMax),
    canSlaughter: boolOrNull(input.canSlaughter),
    canDeliver: boolOrNull(input.canDeliver),
    flockSize: wholeOrNull(input.flockSize),
    readyInWeeks: wholeOrNull(input.readyInWeeks),
    buyerFor: choiceOrNull(input.buyerFor, BUYER_FOR),
    birdForm: choiceOrNull(input.birdForm, BIRD_FORMS),
    deliveryRequired: boolOrNull(input.deliveryRequired),
    willVisit: boolOrNull(input.willVisit),
    farmsKnown: wholeOrNull(input.farmsKnown),
    challenges: clean(input.challenges, 2000),
    nextAction: clean(input.nextAction, 400),
    needsFollowUp: input.needsFollowUp === true || input.needsFollowUp === "true",
  };
  if (answers.quantityMin === undefined || answers.quantityMax === undefined) {
    return { ok: false, error: "Quantities must be whole numbers." };
  }
  if (answers.flockSize === undefined) return { ok: false, error: "Flock size must be a whole number." };
  if (answers.readyInWeeks === undefined) return { ok: false, error: "Weeks until ready must be a whole number." };
  if (answers.readyInWeeks != null && answers.readyInWeeks > 8) {
    return { ok: false, error: "Weeks until ready must be between 0 and 8." };
  }
  if (answers.farmsKnown === undefined) return { ok: false, error: "Farms they know must be a whole number." };
  if (answers.buyerFor === undefined) return { ok: false, error: "Choose who they are buying for." };
  if (answers.birdForm === undefined) return { ok: false, error: "Choose how they want the birds." };
  if (answers.quantityMin != null && answers.quantityMax != null && answers.quantityMin > answers.quantityMax) {
    return { ok: false, error: "The smallest quantity cannot be above the largest." };
  }
  return { ok: true, want: wantFor({ want }) || "sell", answers };
}

export function approvalReady(contact) {
  if (!contact) return { ok: false, error: "Person not found." };
  if (contact.locationConfirmed == null) {
    return { ok: false, error: "Confirm whether the location is correct before approving." };
  }
  if (contact.want === "sell") {
    if (contact.ownsBroilers == null) return { ok: false, error: "Record whether they own broilers." };
    if (contact.ownsBroilers && !contact.birdType) return { ok: false, error: "Record the bird type." };
    if (contact.ownsBroilers && contact.quantityMin == null) {
      return { ok: false, error: "Record how many birds they have." };
    }
    if (contact.ownsBroilers && contact.flockSize == null) {
      return { ok: false, error: "Record how many birds are in the flock." };
    }
  }
  if (contact.want === "buy") {
    if (!contact.buyerFor) return { ok: false, error: "Record who they are buying for." };
    if (contact.quantityMin == null) return { ok: false, error: "Record how many birds they need in a normal week." };
  }
  if (contact.want === "scout") {
    if (contact.willVisit == null) return { ok: false, error: "Record whether they will visit farms." };
  }
  return { ok: true };
}

function clean(value, max) {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, max) : null;
}

/** Desk edits to name, phone, email, and place. Edited is true only when a value actually changes. */
export function profileChanges(current, patch) {
  const changes = {};
  let edited = false;
  if (patch.name !== undefined) {
    const name = clean(patch.name, 200);
    if (!name) return { ok: false, error: "Enter a name." };
    changes.name = name;
    if (name !== (current?.name || null)) edited = true;
  }
  if (patch.phone !== undefined) {
    const phoneError = rwandaPhoneError(patch.phone, { required: true });
    if (phoneError) return { ok: false, error: phoneError };
    const phone = toE164(patch.phone);
    if (!phone) return { ok: false, error: "Enter a Rwanda phone number." };
    changes.phone = phone;
    if (phone !== (current?.phone || null)) edited = true;
  }
  if (patch.email !== undefined) {
    const raw = clean(patch.email, 320);
    let email = null;
    if (raw) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return { ok: false, error: "Enter a valid email." };
      email = raw.toLowerCase();
    }
    changes.email = email;
    const previous = current?.email ? String(current.email).trim().toLowerCase() : null;
    if (email !== previous) edited = true;
  }
  if (patch.district !== undefined || patch.sector !== undefined) {
    const districtIn = patch.district !== undefined ? patch.district : current?.district;
    const sectorIn = patch.sector !== undefined ? patch.sector : current?.sector;
    const requireSector = patch.sector !== undefined && Boolean(String(districtIn || "").trim());
    const located = normalizePlace(districtIn, sectorIn, { sectorRequiredWithDistrict: requireSector });
    if (!located.ok) return { ok: false, error: located.error };
    changes.district = located.district;
    changes.sector = located.sector;
    if ((located.district || null) !== (current?.district || null) || (located.sector || null) !== (current?.sector || null)) {
      edited = true;
    }
  }
  return { ok: true, changes, edited };
}

function missingTable(err) {
  return String(err?.code || "") === "42P01" || /recruitment_contacts|recruitment_touches/i.test(String(err?.message || ""));
}

const CONTACT_SELECT = `
  SELECT c.id::text AS id,
         c.phone_e164 AS phone,
         c.contact_name AS name,
         c.email,
         c.details_edited_at AS "detailsEditedAt",
         c.district,
         c.sector,
         c.bird_count AS "birdCount",
         c.want,
         c.stage,
         c.desk_status AS "deskStatus",
         c.source,
         c.owner_user_id::text AS "ownerUserId",
         o.full_name AS "ownerName",
         c.next_call_at AS "nextCallAt",
         c.last_touch_at AS "lastTouchAt",
         c.user_id::text AS "userId",
         (c.user_id IS NOT NULL) AS "hasAccount",
         c.signed_up_at AS "signedUpAt",
         c.activated_at AS "activatedAt",
         c.location_confirmed AS "locationConfirmed",
         c.location_corrected AS "locationCorrected",
         c.owns_broilers AS "ownsBroilers",
         c.bird_type AS "birdType",
         c.quantity_min AS "quantityMin",
         c.quantity_max AS "quantityMax",
         c.can_slaughter AS "canSlaughter",
         c.can_deliver AS "canDeliver",
         c.flock_size AS "flockSize",
         c.ready_in_weeks AS "readyInWeeks",
         c.buyer_for AS "buyerFor",
         c.bird_form AS "birdForm",
         c.delivery_required AS "deliveryRequired",
         c.will_visit AS "willVisit",
         c.farms_known AS "farmsKnown",
         c.decision,
         c.decided_at AS "decidedAt",
         c.challenges,
         c.next_action AS "nextAction",
         c.kyc_contract_status AS "kycContractStatus",
         c.kyc_contract_snapshot AS "kycContractSnapshot",
         c.kyc_signature_url AS "kycSignatureUrl",
         c.kyc_signed_at AS "kycSignedAt",
         c.kyc_location_status AS "kycLocationStatus",
         c.kyc_place AS "kycPlace",
         c.kyc_payment_status AS "kycPaymentStatus",
         c.kyc_momo_phone AS "kycMomoPhone",
         c.kyc_payment_proof_url AS "kycPaymentProofUrl",
         c.kyc_identity_status AS "kycIdentityStatus",
         c.kyc_id_number AS "kycIdNumber",
         c.kyc_id_photo_url AS "kycIdPhotoUrl",
         c.created_at AS "createdAt",
         c.updated_at AS "updatedAt",
         (SELECT COUNT(*)::int FROM pipeline_lots l
            JOIN farm_profiles fp ON fp.id = l.farm_profile_id
           WHERE c.user_id IS NOT NULL AND fp.owner_user_id = c.user_id
             AND l.status <> 'cancelled') AS "flockCount",
         (SELECT COUNT(*)::int FROM pipeline_lots l
            JOIN farm_profiles fp ON fp.id = l.farm_profile_id
           WHERE c.user_id IS NOT NULL AND fp.owner_user_id = c.user_id
             AND l.status <> 'cancelled'
             AND COALESCE(l.verification_status, 'verified') = 'verified') AS "listedCount",
         (c.next_call_at IS NOT NULL AND c.next_call_at < now()
           AND c.stage NOT IN ('closed', 'onboarded')
           AND COALESCE(c.desk_status, '') <> 'unreachable') AS overdue,
         (SELECT COUNT(*)::int FROM recruitment_touches t
           WHERE t.contact_id = c.id AND t.kind = 'call') AS "callCount",
         (
           EXISTS (
             SELECT 1 FROM pipeline_lots l
               JOIN farm_profiles fp ON fp.id = l.farm_profile_id
              WHERE c.user_id IS NOT NULL
                AND fp.owner_user_id = c.user_id
                AND l.status <> 'cancelled'
                AND COALESCE(l.verification_status, 'verified') = 'verified'
           )
           OR EXISTS (
             SELECT 1 FROM farm_profiles fp
              WHERE fp.verification_status IN ('verified', 'pending')
                AND (
                  (c.user_id IS NOT NULL AND fp.owner_user_id = c.user_id)
                  OR regexp_replace(COALESCE(fp.contact_phone, ''), '[^0-9]', '', 'g') = ANY (ARRAY[
                    regexp_replace(c.phone_e164, '[^0-9]', '', 'g'),
                    CASE
                      WHEN regexp_replace(c.phone_e164, '[^0-9]', '', 'g') LIKE '250%'
                      THEN substring(regexp_replace(c.phone_e164, '[^0-9]', '', 'g') FROM 4)
                    END,
                    CASE
                      WHEN regexp_replace(c.phone_e164, '[^0-9]', '', 'g') LIKE '250%'
                      THEN '0' || substring(regexp_replace(c.phone_e164, '[^0-9]', '', 'g') FROM 4)
                    END
                  ])
                  OR regexp_replace(COALESCE(fp.contact_whatsapp, ''), '[^0-9]', '', 'g') = ANY (ARRAY[
                    regexp_replace(c.phone_e164, '[^0-9]', '', 'g'),
                    CASE
                      WHEN regexp_replace(c.phone_e164, '[^0-9]', '', 'g') LIKE '250%'
                      THEN substring(regexp_replace(c.phone_e164, '[^0-9]', '', 'g') FROM 4)
                    END,
                    CASE
                      WHEN regexp_replace(c.phone_e164, '[^0-9]', '', 'g') LIKE '250%'
                      THEN '0' || substring(regexp_replace(c.phone_e164, '[^0-9]', '', 'g') FROM 4)
                    END
                  ])
                )
           )
         ) AS "alreadyLive"
    FROM recruitment_contacts c
    LEFT JOIN users o ON o.id = c.owner_user_id
`;

export const LIVE_SELLER_WARNING =
  "This phone is already a live seller. A coordinator keeps that account.";

/** A sales officer must not add or change someone who is already Active. */
export function livePhoneBlocksOfficer(role, existing) {
  if (role !== "sales_officer") return { ok: true };
  if (canonicalStage(existing?.stage) === "onboarded") {
    return { ok: false, status: 409, error: LIVE_SELLER_WARNING };
  }
  return { ok: true };
}

export async function upsertRecruitmentContact(dbQuery, input, actor = {}) {
  const norm = normalizeContactInput(input);
  if (!norm.ok) return norm;
  try {
    if (actor.role === "sales_officer") {
      const prior = await dbQuery(
        `SELECT stage FROM recruitment_contacts WHERE phone_e164 = $1`,
        [norm.phone]
      );
      const held = livePhoneBlocksOfficer(actor.role, prior.rows[0]);
      if (!held.ok) return held;
    }
    const r = await dbQuery(
      `INSERT INTO recruitment_contacts (
         phone_e164, contact_name, district, sector, bird_count, want, source, user_id, signed_up_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid, CASE WHEN $8::uuid IS NULL THEN NULL ELSE now() END)
       ON CONFLICT (phone_e164) DO UPDATE SET
         contact_name = COALESCE(NULLIF(recruitment_contacts.contact_name, ''), EXCLUDED.contact_name),
         district = COALESCE(NULLIF(recruitment_contacts.district, ''), EXCLUDED.district),
         sector = COALESCE(NULLIF(recruitment_contacts.sector, ''), EXCLUDED.sector),
         bird_count = COALESCE(recruitment_contacts.bird_count, EXCLUDED.bird_count),
         user_id = COALESCE(recruitment_contacts.user_id, EXCLUDED.user_id),
         signed_up_at = COALESCE(
           recruitment_contacts.signed_up_at,
           CASE WHEN EXCLUDED.user_id IS NOT NULL THEN now() ELSE NULL END
         ),
         updated_at = now()
       RETURNING id::text AS id`,
      [norm.phone, norm.name, norm.district, norm.sector, norm.birdCount, norm.want, norm.source, norm.userId]
    );
    return { ok: true, id: r.rows[0]?.id };
  } catch (e) {
    if (missingTable(e)) return { ok: false, missing: true, error: "Recruitment queue is not ready." };
    if (String(e?.code) === "23505") return { ok: true, linkedElsewhere: true };
    return { ok: false, error: e instanceof Error ? e.message : "Could not save contact." };
  }
}

export async function listRecruitmentQueue(dbQuery, filters = {}) {
  const where = [];
  const params = [];
  const lane = filters.lane === "active" ? "active" : filters.lane === "recruitment" ? "recruitment" : "";
  if (lane === "active") {
    where.push(`c.stage = 'onboarded'`);
  }
  const stage = filters.stage ? canonicalStage(filters.stage) : "";
  if (filters.stage && !stage) {
    return { ok: false, error: "Unknown stage." };
  }
  if (stage) {
    params.push(stage);
    where.push(`c.stage = $${params.length}`);
  }
  if (filters.want && ["sell", "buy", "scout"].includes(String(filters.want))) {
    params.push(String(filters.want));
    where.push(`c.want = $${params.length}`);
  }
  if (filters.owner === "unassigned") {
    where.push(`c.owner_user_id IS NULL`);
  } else if (filters.owner && filters.owner !== "all") {
    params.push(String(filters.owner));
    where.push(`c.owner_user_id = $${params.length}::uuid`);
  }
  if (filters.overdue) {
    where.push(`c.next_call_at IS NOT NULL AND c.next_call_at < now() AND c.stage NOT IN ('closed', 'onboarded') AND COALESCE(c.desk_status, '') <> 'unreachable'`);
  }
  if (filters.deskStatus && (CONTACT_STATUSES.has(String(filters.deskStatus)) || CLOSED_STATUSES.has(String(filters.deskStatus)))) {
    params.push(String(filters.deskStatus));
    where.push(`c.desk_status = $${params.length}`);
  }
  if (filters.district) {
    params.push(String(filters.district).trim().slice(0, 80));
    where.push(`c.district = $${params.length}`);
  }
  const docsReceived = `(c.kyc_contract_status IN ('submitted', 'approved') OR c.kyc_location_status IN ('submitted', 'approved') OR c.kyc_payment_status IN ('submitted', 'approved') OR c.kyc_identity_status IN ('submitted', 'approved'))`;
  if (filters.kyc === "review") {
    where.push(`(c.kyc_contract_status = 'submitted' OR c.kyc_location_status = 'submitted' OR c.kyc_payment_status = 'submitted' OR c.kyc_identity_status = 'submitted')`);
  } else if (filters.kyc === "docs_received") {
    where.push(`c.stage = 'kyc' AND ${docsReceived}`);
  } else if (filters.kyc === "docs_pending") {
    where.push(`c.stage = 'kyc' AND NOT ${docsReceived}`);
  }
  if (filters.q) {
    params.push(`%${String(filters.q).trim().slice(0, 80)}%`);
    where.push(`(c.contact_name ILIKE $${params.length} OR c.phone_e164 ILIKE $${params.length} OR c.district ILIKE $${params.length})`);
  }
  const orderBy = {
    name: "c.contact_name ASC NULLS LAST, c.updated_at DESC",
    district: "c.district ASC NULLS LAST, c.contact_name ASC NULLS LAST",
    overdue: "overdue DESC, c.next_call_at ASC NULLS LAST",
    newest: "c.updated_at DESC",
  }[String(filters.sort || "")] || "overdue DESC, c.updated_at DESC";
  const sql = `${CONTACT_SELECT}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ${orderBy}
    LIMIT 200`;
  try {
    const [rows, owners, byOwner, trend] = await Promise.all([
      dbQuery(sql, params),
      dbQuery(
        `SELECT id::text AS id, COALESCE(NULLIF(full_name, ''), email) AS name
           FROM users
          WHERE role IN ('superuser', 'sales_coordinator', 'sales_officer')
          ORDER BY 2`
      ),
      dbQuery(
        `SELECT owner_user_id::text AS "ownerUserId",
                COUNT(*) FILTER (WHERE stage IN ('application', 'contact') AND COALESCE(desk_status, '') <> 'unreachable')::int AS open,
                COUNT(*) FILTER (
                  WHERE next_call_at IS NOT NULL AND next_call_at < now()
                    AND stage NOT IN ('closed', 'onboarded')
                    AND COALESCE(desk_status, '') <> 'unreachable'
                )::int AS overdue,
                COUNT(*) FILTER (
                  WHERE signed_up_at >= now() - ($1::int * interval '1 day')
                )::int AS "signedUp"
           FROM recruitment_contacts
          GROUP BY owner_user_id`,
        [Math.min(Math.max(Number(filters.days) || 7, 1), 90)]
      ),
      dbQuery(
        `SELECT d::date AS day,
                (SELECT COUNT(*)::int FROM recruitment_contacts WHERE created_at::date = d::date) AS "newContacts",
                (SELECT COUNT(*)::int FROM recruitment_contacts WHERE signed_up_at::date = d::date) AS signups,
                (SELECT COUNT(*)::int FROM recruitment_contacts WHERE activated_at::date = d::date) AS activated
           FROM generate_series(
                  (current_date - ($1::int - 1))::timestamp,
                  current_date::timestamp,
                  interval '1 day'
                ) d
          ORDER BY d`,
        [Math.min(Math.max(Number(filters.days) || 7, 1), 90)]
      ),
    ]);
    const counts = new Map(byOwner.rows.map((r) => [r.ownerUserId || "unassigned", r]));
    const ownerLines = owners.rows.map((o) => ({
      id: o.id,
      name: o.name,
      open: Number(counts.get(o.id)?.open || 0),
      overdue: Number(counts.get(o.id)?.overdue || 0),
      signedUp: Number(counts.get(o.id)?.signedUp || 0),
    }));
    const unassigned = counts.get("unassigned");
    if (unassigned) {
      ownerLines.unshift({
        id: null,
        name: "Unassigned",
        open: Number(unassigned.open || 0),
        overdue: Number(unassigned.overdue || 0),
        signedUp: Number(unassigned.signedUp || 0),
      });
    }
    const badges = await latestContractStatuses(dbQuery, rows.rows.map((row) => row.id));
    return {
      ok: true,
      contacts: rows.rows.map((row) => presentQueueContact(row, badges.get(row.id))),
      owners: ownerLines,
      trend: trend.rows.map((r) => ({
        day: r.day,
        newContacts: Number(r.newContacts || 0),
        signups: Number(r.signups || 0),
        activated: Number(r.activated || 0),
      })),
    };
  } catch (e) {
    if (missingTable(e)) return { ok: true, contacts: [], owners: [], trend: [], missing: true };
    return { ok: false, error: e instanceof Error ? e.message : "Could not load the queue." };
  }
}

async function latestContractStatuses(dbQuery, ids) {
  if (!ids.length) return new Map();
  try {
    const r = await dbQuery(
      `SELECT DISTINCT ON (contact_id) contact_id::text AS id, status
         FROM seller_contracts
        WHERE contact_id = ANY($1::uuid[])
        ORDER BY contact_id, created_at DESC`,
      [ids]
    );
    return new Map(r.rows.map((row) => [row.id, row.status]));
  } catch (e) {
    if (String(e?.code) === "42P01") return new Map();
    throw e;
  }
}

function presentQueueContact(row, contractStatus) {
  return {
    ...row,
    kycIdNumber: maskIdNumber(row.kycIdNumber),
    kycSignatureUrl: null,
    kycIdPhotoUrl: null,
    kycPaymentProofUrl: null,
    kycContractSnapshot: null,
    contractStatus: contractStatus || null,
  };
}

async function loadContact(dbQuery, id) {
  const r = await dbQuery(`${CONTACT_SELECT} WHERE c.id = $1::uuid`, [id]);
  return r.rows[0] || null;
}

export async function getRecruitmentContact(dbQuery, id) {
  try {
    const contact = await loadContact(dbQuery, id);
    if (!contact) return { ok: false, status: 404, error: "Person not found." };
    const touches = await dbQuery(
      `SELECT t.id::text AS id, t.kind, t.outcome, t.note, t.answers_json AS answers,
              t.challenges, t.next_action AS "nextAction", t.scheduled_for AS "scheduledFor",
              t.created_at AS "createdAt",
              COALESCE(NULLIF(u.full_name, ''), u.email) AS "byName"
         FROM recruitment_touches t
         LEFT JOIN users u ON u.id = t.by_user_id
        WHERE t.contact_id = $1::uuid
        ORDER BY t.created_at DESC
        LIMIT 30`,
      [id]
    );
    const badges = await latestContractStatuses(dbQuery, [contact.id]);
    return { ok: true, contact: { ...withContract(contact), contractStatus: badges.get(contact.id) || null }, touches: touches.rows };
  } catch (e) {
    if (missingTable(e)) return { ok: false, status: 404, error: "Person not found." };
    return { ok: false, status: 500, error: e instanceof Error ? e.message : "Could not load person." };
  }
}

async function assertDeskOwner(dbQuery, ownerUserId) {
  if (!ownerUserId) return { ok: true, ownerUserId: null };
  const r = await dbQuery(
    `SELECT id::text AS id FROM users
      WHERE id = $1::uuid AND role IN ('superuser', 'sales_coordinator', 'sales_officer')`,
    [ownerUserId]
  );
  if (!r.rows[0]) return { ok: false, status: 400, error: "Owner must be a desk person." };
  return { ok: true, ownerUserId };
}

async function syncLinkedOnboarding(dbQuery, contact) {
  if (!contact?.userId) return;
  await patchPeopleOnboarding(dbQuery, contact.userId, {
    stage: onboardingStageFor(contact.stage, contact.deskStatus),
    ownerUserId: contact.ownerUserId,
    nextCallAt: contact.nextCallAt,
  });
}

export async function patchRecruitmentContact(dbQuery, id, patch, role) {
  const sets = [];
  const params = [];
  let i = 1;
  const profileKeys = ["name", "phone", "email", "district", "sector"];
  const officer = role === "sales_officer";
  const needsCurrent = officer || patch.stage !== undefined || patch.want !== undefined || profileKeys.some((key) => patch[key] !== undefined);
  const current = needsCurrent ? await loadContact(dbQuery, id) : null;
  if (needsCurrent && !current) return { ok: false, status: 404, error: "Person not found." };
  const application = patch.want !== undefined ? applicationChange(current?.want, patch.want) : null;
  if (application && !application.ok) return { ok: false, status: 400, error: application.error };
  if (application && !application.changed && Object.keys(patch).every((key) => key === "want")) {
    return { ok: true, contact: withContract(current) };
  }
  const held = salesOfficerActionAllowed(role, {
    stage: current?.stage,
    contact: current,
    changingApplication: Boolean(application?.changed),
  });
  if (!held.ok) return held;
  const profile = profileKeys.some((key) => patch[key] !== undefined) ? profileChanges(current, patch) : null;
  if (profile && !profile.ok) return { ok: false, status: 400, error: profile.error };
  if (profile?.changes.name !== undefined) {
    sets.push(`contact_name = $${i++}`);
    params.push(profile.changes.name);
  }
  if (profile?.changes.phone !== undefined) {
    sets.push(`phone_e164 = $${i++}`);
    params.push(profile.changes.phone);
  }
  if (profile?.changes.email !== undefined) {
    sets.push(`email = $${i++}`);
    params.push(profile.changes.email);
  }
  if (profile?.changes.district !== undefined || profile?.changes.sector !== undefined) {
    sets.push(`district = $${i++}`);
    params.push(profile.changes.district ?? null);
    sets.push(`sector = $${i++}`);
    params.push(profile.changes.sector ?? null);
  }
  if (profile?.edited) sets.push("details_edited_at = now()");
  if (!application?.changed && (patch.birdCount !== undefined || patch.birds !== undefined)) {
    const birds = patch.birdCount ?? patch.birds;
    const n = birds == null || birds === "" ? null : Number(birds);
    if (n != null && (!Number.isInteger(n) || n < 0)) {
      return { ok: false, status: 400, error: "Bird count must be a whole number." };
    }
    sets.push(`bird_count = $${i++}`);
    params.push(n);
  }
  if (application?.changed) {
    sets.push(`want = $${i++}`);
    params.push(application.want);
    sets.push(...APPLICATION_RESET_SQL);
  }
  if (!application?.changed && (patch.stage !== undefined || patch.deskStatus !== undefined)) {
    const placed = placementFor(
      patch.stage !== undefined ? patch.stage : current.stage,
      patch.deskStatus !== undefined ? patch.deskStatus : undefined
    );
    if (!placed) return { ok: false, status: 400, error: "Unknown stage." };
    let deskStatus = placed.deskStatus;
    if ((placed.stage === "contact" || placed.stage === "closed") && !deskStatus) {
      if (canonicalStage(current.stage) === placed.stage && current.deskStatus) deskStatus = current.deskStatus;
      else return { ok: false, status: 400, error: "Choose a status for this stage." };
    }
    const move = stageMoveAllowed(current.stage, placed.stage, role);
    if (!move.ok) return { ok: false, status: 400, error: move.error };
    sets.push(`stage = $${i++}`);
    params.push(placed.stage);
    sets.push(`desk_status = $${i++}`);
    params.push(deskStatus);
    if (role === "superuser") {
      const decision = deskStatus === "not_a_fit" || deskStatus === "unreachable" ? deskStatus : null;
      sets.push(`decision = $${i++}`);
      params.push(decision);
      sets.push(decision ? "decided_at = now()" : "decided_at = NULL");
      sets.push("decided_by = NULL");
    }
  }
  if (patch.ownerUserId !== undefined) {
    const owner = await assertDeskOwner(dbQuery, patch.ownerUserId || null);
    if (!owner.ok) return owner;
    sets.push(`owner_user_id = $${i++}::uuid`);
    params.push(owner.ownerUserId);
  }
  if (patch.nextCallAt !== undefined) {
    sets.push(`next_call_at = $${i++}::timestamptz`);
    params.push(patch.nextCallAt || null);
  }
  if (!sets.length) return { ok: false, status: 400, error: "Nothing to update." };
  sets.push("updated_at = now()");
  params.push(id);
  try {
    const r = await dbQuery(
      `UPDATE recruitment_contacts SET ${sets.join(", ")}
        WHERE id = $${i}::uuid
        RETURNING id::text AS id`,
      params
    );
    if (!r.rows[0]) return { ok: false, status: 404, error: "Person not found." };
    const contact = await loadContact(dbQuery, id);
    await syncLinkedOnboarding(dbQuery, contact);
    return { ok: true, contact: withContract(contact) };
  } catch (e) {
    if (String(e?.code) === "23505") {
      return { ok: false, status: 400, error: "That phone is already on another person." };
    }
    return { ok: false, status: 500, error: e instanceof Error ? e.message : "Could not update person." };
  }
}

export async function addRecruitmentTouch(dbQuery, id, input) {
  const kind = String(input.kind || "").trim();
  if (!TOUCH_KINDS.has(kind)) return { ok: false, status: 400, error: "Invalid touch." };
  const outcome = input.outcome ? String(input.outcome) : null;
  if (outcome && !TOUCH_OUTCOMES.has(outcome)) {
    return { ok: false, status: 400, error: "Invalid outcome." };
  }
  const parsed = normalizeCallAnswers(input.want, input);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const key = clean(input.idempotencyKey, 80);
  try {
    if (key) {
      const prior = await dbQuery(
        `SELECT id FROM recruitment_touches WHERE contact_id = $1::uuid AND idempotency_key = $2`,
        [id, key]
      );
      if (prior.rows[0]) {
        const contact = await loadContact(dbQuery, id);
        return contact ? { ok: true, contact, duplicate: true } : { ok: false, status: 404, error: "Person not found." };
      }
    }
    const current = await loadContact(dbQuery, id);
    if (!current) return { ok: false, status: 404, error: "Person not found." };
    const held = salesOfficerActionAllowed(input.role, { stage: current.stage, contact: current });
    if (!held.ok) return held;
    const answers = parsed.answers;
    await dbQuery(
      `INSERT INTO recruitment_touches (
         contact_id, kind, outcome, note, by_user_id, answers_json, challenges, next_action, scheduled_for, idempotency_key
       ) VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6::jsonb, $7, $8, $9::timestamptz, $10)`,
      [
        id,
        kind,
        outcome,
        clean(input.note, 2000),
        input.byUserId || null,
        JSON.stringify(answers),
        answers.challenges,
        answers.nextAction,
        input.scheduledFor || null,
        key,
      ]
    );
    const nextPlace = nextStageAfterTouch(current.stage, outcome, answers, current.deskStatus);
    const nextCall = input.scheduledFor || (outcome === "scheduled" ? current.nextCallAt : current.nextCallAt);
    const district = answers.locationCorrected || current.district;
    await dbQuery(
      `UPDATE recruitment_contacts
          SET stage = $2,
              desk_status = $22,
              next_call_at = $3::timestamptz,
              last_touch_at = now(),
              district = COALESCE($4, district),
              location_confirmed = COALESCE($5, location_confirmed),
              location_corrected = COALESCE($6, location_corrected),
              owns_broilers = COALESCE($7, owns_broilers),
              bird_type = COALESCE($8, bird_type),
              quantity_min = COALESCE($9, quantity_min),
              quantity_max = COALESCE($10, quantity_max),
              can_slaughter = COALESCE($11, can_slaughter),
              can_deliver = COALESCE($12, can_deliver),
              challenges = COALESCE($13, challenges),
              next_action = COALESCE($14, next_action),
              flock_size = COALESCE($15, flock_size),
              ready_in_weeks = COALESCE($16, ready_in_weeks),
              buyer_for = COALESCE($17, buyer_for),
              bird_form = COALESCE($18, bird_form),
              delivery_required = COALESCE($19, delivery_required),
              will_visit = COALESCE($20, will_visit),
              farms_known = COALESCE($21, farms_known),
              updated_at = now()
        WHERE id = $1::uuid`,
      [
        id,
        nextPlace.stage,
        input.scheduledFor || nextCall,
        district,
        answers.locationConfirmed,
        answers.locationCorrected,
        answers.ownsBroilers,
        answers.birdType,
        answers.quantityMin,
        answers.quantityMax,
        answers.canSlaughter,
        answers.canDeliver,
        answers.challenges,
        answers.nextAction,
        answers.flockSize,
        answers.readyInWeeks,
        answers.buyerFor,
        answers.birdForm,
        answers.deliveryRequired,
        answers.willVisit,
        answers.farmsKnown,
        nextPlace.deskStatus,
      ]
    );
    const contact = await loadContact(dbQuery, id);
    await syncLinkedOnboarding(dbQuery, contact);
    if (contact.userId) {
      await dbQuery(
        `INSERT INTO onboarding_touches (user_id, kind, outcome, scheduled_for, note, by_user_id)
         VALUES ($1::uuid, $2, $3, $4::timestamptz, $5, $6::uuid)`,
        [contact.userId, kind, outcome, input.scheduledFor || null, clean(input.note, 2000), input.byUserId || null]
      ).catch(() => {});
    }
    return { ok: true, contact };
  } catch (e) {
    if (String(e?.code) === "23505") {
      const contact = await loadContact(dbQuery, id);
      return { ok: true, contact, duplicate: true };
    }
    if (missingTable(e)) return { ok: false, status: 404, error: "Person not found." };
    return { ok: false, status: 500, error: e instanceof Error ? e.message : "Could not save the touch." };
  }
}

async function activateLinkedAccount(dbQuery, contact, byUserId) {
  if (!contact.userId) return;
  if (contact.want === "sell") {
    await dbQuery(
      `UPDATE farm_profiles
          SET verification_status = 'verified',
              verified_at = COALESCE(verified_at, now()),
              verified_by = $2::uuid,
              updated_at = now()
        WHERE owner_user_id = $1::uuid
          AND verification_status IS DISTINCT FROM 'rejected'`,
      [contact.userId, byUserId || null]
    );
  } else if (contact.want === "scout") {
    await dbQuery(
      `UPDATE scout_applications
          SET status = 'approved',
              reviewed_at = COALESCE(reviewed_at, now()),
              reviewed_by = $2::uuid
        WHERE user_id = $1::uuid
          AND status IS DISTINCT FROM 'rejected'`,
      [contact.userId, byUserId || null]
    );
  } else if (contact.want === "buy") {
    await dbQuery(
      `UPDATE pipeline_buyers
          SET verification_status = 'verified',
              active = true,
              verified_at = COALESCE(verified_at, now()),
              verified_by = $2::uuid,
              updated_at = now()
        WHERE user_id = $1::uuid`,
      [contact.userId, byUserId || null]
    );
  }
}

export async function decideRecruitmentContact(dbQuery, id, input, actor = {}) {
  const decision = String(input.decision || "");
  if (!DECISIONS.has(decision)) return { ok: false, status: 400, error: "Choose a decision." };
  const key = clean(input.idempotencyKey, 80);
  try {
    if (key) {
      const prior = await dbQuery(
        `SELECT id FROM recruitment_touches WHERE contact_id = $1::uuid AND idempotency_key = $2`,
        [id, key]
      );
      if (prior.rows[0]) {
        const contact = await loadContact(dbQuery, id);
        return { ok: true, contact, duplicate: true };
      }
    }
    const current = await loadContact(dbQuery, id);
    if (!current) return { ok: false, status: 404, error: "Person not found." };
    const held = salesOfficerActionAllowed(actor.role, { stage: current.stage, decision, contact: current });
    if (!held.ok) return held;
    if (decision === "approved" && canonicalStage(current.stage) === "onboarded") {
      return { ok: true, contact: current, duplicate: true };
    }
    const placed = stageAfterDecision(decision, current);
    const stage = placed?.stage || null;
    if (!placed) return { ok: false, status: 400, error: "Choose a decision." };
    if (decision === "approved") {
      const ready = approvalReady(current);
      if (!ready.ok) return { ok: false, status: 400, error: ready.error };
      if (stage === "onboarded") await activateLinkedAccount(dbQuery, current, actor.userId);
    }
    const move = stageMoveAllowed(current.stage, stage, actor.role);
    if (!move.ok && stage !== "onboarded") return { ok: false, status: 400, error: move.error };
    await dbQuery(
      `UPDATE recruitment_contacts
          SET stage = $2,
              desk_status = $5,
              decision = $3,
              decided_at = now(),
              decided_by = $4::uuid,
              activated_at = CASE WHEN $2 = 'onboarded' THEN COALESCE(activated_at, now()) ELSE activated_at END,
              updated_at = now()
        WHERE id = $1::uuid`,
      [id, stage, decision === "approved" ? "approved" : decision, actor.userId || null, placed.deskStatus]
    );
    await dbQuery(
      `INSERT INTO recruitment_touches (contact_id, kind, outcome, note, by_user_id, idempotency_key)
       VALUES ($1::uuid, 'note', 'done', $2, $3::uuid, $4)`,
      [id, clean(input.note, 2000) || decision, actor.userId || null, key]
    );
    const contact = await loadContact(dbQuery, id);
    await syncLinkedOnboarding(dbQuery, contact);
    if (typeof actor.audit === "function") {
      actor.audit(actor.userId, actor.role, "recruitment.decide", "recruitment_contact", id, { decision });
    }
    if (contact.stage === "onboarded" && decision === "approved" && contact.userId) {
      const { emitCrmMilestone } = await import("./crmBridge.js");
      const eventType = contact.want === "scout" ? "scout.approved" : contact.want === "sell" ? "seller.verified" : null;
      if (eventType) {
        void emitCrmMilestone({
          eventType,
          entities: [{ type: contact.want === "scout" ? "user" : "farm_profile", id: contact.userId }],
        });
      }
    }
    return { ok: true, contact };
  } catch (e) {
    if (String(e?.code) === "23505") {
      const contact = await loadContact(dbQuery, id);
      return { ok: true, contact, duplicate: true };
    }
    return { ok: false, status: 500, error: e instanceof Error ? e.message : "Could not save the decision." };
  }
}

function withContract(contact) {
  if (!contact) return contact;
  return { ...contact, contractText: contractFor(contact.want) };
}

export async function promoteIfKycClear(dbQuery, contact, actor) {
  if (!contact || contact.stage !== "kyc" || !kycClear(contact)) return contact;
  await activateLinkedAccount(dbQuery, contact, actor.userId);
  await dbQuery(
    `UPDATE recruitment_contacts
        SET stage = 'onboarded',
            desk_status = NULL,
            decision = 'approved',
            activated_at = COALESCE(activated_at, now()),
            updated_at = now()
      WHERE id = $1::uuid`,
    [contact.id]
  );
  const next = await loadContact(dbQuery, contact.id);
  await syncLinkedOnboarding(dbQuery, next);
  if (typeof actor.audit === "function") {
    actor.audit(actor.userId, actor.role, "recruitment.kyc_active", "recruitment_contact", contact.id, {});
  }
  if (next?.userId) {
    const { emitCrmMilestone } = await import("./crmBridge.js");
    const eventType = next.want === "scout" ? "scout.approved" : next.want === "sell" ? "seller.verified" : null;
    if (eventType) {
      void emitCrmMilestone({
        eventType,
        entities: [{ type: next.want === "scout" ? "user" : "farm_profile", id: next.userId }],
      });
    }
  }
  return next;
}

export async function getMyRecruitmentContact(dbQuery, userId) {
  try {
    const r = await dbQuery(`${CONTACT_SELECT} WHERE c.user_id = $1::uuid LIMIT 1`, [userId]);
    return { ok: true, contact: r.rows[0] ? withContract(r.rows[0]) : null };
  } catch (e) {
    if (missingTable(e)) return { ok: true, contact: null };
    return { ok: false, status: 500, error: e instanceof Error ? e.message : "Could not load your checks." };
  }
}

export async function recruitmentTradingGate(dbQuery, userId) {
  if (!userId) return { allow: true };
  try {
    const r = await dbQuery(
      `SELECT stage FROM recruitment_contacts WHERE user_id = $1::uuid LIMIT 1`,
      [userId]
    );
    return tradingAllowed(r.rows[0] || null);
  } catch (e) {
    if (missingTable(e)) return { allow: true };
    return { allow: false, code: "not_ready", error: "Could not check this account." };
  }
}

export async function submitRecruitmentKyc(dbQuery, id, input, actor = {}) {
  try {
    const current = await loadContact(dbQuery, id);
    if (!current) return { ok: false, status: 404, error: "Person not found." };
    const desk = actor.desk === true;
    if (!desk && String(current.userId || "") !== String(actor.userId || "")) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    if (!desk && input?.review) return { ok: false, status: 403, error: "Only desk staff can review these checks." };
    const statusField = {
      contract: "kycContractStatus",
      location: "kycLocationStatus",
      payment: "kycPaymentStatus",
      identity: "kycIdentityStatus",
    }[String(input?.task || "")];
    if (!desk && statusField && current[statusField] === "approved") {
      return { ok: false, status: 400, error: "That check is already approved." };
    }
    const parsed = validateKycTask(input, current);
    if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
    const reviewer = parsed.status === "approved" || parsed.status === "rejected" ? actor.userId || null : null;
    if (parsed.task === "contract") {
      await dbQuery(
        `UPDATE recruitment_contacts
            SET kyc_contract_status = $2,
                kyc_signature_url = COALESCE($3, kyc_signature_url),
                kyc_contract_snapshot = COALESCE($4, kyc_contract_snapshot),
                kyc_signed_at = CASE WHEN $3 IS NULL THEN kyc_signed_at ELSE now() END,
                kyc_signed_by = CASE WHEN $3 IS NULL THEN kyc_signed_by ELSE $5::uuid END,
                kyc_contract_reviewed_by = COALESCE($6::uuid, kyc_contract_reviewed_by),
                updated_at = now()
          WHERE id = $1::uuid`,
        [id, parsed.status, parsed.signatureUrl || null, parsed.snapshot || null, actor.userId || null, reviewer]
      );
    } else if (parsed.task === "location") {
      await dbQuery(
        `UPDATE recruitment_contacts
            SET kyc_location_status = $2,
                district = COALESCE($3, district),
                sector = COALESCE($4, sector),
                kyc_place = COALESCE($5, kyc_place),
                kyc_location_reviewed_by = COALESCE($6::uuid, kyc_location_reviewed_by),
                updated_at = now()
          WHERE id = $1::uuid`,
        [id, parsed.status, parsed.district || null, parsed.sector || null, parsed.place || null, reviewer]
      );
    } else if (parsed.task === "identity") {
      await dbQuery(
        `UPDATE recruitment_contacts
            SET kyc_identity_status = $2,
                kyc_id_number = COALESCE($3, kyc_id_number),
                kyc_id_photo_url = COALESCE($4, kyc_id_photo_url),
                kyc_identity_reviewed_by = COALESCE($5::uuid, kyc_identity_reviewed_by),
                updated_at = now()
          WHERE id = $1::uuid`,
        [id, parsed.status, parsed.idNumber || null, parsed.photoUrl || null, reviewer]
      );
    } else {
      await dbQuery(
        `UPDATE recruitment_contacts
            SET kyc_payment_status = $2,
                kyc_momo_phone = COALESCE($3, kyc_momo_phone),
                kyc_payment_proof_url = COALESCE($4, kyc_payment_proof_url),
                kyc_payment_reviewed_by = COALESCE($5::uuid, kyc_payment_reviewed_by),
                updated_at = now()
          WHERE id = $1::uuid`,
        [id, parsed.status, parsed.momoPhone || null, parsed.proofUrl || null, reviewer]
      );
    }
    let contact = await loadContact(dbQuery, id);
    contact = await promoteIfKycClear(dbQuery, contact, actor);
    if (typeof actor.audit === "function") {
      actor.audit(actor.userId, actor.role, "recruitment.kyc", "recruitment_contact", id, {
        task: parsed.task,
        status: parsed.status,
      });
    }
    return { ok: true, contact: withContract(contact) };
  } catch (e) {
    if (missingTable(e)) return { ok: false, status: 404, error: "Person not found." };
    return { ok: false, status: 500, error: e instanceof Error ? e.message : "Could not save the check." };
  }
}

export async function attachRecruitmentAccount(dbQuery, id, input) {
  const email = clean(input.email, 320);
  const userId = input.userId ? String(input.userId) : null;
  if (!email && !userId) return { ok: false, status: 400, error: "Give an account email." };
  try {
    const contact = await loadContact(dbQuery, id);
    if (!contact) return { ok: false, status: 404, error: "Person not found." };
    if (contact.userId) return { ok: true, contact };
    const found = await dbQuery(
      `SELECT u.id::text AS id, u.full_name AS name, p.district
         FROM users u
         LEFT JOIN people_onboarding p ON p.user_id = u.id
        WHERE ($1::uuid IS NOT NULL AND u.id = $1::uuid)
           OR ($2::text IS NOT NULL AND lower(u.email) = lower($2))
        LIMIT 1`,
      [userId, email]
    );
    if (!found.rows[0]) return { ok: false, status: 404, error: "No account with that email." };
    const user = found.rows[0];
    await dbQuery(
      `UPDATE recruitment_contacts
          SET user_id = $2::uuid,
              signed_up_at = COALESCE(signed_up_at, now()),
              contact_name = COALESCE(NULLIF(contact_name, ''), $3),
              district = COALESCE(NULLIF(district, ''), $4),
              updated_at = now()
        WHERE id = $1::uuid AND user_id IS NULL`,
      [id, user.id, user.name, user.district]
    );
    const next = await loadContact(dbQuery, id);
    return { ok: true, contact: next };
  } catch (e) {
    if (String(e?.code) === "23505") {
      return { ok: false, status: 409, error: "That account is already linked to another person." };
    }
    return { ok: false, status: 500, error: e instanceof Error ? e.message : "Could not attach the account." };
  }
}
