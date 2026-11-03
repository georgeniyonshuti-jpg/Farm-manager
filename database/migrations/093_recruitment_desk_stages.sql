-- Five desk stages, plus a status tag. No rows are deleted.
-- application stays application.
-- call_scheduled, called, follow_up, unreachable become contact with that status.
-- kyc stays kyc. Docs pending / Docs received are computed from the KYC columns.
-- not_a_fit becomes closed / not_a_fit.
-- active (approved and live) becomes onboarded.
-- Duplicate is a closed status for later moves. Nobody is auto-closed.
--
-- Back up first:
--   pg_dump "$DATABASE_URL" -Fc -f recruitment-before-093.dump
-- Do not run this file until that backup exists.
--
-- Undo (run only if you need the old stages back):
-- UPDATE recruitment_contacts SET stage = CASE
--   WHEN stage = 'contact' AND desk_status = 'call_scheduled' THEN 'call_scheduled'
--   WHEN stage = 'contact' AND desk_status = 'follow_up' THEN 'follow_up'
--   WHEN stage = 'contact' AND desk_status = 'unreachable' THEN 'unreachable'
--   WHEN stage = 'contact' THEN 'called'
--   WHEN stage = 'closed' AND desk_status = 'unreachable' THEN 'unreachable'
--   WHEN stage = 'closed' THEN 'not_a_fit'
--   WHEN stage = 'onboarded' THEN 'active'
--   ELSE stage
-- END;
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_stage_check;
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_desk_status_check;
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_desk_stage_status_check;
-- ALTER TABLE recruitment_contacts DROP COLUMN IF EXISTS desk_status;
-- ALTER TABLE recruitment_contacts ADD CONSTRAINT recruitment_contacts_stage_check
--   CHECK (stage IN (
--     'application', 'call_scheduled', 'called', 'follow_up', 'kyc',
--     'active', 'unreachable', 'not_a_fit'
--   ));
-- ALTER TABLE recruitment_contacts ALTER COLUMN stage SET DEFAULT 'application';
-- Then re-apply the analytics.person_facts view from migration 088.

ALTER TABLE recruitment_contacts
  ADD COLUMN IF NOT EXISTS desk_status TEXT;

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_stage_check;
ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_desk_status_check;
ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_desk_stage_status_check;

UPDATE recruitment_contacts
   SET desk_status = CASE stage
     WHEN 'call_scheduled' THEN 'call_scheduled'
     WHEN 'called' THEN 'called'
     WHEN 'follow_up' THEN 'follow_up'
     WHEN 'unreachable' THEN 'unreachable'
     WHEN 'not_a_fit' THEN 'not_a_fit'
     ELSE desk_status
   END
 WHERE stage IN ('call_scheduled', 'called', 'follow_up', 'unreachable', 'not_a_fit');

UPDATE recruitment_contacts
   SET stage = CASE stage
     WHEN 'call_scheduled' THEN 'contact'
     WHEN 'called' THEN 'contact'
     WHEN 'follow_up' THEN 'contact'
     WHEN 'unreachable' THEN 'contact'
     WHEN 'not_a_fit' THEN 'closed'
     WHEN 'active' THEN 'onboarded'
     ELSE stage
   END
 WHERE stage IN ('call_scheduled', 'called', 'follow_up', 'unreachable', 'not_a_fit', 'active');

ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_stage_check
  CHECK (stage IN ('application', 'contact', 'kyc', 'onboarded', 'closed'));

ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_desk_stage_status_check
  CHECK (
    (stage = 'contact' AND desk_status IN ('call_scheduled', 'called', 'follow_up', 'unreachable'))
    OR (stage = 'closed' AND desk_status IN ('not_a_fit', 'unreachable', 'duplicate'))
    OR (stage IN ('application', 'kyc', 'onboarded') AND desk_status IS NULL)
  );

ALTER TABLE recruitment_contacts ALTER COLUMN stage SET DEFAULT 'application';

-- Unreachable still leaves the analytics funnel. Closed (including Duplicate) counts as not a fit.

CREATE OR REPLACE VIEW analytics.person_facts AS
WITH base AS (
  SELECT
    po.user_id,
    CASE po.account_type
      WHEN 'farmer' THEN 'seller'
      WHEN 'buyer' THEN 'buyer'
      WHEN 'scout' THEN 'scout'
      ELSE po.account_type
    END AS role,
    po.created_at,
    po.source,
    po.utm_campaign,
    po.district,
    po.stage AS onboarding_stage,
    po.last_touch_at,
    po.first_touch_channel,
    po.first_touch_campaign,
    po.first_touch_at,
    po.self_reported_source,
    po.referred_by_scout_id,
    po.visitor_id,
    po.is_internal AS flagged_internal,
    po.is_synthetic,
    analytics.normalise_rw_phone(po.phone) AS phone_e164,
    u.email,
    u.full_name,
    (
      po.is_internal
      OR COALESCE(u.email, '') ~* '@(demo\.com|example\.com|mailinator\.com|test\.com)$'
      OR split_part(lower(COALESCE(u.email, '')), '@', 1) ~ '^(demo|test|fake|sample)([.+_-]|$)'
      OR lower(btrim(COALESCE(u.full_name, ''))) IN (
        'cleva tech farm', 'demo farm', 'test farm', 'sample farm', 'default farm'
      )
    ) AS is_internal
  FROM people_onboarding po
  JOIN users u ON u.id = po.user_id
),
ranked AS (
  SELECT
    b.*,
    row_number() OVER (
      PARTITION BY b.role, COALESCE(b.phone_e164, b.user_id::text)
      ORDER BY b.created_at, b.user_id
    ) AS rn,
    CASE
      WHEN b.phone_e164 IS NULL THEN 1
      ELSE count(*) OVER (PARTITION BY b.role, b.phone_e164)
    END AS phone_n
  FROM base b
)
SELECT
  r.user_id::text AS person_id,
  r.role,
  r.created_at,
  COALESCE(NULLIF(lower(btrim(r.first_touch_channel)), ''), NULLIF(lower(btrim(r.source)), '')) AS first_touch_channel,
  COALESCE(r.first_touch_campaign, r.utm_campaign) AS first_touch_campaign,
  r.first_touch_at,
  r.self_reported_source,
  (
    SELECT MIN(mr.created_at)
      FROM signup_attempts sa
      JOIN market_reach mr
        ON mr.visitor_hash = sa.visitor_hash
       AND mr.event_type = 'opened'
     WHERE sa.user_id = r.user_id
       AND sa.outcome = 'succeeded'
       AND sa.visitor_hash IS NOT NULL
  ) AS link_open_at,
  (
    SELECT MIN(mr.created_at)
      FROM signup_attempts sa
      JOIN market_reach mr
        ON mr.visitor_hash = sa.visitor_hash
       AND mr.event_type = 'join_started'
     WHERE sa.user_id = r.user_id
       AND sa.outcome = 'succeeded'
       AND sa.visitor_hash IS NOT NULL
  ) AS signup_started_at,
  COALESCE(rc.created_at, r.created_at) AS application_submitted_at,
  (
    SELECT MIN(t.created_at)
      FROM recruitment_touches t
     WHERE t.contact_id = rc.id
       AND t.outcome = 'reached'
  ) AS contacted_at,
  CASE
    WHEN rc.kyc_contract_status = 'approved'
     AND rc.kyc_location_status = 'approved'
     AND rc.kyc_payment_status = 'approved'
     AND rc.kyc_identity_status = 'approved'
    THEN rc.updated_at
    ELSE NULL
  END AS kyc_verified_at,
  CASE
    WHEN r.role = 'seller' THEN (
      SELECT MIN(COALESCE(l.verified_at, l.created_at))
        FROM pipeline_lots l
        LEFT JOIN farm_profiles fp ON fp.id = l.farm_profile_id
       WHERE l.status IN ('open', 'partial')
         AND l.verification_status = 'verified'
         AND (
           fp.owner_user_id = r.user_id
           OR l.created_by = r.user_id
           OR l.listed_by = r.user_id
         )
    )
    WHEN r.role = 'buyer' THEN (
      SELECT LEAST(dmd.at, led.at, mat.at)
        FROM pipeline_buyers pb
        LEFT JOIN LATERAL (
          SELECT MIN(created_at) AS at FROM pipeline_demands WHERE buyer_id = pb.id
        ) dmd ON true
        LEFT JOIN LATERAL (
          SELECT MIN(created_at) AS at FROM market_leads WHERE buyer_id = pb.id
        ) led ON true
        LEFT JOIN LATERAL (
          SELECT MIN(created_at) AS at FROM pipeline_matches WHERE buyer_id = pb.id
        ) mat ON true
       WHERE pb.user_id = r.user_id
    )
    WHEN r.role = 'scout' THEN (
      SELECT MIN(COALESCE(l.verified_at, l.created_at))
        FROM pipeline_lots l
        JOIN scout_applications sa ON sa.user_id = r.user_id AND sa.status = 'approved'
       WHERE l.scouted_by = r.user_id
         AND l.verification_status = 'verified'
    )
    ELSE NULL
  END AS activated_at,
  CASE
    WHEN r.role = 'seller' THEN (
      SELECT MIN(l.created_at)
        FROM pipeline_lots l
        LEFT JOIN farm_profiles fp ON fp.id = l.farm_profile_id
       WHERE l.status IN ('open', 'partial')
         AND l.verification_status IN ('pending_review', 'rejected')
         AND (
           fp.owner_user_id = r.user_id
           OR l.created_by = r.user_id
           OR l.listed_by = r.user_id
         )
    )
    ELSE NULL
  END AS live_unverified_at,
  CASE
    WHEN r.role = 'seller' THEN (
      SELECT MIN(m.buyer_paid_at)
        FROM pipeline_matches m
        JOIN pipeline_lots l ON l.id = m.lot_id
        LEFT JOIN farm_profiles fp ON fp.id = l.farm_profile_id
       WHERE m.buyer_payment_status = 'paid'
         AND m.buyer_paid_at IS NOT NULL
         AND (
           fp.owner_user_id = r.user_id
           OR l.created_by = r.user_id
           OR l.listed_by = r.user_id
         )
    )
    WHEN r.role = 'buyer' THEN (
      SELECT MIN(m.buyer_paid_at)
        FROM pipeline_matches m
        JOIN pipeline_buyers pb ON pb.id = m.buyer_id
       WHERE pb.user_id = r.user_id
         AND m.buyer_payment_status = 'paid'
         AND m.buyer_paid_at IS NOT NULL
    )
    WHEN r.role = 'scout' THEN (
      SELECT MIN(m.updated_at)
        FROM pipeline_matches m
        JOIN pipeline_lots l ON l.id = m.lot_id
       WHERE l.scouted_by = r.user_id
         AND m.commission_status = 'paid'
    )
    ELSE NULL
  END AS productive_at,
  GREATEST(r.created_at, r.last_touch_at, rc.last_touch_at) AS last_activity_at,
  CASE
    WHEN rc.desk_status = 'unreachable' OR rc.stage = 'unreachable' OR r.onboarding_stage = 'unreachable' THEN 'unreachable'
    WHEN rc.stage = 'closed' OR rc.desk_status IN ('not_a_fit', 'duplicate') OR rc.stage = 'not_a_fit' OR r.onboarding_stage = 'not_a_fit' THEN 'not_a_fit'
    ELSE 'applied'
  END AS raw_stage,
  r.district,
  r.is_internal,
  COALESCE(r.is_synthetic, false) AS is_synthetic,
  EXISTS (
    SELECT 1
      FROM pipeline_lots l
      LEFT JOIN farm_profiles fp ON fp.id = l.farm_profile_id
     WHERE r.role = 'seller'
       AND (fp.owner_user_id = r.user_id OR l.created_by = r.user_id OR l.listed_by = r.user_id)
       AND (
         (l.created_by IS NOT NULL AND l.created_by IS DISTINCT FROM fp.owner_user_id)
         OR (l.listed_by IS NOT NULL AND l.listed_by IS DISTINCT FROM fp.owner_user_id)
       )
  ) AS assisted,
  CASE WHEN r.phone_n > 1 THEN ARRAY['duplicate_phone']::text[] ELSE ARRAY[]::text[] END AS dq_flags,
  r.referred_by_scout_id,
  (
    SELECT sa.reviewed_at
      FROM scout_applications sa
     WHERE sa.user_id = r.user_id
       AND sa.status = 'approved'
  ) AS approved_at,
  r.phone_e164,
  COALESCE(NULLIF(btrim(rc.contact_name), ''), NULLIF(btrim(r.full_name), ''), 'Person') AS display_name
FROM ranked r
LEFT JOIN recruitment_contacts rc
  ON r.phone_e164 IS NOT NULL
 AND rc.phone_e164 = r.phone_e164
WHERE r.rn = 1;

