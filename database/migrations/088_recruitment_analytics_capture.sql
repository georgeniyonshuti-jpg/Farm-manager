-- Capture for recruitment analytics: links, spend, versioned targets, events.
-- Does not delete or rewrite historical rows.
-- Undo (run only if you mean to remove this capture layer):
--   remove tables recruitment_usage, recruitment_action_dismissals,
--   recruitment_briefings, person_events, recruitment_targets, ad_spend,
--   tracked_links, scout_referral_codes;
--   ALTER TABLE people_onboarding
--     DROP COLUMN IF EXISTS self_reported_source,
--     DROP COLUMN IF EXISTS referred_by_scout_id,
--     DROP COLUMN IF EXISTS first_touch_channel,
--     DROP COLUMN IF EXISTS first_touch_campaign,
--     DROP COLUMN IF EXISTS first_touch_at,
--     DROP COLUMN IF EXISTS visitor_id,
--     DROP COLUMN IF EXISTS is_internal,
--     DROP COLUMN IF EXISTS is_synthetic;
--   ALTER TABLE market_reach DROP COLUMN IF EXISTS link_code;
-- Then re-apply the view from 087_analytics_person_facts.sql.

CREATE TABLE IF NOT EXISTS tracked_links (
  code          TEXT PRIMARY KEY,
  channel       TEXT NOT NULL,
  campaign      TEXT,
  creative      TEXT,
  target_role   TEXT,
  destination   TEXT NOT NULL,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scout_referral_codes (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code        TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_spend (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date          DATE NOT NULL,
  channel       TEXT NOT NULL,
  campaign      TEXT,
  amount_rwf    INTEGER NOT NULL CHECK (amount_rwf >= 0),
  impressions   INTEGER,
  clicks        INTEGER,
  entered_by    UUID,
  entered_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_date_channel ON ad_spend (date, channel);

CREATE TABLE IF NOT EXISTS recruitment_targets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role            TEXT NOT NULL,
  metric          TEXT NOT NULL,
  scope           TEXT NOT NULL CHECK (scope IN ('team', 'per_scout')),
  value           NUMERIC NOT NULL,
  effective_from  DATE NOT NULL,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruitment_targets_metric
  ON recruitment_targets (metric, effective_from);

CREATE TABLE IF NOT EXISTS person_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    TEXT NOT NULL,
  role         TEXT NOT NULL,
  type         TEXT NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL,
  actor_id     TEXT,
  source       TEXT NOT NULL CHECK (source IN ('system', 'staff', 'import')),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_person_events_person_time
  ON person_events (person_id, occurred_at);

CREATE TABLE IF NOT EXISTS recruitment_briefings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start   DATE NOT NULL UNIQUE,
  snapshot     JSONB NOT NULL,
  notes        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recruitment_action_dismissals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id      TEXT NOT NULL,
  week_start   DATE NOT NULL,
  reason       TEXT NOT NULL,
  actor_id     UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recruitment_usage (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  role   TEXT NOT NULL,
  tab    TEXT NOT NULL
);

ALTER TABLE people_onboarding
  ADD COLUMN IF NOT EXISTS self_reported_source TEXT,
  ADD COLUMN IF NOT EXISTS referred_by_scout_id UUID,
  ADD COLUMN IF NOT EXISTS first_touch_channel TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_campaign TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visitor_id TEXT,
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE market_reach
  ADD COLUMN IF NOT EXISTS link_code TEXT;

CREATE INDEX IF NOT EXISTS idx_people_onboarding_created
  ON people_onboarding (created_at);

CREATE INDEX IF NOT EXISTS idx_people_onboarding_first_touch
  ON people_onboarding (first_touch_channel, created_at);

-- Replace the view so first touch, self-report, and synthetic flags are read.
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
    WHEN rc.stage IN ('unreachable', 'not_a_fit') THEN rc.stage
    WHEN r.onboarding_stage IN ('unreachable', 'not_a_fit') THEN r.onboarding_stage
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

-- Backfill events from timestamps that already exist. Safe to re-run.
INSERT INTO person_events (person_id, role, type, occurred_at, actor_id, source, payload)
SELECT person_id, role, 'account_created', created_at, 'system', 'import', '{"backfill":"088"}'::jsonb
  FROM analytics.person_facts f
 WHERE NOT EXISTS (
   SELECT 1 FROM person_events e
    WHERE e.person_id = f.person_id AND e.role = f.role AND e.type = 'account_created' AND e.source = 'import'
 );

INSERT INTO person_events (person_id, role, type, occurred_at, actor_id, source, payload)
SELECT person_id, role, 'listing_live', activated_at, 'system', 'import', '{"backfill":"088"}'::jsonb
  FROM analytics.person_facts f
 WHERE role = 'seller'
   AND activated_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM person_events e
      WHERE e.person_id = f.person_id AND e.type = 'listing_live' AND e.source = 'import'
   );
