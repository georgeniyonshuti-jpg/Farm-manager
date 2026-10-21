/**
 * Scout → meat-seller claim. Market sellers live on the host company.
 * Ownership is owner_user_id. listed_by and scouted_by stay the scout.
 */

import crypto from "node:crypto";

export const CLAIM_TTL_DAYS = 14;

export function hashClaimToken(raw) {
  return crypto.createHash("sha256").update(String(raw || "").trim()).digest("hex");
}

export function claimSignupPath(token) {
  const q = new URLSearchParams({
    from: "market",
    accountType: "farmer",
    claim: String(token || ""),
  });
  return `/signup?${q.toString()}`;
}

/**
 * Public market origin for invites and signup.
 * Farm controls stay on FRONTEND_URL. Production farm.cleva.rw maps to market.cleva.rw.
 */
export function marketPublicOrigin(frontendUrl = process.env.FRONTEND_URL, marketUrl = process.env.MARKET_PUBLIC_URL) {
  const explicit = String(marketUrl || "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const front = String(frontendUrl || "").trim().replace(/\/$/, "");
  if (!front) return "";
  try {
    const url = new URL(front);
    if (url.hostname === "farm.cleva.rw") {
      url.hostname = "market.cleva.rw";
      return url.origin;
    }
  } catch {
    return front;
  }
  return front;
}

/** Absolute invite link. Missing origin is a hard failure, not a raw token. */
export function claimSignupUrl(origin, token) {
  const base = String(origin || "").replace(/\/$/, "");
  if (!base) {
    return {
      ok: false,
      error: "FRONTEND_URL is not set. An admin must set it before invite links work.",
    };
  }
  return { ok: true, url: `${base}${claimSignupPath(token)}` };
}

export function emailsMatch(invited, actual) {
  const a = String(invited || "").trim().toLowerCase();
  const b = String(actual || "").trim().toLowerCase();
  if (!a) return true;
  return a === b;
}

/**
 * @returns {{ ok: boolean, action?: string, code?: string, status?: number, message?: string }}
 */
export function classifyClaim({
  claim,
  email,
  userId,
  marketOnly = true,
  existingProfile = null,
  listingCount = 0,
  now = new Date(),
}) {
  if (!claim) {
    return { ok: false, code: "invalid", status: 404, message: "This invite link is not valid." };
  }
  const ownerId = claim.ownerUserId || null;
  const sameOwner = ownerId && userId && String(ownerId) === String(userId);
  if (claim.status === "accepted" || sameOwner) {
    if (sameOwner || (claim.claimedByUserId && userId && String(claim.claimedByUserId) === String(userId))) {
      return { ok: true, action: "idempotent" };
    }
    if (claim.status === "accepted") {
      return { ok: false, code: "used", status: 400, message: "This invite link has already been used." };
    }
  }
  if (claim.status === "expired" || (claim.expiresAt && new Date(claim.expiresAt).getTime() < now.getTime())) {
    return {
      ok: false,
      code: "expired",
      status: 400,
      message: "This invite link has expired. Ask your scout for a new one.",
    };
  }
  if (claim.status === "needs_review") {
    return {
      ok: false,
      code: "needs_review",
      status: 409,
      message: "We could not attach this flock automatically. Contact Cleva and we will finish it for you.",
    };
  }
  if (claim.status === "revoked") {
    return { ok: false, code: "used", status: 400, message: "This invite link has already been used." };
  }
  if (claim.status !== "pending") {
    return { ok: false, code: "invalid", status: 400, message: "This invite link is not valid." };
  }
  if (!emailsMatch(claim.invitedEmail, email)) {
    return {
      ok: false,
      action: "needs_review",
      code: "email_mismatch",
      status: 409,
      message: "This invite was sent to a different email. Contact Cleva and we will finish it for you.",
    };
  }
  if (!marketOnly) {
    return {
      ok: false,
      action: "needs_review",
      code: "not_market_account",
      status: 409,
      message: "This invite is for a market seller account. Contact Cleva and we will finish it for you.",
    };
  }
  if (
    existingProfile &&
    String(existingProfile.id) !== String(claim.farmProfileId)
  ) {
    if (Number(listingCount) > 0) {
      return {
        ok: false,
        action: "needs_review",
        code: "has_listings",
        status: 409,
        message: "This account already has a flock. Contact Cleva and we will attach this one for you.",
      };
    }
    return { ok: true, action: "adopt" };
  }
  if (claim.profileCompanyId && ownerId && !sameOwner) {
    return { ok: false, code: "used", status: 400, message: "This farm is already claimed." };
  }
  return { ok: true, action: "transfer" };
}

/** One statement. Does not change listed_by, scouted_by, or verification_status. */
export const CLAIM_TRANSFER_SQL = `
WITH dropped AS (
  DELETE FROM farm_profiles fp
   WHERE $1::uuid IS NOT NULL
     AND fp.id = $1::uuid
     AND fp.owner_user_id = $2::uuid
     AND NOT EXISTS (
       SELECT 1 FROM pipeline_lots l
        WHERE l.farm_profile_id = fp.id AND l.status <> 'cancelled'
     )
  RETURNING fp.id
),
owned AS (
  UPDATE farm_profiles
     SET company_id = $3::uuid,
         owner_user_id = $2::uuid,
         claim_token = NULL,
         updated_at = now()
   WHERE id = $4::uuid
     AND (owner_user_id IS NULL OR owner_user_id = $2::uuid)
     AND (company_id IS NULL OR company_id = $3::uuid)
  RETURNING id, scouted_by
),
moved AS (
  UPDATE pipeline_lots l
     SET company_id = $3::uuid,
         updated_at = now()
   WHERE l.farm_profile_id = $4::uuid
     AND l.source = 'scout'
     AND EXISTS (SELECT 1 FROM owned)
  RETURNING l.id, l.scouted_by AS "scoutedBy", l.listed_by AS "listedBy",
            l.verification_status AS "verificationStatus"
),
accepted AS (
  UPDATE farm_profile_claims
     SET status = 'accepted',
         claimed_by_user_id = $2::uuid,
         claimed_company_id = $3::uuid,
         accepted_at = now()
   WHERE id = $5::uuid
     AND status IN ('pending', 'needs_review')
     AND EXISTS (SELECT 1 FROM owned)
  RETURNING id
)
SELECT
  (SELECT id::text FROM owned) AS "profileId",
  (SELECT scouted_by::text FROM owned) AS "scoutedBy",
  (SELECT id::text FROM accepted) AS "claimId",
  COALESCE((SELECT json_agg(json_build_object(
    'id', id::text,
    'scoutedBy', "scoutedBy",
    'listedBy', "listedBy",
    'verificationStatus', "verificationStatus"
  )) FROM moved), '[]'::json) AS lots
`;

const CLAIM_LOOKUP_SQL = `
SELECT c.id::text AS id,
       c.farm_profile_id::text AS "farmProfileId",
       c.invited_email AS "invitedEmail",
       c.status,
       c.expires_at AS "expiresAt",
       c.claimed_by_user_id::text AS "claimedByUserId",
       fp.company_id::text AS "profileCompanyId",
       fp.owner_user_id::text AS "ownerUserId",
       fp.scouted_by::text AS "scoutedBy",
       fp.display_name AS "displayName"
  FROM farm_profile_claims c
  JOIN farm_profiles fp ON fp.id = c.farm_profile_id
 WHERE c.token_hash = $1 OR c.token = $1
 LIMIT 1
`;

export function scoutLotMayGoPublic(lot, profile) {
  if (!lot || lot.verificationStatus !== "verified") return false;
  if (lot.source !== "scout") return true;
  return Boolean(
    profile &&
      profile.consentStatus === "granted" &&
      profile.verificationStatus === "verified"
  );
}

export function scoutPublicConsentSql(alias = "l") {
  return `
  AND (
    ${alias}.source IS DISTINCT FROM 'scout'
    OR EXISTS (
      SELECT 1 FROM farm_profiles fp_gate
       WHERE fp_gate.id = ${alias}.farm_profile_id
         AND fp_gate.consent_status = 'granted'
         AND fp_gate.verification_status = 'verified'
    )
  )`;
}

export function sellerStatusChips({
  ownerUserId = null,
  claimStatus = null,
  lotVerification = null,
  consentStatus = null,
  profileVerification = null,
} = {}) {
  const chips = [];
  if (claimStatus === "needs_review") chips.push("needs_review");
  else if (claimStatus === "pending" && !ownerUserId) chips.push("invite_sent");
  if (ownerUserId || claimStatus === "accepted") chips.push("claimed");
  if (lotVerification === "pending_review" || (!lotVerification && !chips.includes("invite_sent"))) {
    chips.push("pending_review");
  }
  if (lotVerification === "verified") chips.push("verified");
  if (
    lotVerification === "verified" &&
    consentStatus === "granted" &&
    profileVerification === "verified"
  ) {
    chips.push("live");
  }
  if (chips.length === 0) chips.push("pending_review");
  return chips;
}

/**
 * In-memory stand-in for CLAIM_TRANSFER_SQL, used by tests.
 * Keeps scouted_by, listed_by, and verification_status.
 */
export function applyClaimToState(state, { emptyProfileId, userId, hostCompanyId, farmProfileId, claimId }) {
  if (emptyProfileId) {
    const emptyLots = state.lots.filter(
      (l) => l.farmProfileId === emptyProfileId && l.status !== "cancelled"
    );
    if (emptyLots.length === 0) {
      state.profiles = state.profiles.filter((p) => p.id !== emptyProfileId);
    }
  }
  const profile = state.profiles.find((p) => p.id === farmProfileId);
  if (!profile) return { ok: false };
  if (profile.ownerUserId && profile.ownerUserId !== userId) return { ok: false };
  if (profile.companyId && profile.companyId !== hostCompanyId) return { ok: false };
  profile.companyId = hostCompanyId;
  profile.ownerUserId = userId;
  profile.claimToken = null;
  const lots = [];
  for (const lot of state.lots) {
    if (lot.farmProfileId === farmProfileId && lot.source === "scout") {
      lot.companyId = hostCompanyId;
      lots.push({
        id: lot.id,
        scoutedBy: lot.scoutedBy,
        listedBy: lot.listedBy,
        verificationStatus: lot.verificationStatus,
      });
    }
  }
  const claim = state.claims.find((c) => c.id === claimId);
  if (claim && (claim.status === "pending" || claim.status === "needs_review")) {
    claim.status = "accepted";
    claim.claimedByUserId = userId;
    claim.claimedCompanyId = hostCompanyId;
  }
  return { ok: true, profileId: profile.id, scoutedBy: profile.scoutedBy, lots };
}

export async function loadClaimByToken(dbQuery, rawToken) {
  const hash = hashClaimToken(rawToken);
  const r = await dbQuery(CLAIM_LOOKUP_SQL, [hash]);
  return r.rows[0] || null;
}

export async function executeSellerClaim(dbQuery, input) {
  const claim = input.claim || (await loadClaimByToken(dbQuery, input.rawToken));
  let existingProfile = input.existingProfile ?? null;
  let listingCount = input.listingCount ?? 0;
  if (existingProfile == null && input.userId && input.marketOnly !== false) {
    const owned = await dbQuery(
      `SELECT id::text AS id, owner_user_id::text AS "ownerUserId"
         FROM farm_profiles WHERE owner_user_id = $1::uuid LIMIT 1`,
      [input.userId]
    );
    existingProfile = owned.rows[0] || null;
  }
  if (existingProfile && input.listingCount == null) {
    const counted = await dbQuery(
      `SELECT COUNT(*)::int AS n FROM pipeline_lots
        WHERE farm_profile_id = $1::uuid AND status <> 'cancelled'`,
      [existingProfile.id]
    );
    listingCount = Number(counted.rows[0]?.n || 0);
  }
  const decision = classifyClaim({
    claim,
    email: input.email,
    userId: input.userId,
    marketOnly: input.marketOnly !== false,
    existingProfile,
    listingCount,
    now: input.now,
  });
  if (!decision.ok && decision.action === "needs_review" && claim) {
    await dbQuery(
      `UPDATE farm_profile_claims
          SET status = 'needs_review', review_reason = $2
        WHERE id = $1::uuid AND status = 'pending'`,
      [claim.id, decision.code]
    );
    return { ...decision, claimId: claim.id };
  }
  if (!decision.ok && decision.code === "expired" && claim && claim.status === "pending") {
    await dbQuery(`UPDATE farm_profile_claims SET status = 'expired' WHERE id = $1::uuid AND status = 'pending'`, [
      claim.id,
    ]);
  }
  if (!decision.ok) return decision;
  if (decision.action === "idempotent") {
    return { ok: true, action: "idempotent", profileId: claim.farmProfileId, scoutedBy: claim.scoutedBy };
  }
  const emptyProfileId =
    decision.action === "adopt" && existingProfile ? existingProfile.id : null;
  const transferred = await dbQuery(CLAIM_TRANSFER_SQL, [
    emptyProfileId,
    input.userId,
    input.hostCompanyId,
    claim.farmProfileId,
    claim.id,
  ]);
  const row = transferred.rows[0];
  if (!row?.profileId) {
    return { ok: false, code: "used", status: 400, message: "This farm is already claimed." };
  }
  return {
    ok: true,
    action: decision.action,
    profileId: row.profileId,
    scoutedBy: row.scoutedBy,
    lots: row.lots,
  };
}
