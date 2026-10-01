/**
 * Storefront APIs: farm profiles, Cloudinary media, scout capture, claims, verify profiles.
 */

import {
  FARM_PROFILE_SELECT,
  canPublishProfile,
  createClaimToken,
  createUniqueFarmSlug,
  isMarketOnlySeller,
  loadProfileForFarmer as loadOwnedProfileForFarmer,
  mapFarmProfileRow,
  normalizeSpecialties,
} from "../services/pipeline/farmProfiles.js";
import {
  buildSignedUpload,
  cloudinaryConfigFromEnv,
  destroyCloudinaryAsset,
  mediaLimitPerOwner,
  validateCloudinaryAsset,
} from "../services/pipeline/cloudinary.js";
import { listingAnalytics } from "../services/pipeline/marketEvents.js";
import {
  buildFarmClaimEmail,
  buildFarmVerifiedEmail,
  emailForUserId,
  emailsForCompanyAdmins,
  notifyMany,
} from "../services/pipeline/marketNotify.js";
import {
  canAccessPipelineDesk,
  canListFarmerLots,
  canScoutPipeline,
} from "../services/pipeline/pipeline.js";

/**
 * @param {import('express').Router} router
 * @param {{ dbQuery: Function, hasDb: Function, audit: Function, helpers: Record<string, Function> }} ctx
 */
export function registerPipelineStorefrontRoutes(router, ctx) {
  const { dbQuery, hasDb, audit, helpers } = ctx;
  const { requireDb, requireDesk, str, bool } = helpers;

  async function uniqueSlug(base) {
    return createUniqueFarmSlug(dbQuery, base);
  }

  async function loadProfileForFarmer(user) {
    return loadOwnedProfileForFarmer(dbQuery, user);
  }

  async function loadProfileById(id) {
    const r = await dbQuery(`SELECT ${FARM_PROFILE_SELECT} FROM farm_profiles fp WHERE fp.id = $1::uuid`, [id]);
    return mapFarmProfileRow(r.rows[0]);
  }

  async function loadMedia(ownerType, ownerId) {
    const r = await dbQuery(
      `SELECT id::text AS id, owner_type AS "ownerType", owner_id::text AS "ownerId",
              cloudinary_public_id AS "publicId", secure_url AS "secureUrl",
              width, height, format, bytes, caption, purpose, sort_order AS "sortOrder",
              moderation_status AS "moderationStatus"
         FROM market_media
        WHERE owner_type = $1 AND owner_id = $2::uuid
        ORDER BY sort_order, created_at`,
      [ownerType, ownerId]
    );
    return r.rows;
  }

  function canMutateProfile(user, profile) {
    if (!profile) return false;
    if (canAccessPipelineDesk(user)) return true;
    if (canListFarmerLots(user) && profile.companyId && profile.companyId === user.companyId) return true;
    if (canScoutPipeline(user) && profile.scoutedBy === user.id && !profile.companyId) return true;
    return false;
  }

  async function assertMediaOwner(user, ownerType, ownerId) {
    if (ownerType === "farm_profile") {
      const profile = await loadProfileById(ownerId);
      if (!profile) return { error: { status: 404, body: { error: "Farm not found." } } };
      if (!canMutateProfile(user, profile)) {
        return { error: { status: 403, body: { error: "Not allowed." } } };
      }
      return { profile };
    }
    if (ownerType === "lot") {
      const r = await dbQuery(
        `SELECT id::text AS id, company_id::text AS "companyId", listed_by::text AS "listedBy",
                scouted_by::text AS "scoutedBy"
           FROM pipeline_lots WHERE id = $1::uuid`,
        [ownerId]
      );
      const lot = r.rows[0];
      if (!lot) return { error: { status: 404, body: { error: "Lot not found." } } };
      if (canAccessPipelineDesk(user)) return { lot };
      if (canListFarmerLots(user) && lot.companyId && lot.companyId === user.companyId) return { lot };
      if (canScoutPipeline(user) && (lot.scoutedBy === user.id || lot.listedBy === user.id)) return { lot };
      return { error: { status: 403, body: { error: "Not allowed." } } };
    }
    return { error: { status: 400, body: { error: "ownerType must be farm_profile or lot." } } };
  }

  // ——— Farmer profile ———

  router.get("/market/profile", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canListFarmerLots(req.authUser) && !canAccessPipelineDesk(req.authUser)) {
      return res.status(403).json({ error: "Farmer account required." });
    }
    try {
      const profile = await loadProfileForFarmer(req.authUser);
      if (!profile) return res.json({ profile: null, media: [], analytics: null });
      const [media, analytics] = await Promise.all([
        loadMedia("farm_profile", profile.id),
        listingAnalytics(dbQuery, { farmProfileId: profile.id }),
      ]);
      res.json({ profile, media, analytics });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load profile." });
    }
  });

  router.put("/market/profile", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canListFarmerLots(req.authUser)) {
      return res.status(403).json({ error: "Farmer account required." });
    }
    if (!req.authUser.companyId) {
      return res.status(400).json({ error: "Company required." });
    }
    const body = req.body ?? {};
    const displayName = str(body.displayName, 160);
    if (!displayName) return res.status(400).json({ error: "displayName is required." });
    try {
      let profile = await loadProfileForFarmer(req.authUser);
      const specialties = normalizeSpecialties(body.specialties);
      if (!profile) {
        const slug = await uniqueSlug(displayName);
        const ins = await dbQuery(
          `INSERT INTO farm_profiles
             (company_id, slug, display_name, story, district, location_label, exact_location,
              contact_phone, contact_whatsapp, contact_email, specialties,
              slaughter_available, delivery_available, disclose_contact,
              disclose_exact_location, disclose_exact_price, created_by, owner_user_id)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], $12, $13, $14, $15, $16, $17::uuid, $18::uuid)
           RETURNING id::text AS id`,
          [
            req.authUser.companyId,
            slug,
            displayName,
            str(body.story, 4000),
            str(body.district, 120),
            str(body.locationLabel, 200),
            str(body.exactLocation, 240),
            str(body.contactPhone, 40),
            str(body.contactWhatsapp, 40),
            str(body.contactEmail, 160),
            specialties,
            bool(body.slaughterAvailable, false),
            bool(body.deliveryAvailable, false),
            bool(body.discloseContact, false),
            bool(body.discloseExactLocation, false),
            bool(body.discloseExactPrice, false),
            req.authUser.id,
            isMarketOnlySeller(req.authUser) ? req.authUser.id : null,
          ]
        );
        profile = await loadProfileById(ins.rows[0].id);
        audit(req.authUser, "pipeline.profile.create", "farm_profile", profile.id, {});
      } else {
        await dbQuery(
          `UPDATE farm_profiles SET
              display_name = $2,
              story = $3,
              district = $4,
              location_label = $5,
              exact_location = $6,
              contact_phone = $7,
              contact_whatsapp = $8,
              contact_email = $9,
              specialties = $10::text[],
              slaughter_available = $11,
              delivery_available = $12,
              disclose_contact = $13,
              disclose_exact_location = $14,
              disclose_exact_price = $15,
              updated_at = now()
            WHERE id = $1::uuid`,
          [
            profile.id,
            displayName,
            str(body.story, 4000),
            str(body.district, 120),
            str(body.locationLabel, 200),
            str(body.exactLocation, 240),
            str(body.contactPhone, 40),
            str(body.contactWhatsapp, 40),
            str(body.contactEmail, 160),
            specialties,
            bool(body.slaughterAvailable, profile.slaughterAvailable),
            bool(body.deliveryAvailable, profile.deliveryAvailable),
            bool(body.discloseContact, profile.discloseContact),
            bool(body.discloseExactLocation, profile.discloseExactLocation),
            bool(body.discloseExactPrice, profile.discloseExactPrice),
          ]
        );
        profile = await loadProfileById(profile.id);
        audit(req.authUser, "pipeline.profile.update", "farm_profile", profile.id, {});
      }
      res.json({ profile, media: await loadMedia("farm_profile", profile.id) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not save profile." });
    }
  });

  router.post("/market/profile/consent", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canListFarmerLots(req.authUser)) {
      return res.status(403).json({ error: "Farmer account required." });
    }
    const granted = bool(req.body?.granted, true);
    try {
      const profile = await loadProfileForFarmer(req.authUser);
      if (!profile) return res.status(404).json({ error: "Create a storefront first." });
      await dbQuery(
        `UPDATE farm_profiles SET
            consent_status = $2,
            consent_at = now(),
            consent_source = 'farmer',
            consent_name = $3,
            consent_phone = $4,
            published = CASE WHEN $2 = 'revoked' THEN false ELSE published END,
            updated_at = now()
          WHERE id = $1::uuid`,
        [
          profile.id,
          granted ? "granted" : "revoked",
          str(req.body?.consentName, 160) || req.authUser.fullName || req.authUser.email,
          str(req.body?.consentPhone, 40),
        ]
      );
      audit(req.authUser, "pipeline.profile.consent", "farm_profile", profile.id, { granted });
      res.json({ profile: await loadProfileById(profile.id) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not record consent." });
    }
  });

  router.post("/market/profile/publish", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canListFarmerLots(req.authUser)) {
      return res.status(403).json({ error: "Farmer account required." });
    }
    const published = bool(req.body?.published, true);
    try {
      const profile = await loadProfileForFarmer(req.authUser);
      if (!profile) return res.status(404).json({ error: "Create a storefront first." });
      if (published) {
        const gate = canPublishProfile(profile);
        if (!gate.ok) return res.status(400).json({ error: gate.error });
      }
      await dbQuery(
        `UPDATE farm_profiles SET published = $2, updated_at = now() WHERE id = $1::uuid`,
        [profile.id, published]
      );
      audit(req.authUser, "pipeline.profile.publish", "farm_profile", profile.id, { published });
      res.json({ profile: await loadProfileById(profile.id) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not publish." });
    }
  });

  router.get("/market/profile/analytics", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canListFarmerLots(req.authUser)) {
      return res.status(403).json({ error: "Farmer account required." });
    }
    const profile = await loadProfileForFarmer(req.authUser);
    if (!profile) return res.json({ totals: {}, byLot: {} });
    res.json(await listingAnalytics(dbQuery, { farmProfileId: profile.id }));
  });

  router.post("/market/profile/claim", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canListFarmerLots(req.authUser) || !req.authUser.companyId) {
      return res.status(403).json({ error: "Farmer account required." });
    }
    const token = str(req.body?.token, 80);
    if (!token) return res.status(400).json({ error: "Claim token is required." });
    try {
      const existing = await loadProfileForFarmer(req.authUser);
      if (existing) {
        return res.status(400).json({ error: "This farm already has a storefront." });
      }
      const claimR = await dbQuery(
        `SELECT id::text AS id, farm_profile_id::text AS "farmProfileId", status, expires_at AS "expiresAt"
           FROM farm_profile_claims WHERE token = $1 LIMIT 1`,
        [token]
      );
      const claim = claimR.rows[0];
      if (!claim || claim.status !== "pending") {
        return res.status(404).json({ error: "Claim is not valid." });
      }
      if (claim.expiresAt && new Date(claim.expiresAt) < new Date()) {
        await dbQuery(`UPDATE farm_profile_claims SET status = 'expired' WHERE id = $1::uuid`, [claim.id]);
        return res.status(400).json({ error: "This invite has expired." });
      }
      const profile = await loadProfileById(claim.farmProfileId);
      if (!profile || profile.companyId) {
        return res.status(400).json({ error: "This farm is already claimed." });
      }
      await dbQuery(
        `UPDATE farm_profiles SET company_id = $2::uuid, updated_at = now() WHERE id = $1::uuid`,
        [profile.id, req.authUser.companyId]
      );
      await dbQuery(
        `UPDATE farm_profile_claims SET
            status = 'accepted', claimed_by_user_id = $2::uuid, claimed_company_id = $3::uuid, accepted_at = now()
          WHERE id = $1::uuid`,
        [claim.id, req.authUser.id, req.authUser.companyId]
      );
      audit(req.authUser, "pipeline.profile.claim", "farm_profile", profile.id, {});
      res.json({ profile: await loadProfileById(profile.id) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not claim farm." });
    }
  });

  // ——— Media ———

  router.post("/market/media/sign", async (req, res) => {
    if (!canListFarmerLots(req.authUser) && !canScoutPipeline(req.authUser) && !canAccessPipelineDesk(req.authUser)) {
      return res.status(403).json({ error: "Not allowed." });
    }
    const signed = buildSignedUpload({
      purpose: str(req.body?.purpose, 40) || "gallery",
      ownerType: str(req.body?.ownerType, 40),
      ownerId: str(req.body?.ownerId, 64),
    });
    if (!signed.ok) return res.status(503).json({ error: signed.error });
    res.json(signed);
  });

  router.post("/market/media", async (req, res) => {
    if (!requireDb(res)) return;
    const ownerType = str(req.body?.ownerType, 40);
    const ownerId = str(req.body?.ownerId, 64);
    const purpose = str(req.body?.purpose, 40) || "gallery";
    if (!["farm_profile", "lot"].includes(ownerType) || !ownerId) {
      return res.status(400).json({ error: "ownerType and ownerId are required." });
    }
    if (!["cover", "gallery", "certification", "visit"].includes(purpose)) {
      return res.status(400).json({ error: "Invalid media purpose." });
    }
    const owned = await assertMediaOwner(req.authUser, ownerType, ownerId);
    if (owned.error) return res.status(owned.error.status).json(owned.error.body);
    const cfg = cloudinaryConfigFromEnv();
    const asset = validateCloudinaryAsset(
      {
        publicId: req.body?.publicId ?? req.body?.cloudinaryPublicId,
        secureUrl: req.body?.secureUrl,
        format: req.body?.format,
        bytes: req.body?.bytes,
      },
      { cloudName: cfg?.cloudName }
    );
    if (!asset.ok) return res.status(400).json({ error: asset.error });
    try {
      const countR = await dbQuery(
        `SELECT COUNT(*)::int AS n FROM market_media WHERE owner_type = $1 AND owner_id = $2::uuid`,
        [ownerType, ownerId]
      );
      if (Number(countR.rows[0]?.n || 0) >= mediaLimitPerOwner()) {
        return res.status(400).json({ error: `At most ${mediaLimitPerOwner()} photos per listing.` });
      }
      if (purpose === "cover") {
        await dbQuery(
          `UPDATE market_media SET purpose = 'gallery' WHERE owner_type = $1 AND owner_id = $2::uuid AND purpose = 'cover'`,
          [ownerType, ownerId]
        );
      }
      const ins = await dbQuery(
        `INSERT INTO market_media
           (owner_type, owner_id, cloudinary_public_id, secure_url, width, height, format, bytes,
            caption, purpose, sort_order, moderation_status, uploaded_by)
         VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'approved', $12::uuid)
         RETURNING id::text AS id, secure_url AS "secureUrl", purpose, caption, sort_order AS "sortOrder"`,
        [
          ownerType,
          ownerId,
          asset.publicId,
          asset.secureUrl,
          Number(req.body?.width) || null,
          Number(req.body?.height) || null,
          asset.format,
          asset.bytes,
          str(req.body?.caption, 240),
          purpose,
          Number(req.body?.sortOrder) || 0,
          req.authUser.id,
        ]
      );
      audit(req.authUser, "pipeline.media.create", "market_media", ins.rows[0].id, { ownerType, ownerId });
      res.status(201).json({ media: ins.rows[0] });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not save photo." });
    }
  });

  router.patch("/market/media/:id", async (req, res) => {
    if (!requireDb(res)) return;
    const r = await dbQuery(
      `SELECT id::text AS id, owner_type AS "ownerType", owner_id::text AS "ownerId"
         FROM market_media WHERE id = $1::uuid`,
      [req.params.id]
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: "Photo not found." });
    const owned = await assertMediaOwner(req.authUser, row.ownerType, row.ownerId);
    if (owned.error) return res.status(owned.error.status).json(owned.error.body);
    const purpose = req.body?.purpose != null ? str(req.body.purpose, 40) : null;
    try {
      if (purpose === "cover") {
        await dbQuery(
          `UPDATE market_media SET purpose = 'gallery' WHERE owner_type = $1 AND owner_id = $2::uuid AND purpose = 'cover'`,
          [row.ownerType, row.ownerId]
        );
      }
      await dbQuery(
        `UPDATE market_media SET
            caption = COALESCE($2, caption),
            purpose = COALESCE($3, purpose),
            sort_order = COALESCE($4, sort_order)
          WHERE id = $1::uuid`,
        [
          req.params.id,
          req.body?.caption !== undefined ? str(req.body.caption, 240) : null,
          purpose,
          req.body?.sortOrder != null ? Number(req.body.sortOrder) : null,
        ]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not update photo." });
    }
  });

  router.delete("/market/media/:id", async (req, res) => {
    if (!requireDb(res)) return;
    const r = await dbQuery(
      `SELECT id::text AS id, owner_type AS "ownerType", owner_id::text AS "ownerId",
              cloudinary_public_id AS "publicId"
         FROM market_media WHERE id = $1::uuid`,
      [req.params.id]
    );
    const row = r.rows[0];
    if (!row) return res.status(404).json({ error: "Photo not found." });
    const owned = await assertMediaOwner(req.authUser, row.ownerType, row.ownerId);
    if (owned.error) return res.status(owned.error.status).json(owned.error.body);
    try {
      await dbQuery(`DELETE FROM market_media WHERE id = $1::uuid`, [req.params.id]);
      void destroyCloudinaryAsset(row.publicId).catch(() => {});
      audit(req.authUser, "pipeline.media.delete", "market_media", req.params.id, {});
      res.json({ ok: true });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not delete photo." });
    }
  });

  // ——— Scout capture ———

  router.get("/market/scout/farms", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canScoutPipeline(req.authUser)) return res.status(403).json({ error: "Not allowed." });
    const q = str(req.query.q, 120);
    try {
      const r = await dbQuery(
        `SELECT ${FARM_PROFILE_SELECT}
           FROM farm_profiles fp
          WHERE ($1::boolean = true OR fp.scouted_by = $2::uuid OR fp.company_id IS NULL)
            AND ($3::text IS NULL
                 OR fp.display_name ILIKE $3
                 OR fp.district ILIKE $3
                 OR fp.slug ILIKE $3)
          ORDER BY fp.updated_at DESC
          LIMIT 80`,
        [canAccessPipelineDesk(req.authUser), req.authUser.id, q ? `%${q}%` : null]
      );
      res.json({ farms: r.rows.map(mapFarmProfileRow) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not list farms." });
    }
  });

  router.post("/market/scout/farms", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canScoutPipeline(req.authUser)) return res.status(403).json({ error: "Not allowed." });
    const displayName = str(req.body?.displayName ?? req.body?.farmLabel, 160);
    const district = str(req.body?.district, 120);
    if (!displayName) return res.status(400).json({ error: "Farm name is required." });
    if (!district) return res.status(400).json({ error: "District is required." });
    try {
      const slug = await uniqueSlug(displayName);
      const ins = await dbQuery(
        `INSERT INTO farm_profiles
           (slug, display_name, story, district, location_label, contact_phone, contact_whatsapp,
            specialties, slaughter_available, delivery_available, verification_status,
            published, consent_status, scouted_by, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, 'pending', false, 'none', $11::uuid, $11::uuid)
         RETURNING id::text AS id`,
        [
          slug,
          displayName,
          str(req.body?.story, 4000),
          district,
          str(req.body?.locationLabel, 200),
          str(req.body?.contactPhone, 40),
          str(req.body?.contactWhatsapp, 40),
          normalizeSpecialties(req.body?.specialties),
          bool(req.body?.slaughterAvailable, false),
          bool(req.body?.deliveryAvailable, false),
          req.authUser.id,
        ]
      );
      const profile = await loadProfileById(ins.rows[0].id);
      audit(req.authUser, "pipeline.scout.farm", "farm_profile", profile.id, {});
      res.status(201).json({ profile });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not record farm." });
    }
  });

  router.get("/market/scout/farms/:id", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canScoutPipeline(req.authUser)) return res.status(403).json({ error: "Not allowed." });
    const profile = await loadProfileById(req.params.id);
    if (!profile) return res.status(404).json({ error: "Farm not found." });
    if (!canMutateProfile(req.authUser, profile) && !canAccessPipelineDesk(req.authUser)) {
      return res.status(403).json({ error: "Not allowed." });
    }
    const [media, visits] = await Promise.all([
      loadMedia("farm_profile", profile.id),
      dbQuery(
        `SELECT id::text AS id, visited_at AS "visitedAt", notes, consent_recorded AS "consentRecorded",
                status, lot_id::text AS "lotId"
           FROM farm_visits WHERE farm_profile_id = $1::uuid ORDER BY visited_at DESC LIMIT 20`,
        [profile.id]
      ),
    ]);
    res.json({ profile, media, visits: visits.rows });
  });

  router.post("/market/scout/farms/:id/visits", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canScoutPipeline(req.authUser)) return res.status(403).json({ error: "Not allowed." });
    const profile = await loadProfileById(req.params.id);
    if (!profile) return res.status(404).json({ error: "Farm not found." });
    if (!canMutateProfile(req.authUser, profile) && !canAccessPipelineDesk(req.authUser)) {
      return res.status(403).json({ error: "Not allowed." });
    }
    const consentRecorded = bool(req.body?.consentRecorded, false);
    try {
      if (consentRecorded && profile.consentStatus !== "granted") {
        await dbQuery(
          `UPDATE farm_profiles SET
              consent_status = 'pending',
              consent_source = 'scout',
              consent_name = $2,
              consent_phone = $3,
              updated_at = now()
            WHERE id = $1::uuid`,
          [profile.id, str(req.body?.consentName, 160), str(req.body?.consentPhone, 40)]
        );
      }
      const ins = await dbQuery(
        `INSERT INTO farm_visits
           (farm_profile_id, scout_user_id, notes, consent_recorded, status, lot_id)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'submitted', $5::uuid)
         RETURNING id::text AS id, visited_at AS "visitedAt"`,
        [
          profile.id,
          req.authUser.id,
          str(req.body?.notes, 4000),
          consentRecorded,
          str(req.body?.lotId, 64),
        ]
      );
      audit(req.authUser, "pipeline.scout.visit", "farm_visit", ins.rows[0].id, { farmProfileId: profile.id });
      res.status(201).json({ visit: ins.rows[0], profile: await loadProfileById(profile.id) });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not save visit." });
    }
  });

  router.post("/market/scout/farms/:id/invite", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canScoutPipeline(req.authUser) && !canAccessPipelineDesk(req.authUser)) {
      return res.status(403).json({ error: "Not allowed." });
    }
    const profile = await loadProfileById(req.params.id);
    if (!profile) return res.status(404).json({ error: "Farm not found." });
    if (profile.companyId) return res.status(400).json({ error: "This farm is already claimed." });
    const email = str(req.body?.email, 160);
    const phone = str(req.body?.phone, 40);
    if (!email && !phone) return res.status(400).json({ error: "Email or phone is required." });
    try {
      const token = createClaimToken();
      await dbQuery(
        `INSERT INTO farm_profile_claims (farm_profile_id, invited_email, invited_phone, token)
         VALUES ($1::uuid, $2, $3, $4)`,
        [profile.id, email, phone, token]
      );
      await dbQuery(
        `UPDATE farm_profiles SET claim_email = $2, claim_token = $3, updated_at = now() WHERE id = $1::uuid`,
        [profile.id, email, token]
      );
      const origin = String(process.env.FRONTEND_URL || "").replace(/\/$/, "");
      if (email) {
        await notifyMany([{ email, fullName: profile.displayName }], () =>
          buildFarmClaimEmail({
            name: profile.displayName,
            claimUrl: origin ? `${origin}/signup?claim=${token}` : token,
            farmName: profile.displayName,
          })
        );
      }
      audit(req.authUser, "pipeline.scout.invite", "farm_profile", profile.id, {});
      res.status(201).json({ ok: true, token });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not send invite." });
    }
  });

  // ——— Ops profile verify ———

  router.get("/verify/profiles", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    try {
      const r = await dbQuery(
        `SELECT ${FARM_PROFILE_SELECT}
           FROM farm_profiles fp
          WHERE fp.verification_status = 'pending'
             OR (fp.consent_status = 'pending' AND fp.published = false)
          ORDER BY fp.created_at ASC
          LIMIT 100`
      );
      const items = [];
      for (const row of r.rows) {
        const profile = mapFarmProfileRow(row);
        items.push({ profile, media: await loadMedia("farm_profile", profile.id) });
      }
      res.json({ profiles: items });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not load profiles." });
    }
  });

  router.post("/verify/profile/:id", async (req, res) => {
    if (!requireDb(res) || !requireDesk(req, res)) return;
    const status = str(req.body?.status, 20);
    if (!["verified", "rejected"].includes(status)) {
      return res.status(400).json({ error: "status must be verified or rejected." });
    }
    try {
      const profile = await loadProfileById(req.params.id);
      if (!profile) return res.status(404).json({ error: "Farm not found." });
      await dbQuery(
        `UPDATE farm_profiles SET
            verification_status = $2,
            verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE NULL END,
            verified_by = $3::uuid,
            published = CASE WHEN $2 = 'rejected' THEN false ELSE published END,
            updated_at = now()
          WHERE id = $1::uuid`,
        [req.params.id, status, req.authUser.id]
      );
      if (status === "verified" && str(req.body?.grantConsent, 10) === "true") {
        await dbQuery(
          `UPDATE farm_profiles SET consent_status = 'granted', consent_source = 'ops', consent_at = now()
            WHERE id = $1::uuid AND consent_status <> 'granted'`,
          [req.params.id]
        );
      }
      audit(req.authUser, "pipeline.verify.profile", "farm_profile", req.params.id, { status });
      const next = await loadProfileById(req.params.id);
      res.json({ ok: true, profile: next });
      if (status === "verified" && next.companyId) {
        void emailsForCompanyAdmins(dbQuery, next.companyId)
          .then((admins) => notifyMany(admins, (u) => buildFarmVerifiedEmail({ name: u.fullName })))
          .catch(() => {});
      }
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not verify profile." });
    }
  });

  void hasDb;
  void emailForUserId;
}
