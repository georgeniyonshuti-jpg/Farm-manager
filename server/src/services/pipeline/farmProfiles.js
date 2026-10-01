/**
 * Farm storefronts — consent, visibility, public projection, slug/claim helpers.
 */

import { randomBytes } from "crypto";

export const VISIBILITY_TIERS = ["brokered_public", "profile_public", "verified_buyers"];
export const PRODUCT_TYPES = ["broiler_birds", "layer_birds", "eggs"];

export const PUBLIC_FARM_SENSITIVE_KEYS = [
  "id",
  "companyId",
  "contactPhone",
  "contactWhatsapp",
  "contactEmail",
  "exactLocation",
  "lat",
  "lng",
  "claimToken",
  "claimEmail",
  "scoutedBy",
  "createdBy",
  "consentName",
  "consentPhone",
  "verificationStatus",
  "consentStatus",
  "published",
];

export function marketplaceStorefrontsEnabled(getSetting) {
  const raw =
    typeof getSetting === "function"
      ? getSetting("marketplace_storefronts", "1")
      : getSetting == null
        ? "1"
        : getSetting;
  const v = String(raw ?? "1").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(v);
}

export function slugifyFarmName(name) {
  const base = String(name || "farm")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "farm";
}

export function withSlugSuffix(base, suffix) {
  const s = String(suffix || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 6);
  const stem = String(base || "farm").slice(0, s ? 33 : 40);
  return s ? `${stem}-${s}` : stem;
}

export function isProfilePubliclyVisible(profile) {
  if (!profile) return false;
  return (
    profile.published === true &&
    profile.consentStatus === "granted" &&
    profile.verificationStatus === "verified"
  );
}

export function canPublishProfile(profile) {
  if (!profile) return { ok: false, error: "Profile not found." };
  if (profile.consentStatus !== "granted") {
    return { ok: false, error: "Farmer consent is required before publishing." };
  }
  if (profile.verificationStatus !== "verified") {
    return { ok: false, error: "Cleva must verify this farm before it can go public." };
  }
  return { ok: true };
}

/**
 * Guest vs verified-buyer effective listing audience.
 * @param {{ visibilityTier?: string, profile?: object|null }} lot
 * @param {{ storefrontsEnabled?: boolean, audience?: "guest"|"verified_buyer" }} opts
 */
export function effectivePublicVisibility(lot, opts = {}) {
  if (!opts.storefrontsEnabled) return "brokered_public";
  const tier = VISIBILITY_TIERS.includes(lot?.visibilityTier) ? lot.visibilityTier : "brokered_public";
  const audience = opts.audience === "verified_buyer" ? "verified_buyer" : "guest";
  if (tier === "brokered_public") return "brokered_public";
  if (tier === "verified_buyers") {
    return audience === "verified_buyer" ? "verified_buyers" : "brokered_public";
  }
  if (tier === "profile_public" && isProfilePubliclyVisible(lot?.profile)) return "profile_public";
  return "brokered_public";
}

export function mapPublicMedia(row) {
  if (!row) return null;
  const url = String(row.secureUrl ?? row.secure_url ?? row.url ?? "").trim();
  if (!url) return null;
  return {
    url,
    purpose: String(row.purpose || "gallery"),
    caption: row.caption != null ? String(row.caption) : null,
    width: row.width != null ? Number(row.width) : null,
    height: row.height != null ? Number(row.height) : null,
  };
}

/**
 * Allowlisted public farm card. Contact/exact location only when disclosure flags pass.
 */
export function mapPublicFarm(profile, extra = {}) {
  if (!isProfilePubliclyVisible(profile) && !extra.force) return null;
  const media = (extra.media || []).map(mapPublicMedia).filter(Boolean);
  const cover = extra.coverUrl || media.find((m) => m.purpose === "cover")?.url || media[0]?.url || null;
  const discloseContact = Boolean(profile.discloseContact ?? profile.disclose_contact);
  const discloseExact = Boolean(profile.discloseExactLocation ?? profile.disclose_exact_location);
  const farm = {
    slug: String(profile.slug || ""),
    displayName: String(profile.displayName ?? profile.display_name ?? ""),
    story: profile.story != null ? String(profile.story) : null,
    district: profile.district != null ? String(profile.district) : null,
    locationLabel: profile.locationLabel ?? profile.location_label ?? null,
    specialties: Array.isArray(profile.specialties) ? profile.specialties.map(String) : [],
    slaughterAvailable: Boolean(profile.slaughterAvailable ?? profile.slaughter_available),
    deliveryAvailable: Boolean(profile.deliveryAvailable ?? profile.delivery_available),
    coverUrl: cover,
    media,
    verified: true,
  };
  if (discloseContact) {
    farm.contactPhone = profile.contactPhone ?? profile.contact_phone ?? null;
    farm.contactWhatsapp = profile.contactWhatsapp ?? profile.contact_whatsapp ?? null;
  }
  if (discloseExact) {
    farm.exactLocation = profile.exactLocation ?? profile.exact_location ?? null;
    if (profile.lat != null) farm.lat = Number(profile.lat);
    if (profile.lng != null) farm.lng = Number(profile.lng);
  }
  return farm;
}

export function mapFarmProfileRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.companyId ?? row.company_id ?? null,
    ownerUserId: row.ownerUserId ?? row.owner_user_id ?? null,
    slug: row.slug,
    displayName: row.displayName ?? row.display_name,
    story: row.story ?? null,
    district: row.district ?? null,
    locationLabel: row.locationLabel ?? row.location_label ?? null,
    exactLocation: row.exactLocation ?? row.exact_location ?? null,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    contactPhone: row.contactPhone ?? row.contact_phone ?? null,
    contactWhatsapp: row.contactWhatsapp ?? row.contact_whatsapp ?? null,
    contactEmail: row.contactEmail ?? row.contact_email ?? null,
    specialties: Array.isArray(row.specialties) ? row.specialties : [],
    slaughterAvailable: Boolean(row.slaughterAvailable ?? row.slaughter_available),
    deliveryAvailable: Boolean(row.deliveryAvailable ?? row.delivery_available),
    verificationStatus: row.verificationStatus ?? row.verification_status ?? "pending",
    published: Boolean(row.published),
    consentStatus: row.consentStatus ?? row.consent_status ?? "none",
    consentAt: row.consentAt ?? row.consent_at ?? null,
    consentSource: row.consentSource ?? row.consent_source ?? null,
    consentName: row.consentName ?? row.consent_name ?? null,
    consentPhone: row.consentPhone ?? row.consent_phone ?? null,
    scoutedBy: row.scoutedBy ?? row.scouted_by ?? null,
    discloseContact: Boolean(row.discloseContact ?? row.disclose_contact),
    discloseExactLocation: Boolean(row.discloseExactLocation ?? row.disclose_exact_location),
    discloseExactPrice: Boolean(row.discloseExactPrice ?? row.disclose_exact_price),
    claimEmail: row.claimEmail ?? row.claim_email ?? null,
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
  };
}

export const FARM_PROFILE_SELECT = `
  fp.id::text AS id,
  fp.company_id::text AS "companyId",
  fp.owner_user_id::text AS "ownerUserId",
  fp.slug,
  fp.display_name AS "displayName",
  fp.story,
  fp.district,
  fp.location_label AS "locationLabel",
  fp.exact_location AS "exactLocation",
  fp.lat,
  fp.lng,
  fp.contact_phone AS "contactPhone",
  fp.contact_whatsapp AS "contactWhatsapp",
  fp.contact_email AS "contactEmail",
  fp.specialties,
  fp.slaughter_available AS "slaughterAvailable",
  fp.delivery_available AS "deliveryAvailable",
  fp.verification_status AS "verificationStatus",
  fp.published,
  fp.consent_status AS "consentStatus",
  fp.consent_at AS "consentAt",
  fp.consent_source AS "consentSource",
  fp.consent_name AS "consentName",
  fp.consent_phone AS "consentPhone",
  fp.scouted_by::text AS "scoutedBy",
  fp.disclose_contact AS "discloseContact",
  fp.disclose_exact_location AS "discloseExactLocation",
  fp.disclose_exact_price AS "discloseExactPrice",
  fp.claim_email AS "claimEmail",
  fp.created_at AS "createdAt",
  fp.updated_at AS "updatedAt"
`;

export function normalizeSpecialties(value) {
  if (Array.isArray(value)) {
    return value
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  if (typeof value === "string") {
    return value
      .split(/[,|]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  return [];
}

export function normalizeVisibilityTier(value) {
  const v = String(value || "brokered_public").trim();
  return VISIBILITY_TIERS.includes(v) ? v : "brokered_public";
}

export function normalizeProductType(value) {
  const v = String(value || "broiler_birds")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  return v || "broiler_birds";
}

export function createClaimToken() {
  return randomBytes(24).toString("hex");
}

export async function createUniqueFarmSlug(dbQuery, name) {
  const stem = slugifyFarmName(name);
  for (let i = 0; i < 8; i += 1) {
    const slug = i === 0 ? stem : withSlugSuffix(stem, createClaimToken().slice(0, 4 + i));
    const r = await dbQuery(`SELECT 1 FROM farm_profiles WHERE slug = $1 LIMIT 1`, [slug]);
    if (!r.rows[0]) return slug;
  }
  return withSlugSuffix(stem, createClaimToken().slice(0, 6));
}

function pageAccessKeys(user) {
  return Array.isArray(user?.pageAccess) ? user.pageAccess.filter(Boolean) : [];
}

/** Market signup seller — pageAccess is only farm_market. */
export function isMarketOnlySeller(user) {
  if (!user) return false;
  if (user.role !== "manager" && user.role !== "company_admin") return false;
  const access = pageAccessKeys(user);
  return access.length > 0 && access.every((key) => key === "farm_market");
}

/** Host-company market seller (Cleva Technologies tenant + market-only access). */
export function isHostMarketSeller(user, hostCompanyId) {
  if (!isMarketOnlySeller(user)) return false;
  if (!hostCompanyId) return true;
  return Boolean(user.companyId) && String(user.companyId) === String(hostCompanyId);
}

export function farmerOwnsLot(user, lot, profile = null) {
  if (!user || !lot) return false;
  if (isMarketOnlySeller(user)) {
    if (lot.listedBy && String(lot.listedBy) === String(user.id)) return true;
    if (profile?.id && lot.farmProfileId && String(lot.farmProfileId) === String(profile.id)) return true;
    return false;
  }
  return Boolean(lot.companyId) && String(lot.companyId) === String(user.companyId);
}

/**
 * Append owner-vs-company listing scope. Desk callers should skip this.
 * @param {string[]} clauses
 * @param {unknown[]} params
 * @param {object} user
 * @param {{ lotAlias?: string }} [opts]
 */
export function appendFarmerLotScope(clauses, params, user, opts = {}) {
  const alias = opts.lotAlias || "l";
  if (isMarketOnlySeller(user)) {
    params.push(user.id);
    const i = params.length;
    clauses.push(
      `(${alias}.listed_by = $${i}::uuid OR ${alias}.farm_profile_id IN (SELECT id FROM farm_profiles WHERE owner_user_id = $${i}::uuid))`
    );
    return;
  }
  params.push(user.companyId);
  clauses.push(`${alias}.company_id = $${params.length}::uuid`);
}

export async function loadProfileForFarmer(dbQuery, user) {
  if (!user) return null;
  if (isMarketOnlySeller(user)) {
    const r = await dbQuery(
      `SELECT ${FARM_PROFILE_SELECT} FROM farm_profiles fp WHERE fp.owner_user_id = $1::uuid LIMIT 1`,
      [user.id]
    );
    return mapFarmProfileRow(r.rows[0]);
  }
  if (!user.companyId) return null;
  const r = await dbQuery(
    `SELECT ${FARM_PROFILE_SELECT}
       FROM farm_profiles fp
      WHERE fp.company_id = $1::uuid
        AND fp.owner_user_id IS NULL
      LIMIT 1`,
    [user.companyId]
  );
  return mapFarmProfileRow(r.rows[0]);
}
