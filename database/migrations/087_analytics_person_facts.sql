-- Read-only person facts for recruitment analytics.
-- One row per normalised phone and role. The earliest account is kept.
-- Undo:
--   DROP VIEW IF EXISTS analytics.person_facts;
--   DROP FUNCTION IF EXISTS analytics.normalise_rw_phone(text);
--   DROP SCHEMA IF EXISTS analytics;

CREATE SCHEMA IF NOT EXISTS analytics;

CREATE OR REPLACE FUNCTION analytics.normalise_rw_phone(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN digits ~ '^7[0-9]{8}$' THEN '+250' || digits
    WHEN digits ~ '^0(7[0-9]{8})$' THEN '+250' || substring(digits from 2)
    WHEN digits ~ '^2507[0-9]{8}$' THEN '+' || digits
    WHEN digits ~ '^\+2507[0-9]{8}$' THEN digits
    ELSE NULL
  END
  FROM (
    SELECT regexp_replace(COALESCE(raw, ''), '[^0-9+]', '', 'g') AS digits
  ) s;
$$;

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
    po.account_type,
    po.created_at,
    po.source,
    po.utm_campaign,
    po.district,
    po.stage AS onboarding_stage,
    po.last_touch_at,
    analytics.normalise_rw_phone(po.phone) AS phone_e164,
    u.email,
    u.full_name,
    (
      COALESCE(u.email, '') ~* '@(demo\.com|example\.com|mailinator\.com|test\.com)$'
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
  NULLIF(lower(btrim(r.source)), '') AS first_touch_channel,
  r.utm_campaign AS first_touch_campaign,
  NULL::timestamptz AS first_touch_at,
  NULL::text AS self_reported_source,
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
  GREATEST(
    r.created_at,
    r.last_touch_at,
    rc.last_touch_at
  ) AS last_activity_at,
  CASE
    WHEN rc.stage IN ('unreachable', 'not_a_fit') THEN rc.stage
    WHEN r.onboarding_stage IN ('unreachable', 'not_a_fit') THEN r.onboarding_stage
    ELSE 'applied'
  END AS raw_stage,
  r.district,
  r.is_internal,
  false AS is_synthetic,
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
  NULL::uuid AS referred_by_scout_id,
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

COMMENT ON VIEW analytics.person_facts IS
  'One recruitment person per phone and role. Metrics read this view; widgets do not query around it.';
