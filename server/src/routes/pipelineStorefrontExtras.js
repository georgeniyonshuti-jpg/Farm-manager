/**
 * Storefront APIs: farm profiles, Cloudinary media, scout capture, claims, verify profiles.
 */

import {
  FARM_PROFILE_SELECT,
  canPublishProfile,
  createClaimToken,
  createUniqueFarmSlug,
  isMarketOnlySeller,
  scoutReadyGate,
  loadProfileForFarmer as loadOwnedProfileForFarmer,
  mapFarmProfileRow,
  normalizeSpecialties,
} from "../services/pipeline/farmProfiles.js";
import { normalizePlace } from "../services/pipeline/rwandaLocations.js";
import { recruitmentTradingGate } from "../services/pipeline/recruitmentContacts.js";
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
  claimSignupUrl,
  marketPublicOrigin,
  executeSellerClaim,
  hashClaimToken,
  sellerStatusChips,
} from "../services/pipeline/sellerClaim.js";
import {
  canAccessPipelineDesk,
  canListFarmerLots,
  canScoutPipeline,
} from "../services/pipeline/pipeline.js";
import { loadMarketHostCompany } from "../services/pipeline/marketHostCompany.js";

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
    const located = normalizePlace(body.district, body.sector, { sectorRequiredWithDistrict: true });
    if (!located.ok) return res.status(400).json({ error: located.error, code: located.code });
    try {
      let profile = await loadProfileForFarmer(req.authUser);
      const specialties = normalizeSpecialties(body.specialties);
      if (!profile) {
        const slug = await uniqueSlug(displayName);
        const ins = await dbQuery(
          `INSERT INTO farm_profiles
             (company_id, slug, display_name, story, district, sector, location_label, exact_location,
              contact_phone, contact_whatsapp, contact_email, specialties,
              slaughter_available, delivery_available, disclose_contact,
              disclose_exact_location, disclose_exact_price, created_by, owner_user_id)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text[], $13, $14, $15, $16, $17, $18::uuid, $19::uuid)
           RETURNING id::text AS id`,
          [
            req.authUser.companyId,
            slug,
            displayName,
            str(body.story, 4000),
            located.district,
            located.sector,
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
              sector = $16,
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
            located.district,
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
            located.sector,
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
      return res.status(403).json({ error: "Seller account required." });
    }
    const rawToken = str(req.body?.token, 80);
    if (!rawToken) return res.status(400).json({ error: "Invite link is required." });
    try {
      const host = await loadMarketHostCompany(dbQuery);
      if (!host.ok) {
        return res.status(503).json({ error: host.error || "Market signup is unavailable." });
      }
      const claimed = await executeSellerClaim(dbQuery, {
        rawToken,
        userId: req.authUser.id,
        email: req.authUser.email,
        hostCompanyId: host.company.id,
        marketOnly: isMarketOnlySeller(req.authUser),
      });
      if (!claimed.ok) {
        return res.status(claimed.status || 400).json({ error: claimed.message, code: claimed.code });
      }
      audit(req.authUser, "pipeline.profile.claim", "farm_profile", claimed.profileId, {
        action: claimed.action,
      });
      res.json({ profile: await loadProfileById(claimed.profileId), action: claimed.action });
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
      const desk = canAccessPipelineDesk(req.authUser);
      const r = await dbQuery(
        `SELECT ${FARM_PROFILE_SELECT},
                c.status AS "claimStatus",
                l.id::text AS "lotId",
                l.bird_count AS "birdCount",
                l.breed_code AS "breedCode",
                l.ready_from AS "readyFrom",
                l.ready_to AS "readyTo",
                l.verification_status AS "lotVerification",
                l.scout_confirmed_at AS "scoutConfirmedAt",
                l.scouted_by::text AS "lotScoutedBy"
           FROM farm_profiles fp
           LEFT JOIN LATERAL (
             SELECT status FROM farm_profile_claims
              WHERE farm_profile_id = fp.id
              ORDER BY created_at DESC
              LIMIT 1
           ) c ON true
           LEFT JOIN LATERAL (
             SELECT id, bird_count, breed_code, ready_from, ready_to, verification_status, scout_confirmed_at, scouted_by
               FROM pipeline_lots
              WHERE farm_profile_id = fp.id AND status <> 'cancelled'
              ORDER BY created_at DESC
              LIMIT 1
           ) l ON true
          WHERE ($1::boolean = true OR fp.scouted_by = $2::uuid OR EXISTS (
                  SELECT 1 FROM pipeline_lots al
                   WHERE al.farm_profile_id = fp.id
                     AND al.assigned_scout_user_id = $2::uuid
                     AND al.status <> 'cancelled'
                ))
            AND ($3::text IS NULL
                 OR fp.display_name ILIKE $3
                 OR fp.district ILIKE $3
                 OR fp.slug ILIKE $3)
          ORDER BY fp.updated_at DESC
          LIMIT 80`,
        [desk, req.authUser.id, q ? `%${q}%` : null]
      );
      const farms = r.rows.map((row) => {
        const profile = mapFarmProfileRow(row);
        const chips = sellerStatusChips({
          ownerUserId: profile.ownerUserId,
          claimStatus: row.claimStatus,
          lotVerification: row.lotVerification,
          consentStatus: profile.consentStatus,
          profileVerification: profile.verificationStatus,
        });
        return {
          ...profile,
          claimStatus: row.claimStatus || null,
          statusChips: chips,
          lotId: row.lotId || null,
          birdCount: row.birdCount != null ? Number(row.birdCount) : null,
          breedCode: row.breedCode || null,
          readyFrom: row.readyFrom || null,
          readyTo: row.readyTo || null,
          lotVerification: row.lotVerification || null,
          scoutConfirmedAt: row.scoutConfirmedAt || null,
        };
      });
      res.json({ farms });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not list farms." });
    }
  });

  router.post("/market/scout/farms", async (req, res) => {
    if (!requireDb(res)) return;
    if (!canScoutPipeline(req.authUser)) return res.status(403).json({ error: "Not allowed." });
    if (req.authUser.role === "vet" || req.authUser.role === "vet_manager") {
      const app = await dbQuery(
        `SELECT status FROM scout_applications WHERE user_id = $1::uuid`,
        [req.authUser.id]
      ).catch(() => ({ rows: [] }));
      const trade = await recruitmentTradingGate(dbQuery, req.authUser.id);
      if (!trade.allow && trade.code === "kyc_required") {
        return res.status(403).json({ error: trade.error, code: trade.code });
      }
      const gate = scoutReadyGate(app.rows[0]?.status);
      if (!gate.allow) return res.status(403).json({ error: gate.error });
    }
    const displayName = str(req.body?.displayName ?? req.body?.farmLabel, 160);
    const district = str(req.body?.district, 120);
    const located = normalizePlace(district, req.body?.sector, { required: true });
    if (!displayName) return res.status(400).json({ error: "Farm name is required." });
    if (!located.ok) return res.status(400).json({ error: located.error, code: located.code });
    try {
      const slug = await uniqueSlug(displayName);
      const ins = await dbQuery(
        `INSERT INTO farm_profiles
           (slug, display_name, story, district, sector, location_label, contact_phone, contact_whatsapp,
            specialties, slaughter_available, delivery_available, verification_status,
            published, consent_status, scouted_by, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, 'pending', false, 'none', $12::uuid, $12::uuid)
         RETURNING id::text AS id`,
        [
          slug,
          displayName,
          str(req.body?.story, 4000),
          located.district,
          located.sector,
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
    if (
      profile.scoutedBy !== req.authUser.id &&
      !canMutateProfile(req.authUser, profile) &&
      !canAccessPipelineDesk(req.authUser)
    ) {
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
      const { emitCrmMilestone } = await import("../services/pipeline/crmBridge.js");
      void emitCrmMilestone({
        eventType: "visit.completed",
        entities: [{ type: "farm_profile", id: profile.id }],
      });
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
    if (profile.companyId && profile.ownerUserId) {
      return res.status(400).json({ error: "This seller already has an account." });
    }
    const email = str(req.body?.email, 160);
    const phone = str(req.body?.phone, 40);
    const origin = marketPublicOrigin();
    if (!origin) {
      return res.status(503).json({
        error: "FRONTEND_URL is not set. An admin must set it before invite links work.",
      });
    }
    try {
      const recent = await dbQuery(
        `SELECT created_at AS "createdAt" FROM farm_profile_claims
          WHERE farm_profile_id = $1::uuid AND status = 'pending'
          ORDER BY created_at DESC LIMIT 1`,
        [profile.id]
      );
      if (recent.rows[0]?.createdAt) {
        const age = Date.now() - new Date(recent.rows[0].createdAt).getTime();
        if (age >= 0 && age < 20_000) {
          return res.status(429).json({ error: "Wait a few seconds before sending another invite link." });
        }
      }
      const token = createClaimToken();
      const tokenHash = hashClaimToken(token);
      const url = claimSignupUrl(origin, token);
      if (!url.ok) {
        return res.status(503).json({ error: url.error });
      }
      await dbQuery(
        `UPDATE farm_profile_claims SET status = 'revoked'
          WHERE farm_profile_id = $1::uuid AND status = 'pending'`,
        [profile.id]
      );
      await dbQuery(
        `INSERT INTO farm_profile_claims
           (farm_profile_id, invited_email, invited_phone, token, token_hash, expires_at)
         VALUES ($1::uuid, $2, $3, $4, $4, now() + interval '14 days')`,
        [profile.id, email || null, phone || null, tokenHash]
      );
      await dbQuery(
        `UPDATE farm_profiles SET claim_email = $2, claim_token = NULL, updated_at = now() WHERE id = $1::uuid`,
        [profile.id, email || null]
      );
      let emailSent = false;
      let emailError = null;
      if (email) {
        try {
          await notifyMany([{ email, fullName: profile.displayName }], () =>
            buildFarmClaimEmail({
              name: profile.displayName,
              claimUrl: url.url,
              farmName: profile.displayName,
            })
          );
          emailSent = true;
        } catch (err) {
          emailError = err instanceof Error ? err.message : "Email could not be sent.";
        }
      }
      audit(req.authUser, "pipeline.scout.invite", "farm_profile", profile.id, { emailSent });
      res.status(201).json({ ok: true, url: url.url, emailSent, emailError });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : "Could not create invite link." });
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
    const reason = str(req.body?.reason, 500);
    if (!["verified", "rejected"].includes(status)) {
      return res.status(400).json({ error: "status must be verified or rejected." });
    }
    if (status === "rejected" && !reason) {
      return res.status(400).json({ error: "A reason is required to reject a farm." });
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
            rejection_reason = CASE WHEN $2 = 'rejected' THEN $4 ELSE NULL END,
            updated_at = now()
          WHERE id = $1::uuid`,
        [req.params.id, status, req.authUser.id, reason || null]
      );
      if (status === "verified" && str(req.body?.grantConsent, 10) === "true") {
        await dbQuery(
          `UPDATE farm_profiles SET consent_status = 'granted', consent_source = 'ops', consent_at = now()
            WHERE id = $1::uuid AND consent_status <> 'granted'`,
          [req.params.id]
        );
      }
      audit(req.authUser, "pipeline.verify.profile", "farm_profile", req.params.id, { status });
      if (status === "verified") {
        const { emitCrmMilestone } = await import("../services/pipeline/crmBridge.js");
        void emitCrmMilestone({
          eventType: "seller.verified",
          entities: [{ type: "farm_profile", id: req.params.id }],
        });
      }
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
