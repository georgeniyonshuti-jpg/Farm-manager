-- Signups CRM: attempts, people pipeline, call/touch log.
-- Instant accounts: clear scout_pending so scouts can work before the intro call.

CREATE TABLE IF NOT EXISTS signup_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  account_type    TEXT,
  email           TEXT,
  phone           TEXT,
  full_name       TEXT,
  district        TEXT,
  source          TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  click_id_kind   TEXT,
  landing_path    TEXT,
  visitor_hash    TEXT,
  outcome         TEXT NOT NULL
                    CHECK (outcome IN ('succeeded', 'failed')),
  error_code      TEXT,
  error_message   TEXT,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  handled_at      TIMESTAMPTZ,
  handled_by      UUID
);

CREATE INDEX IF NOT EXISTS idx_signup_attempts_created
  ON signup_attempts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_outcome
  ON signup_attempts (outcome, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_attempts_email
  ON signup_attempts (lower(email));

CREATE TABLE IF NOT EXISTS people_onboarding (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  account_type    TEXT NOT NULL
                    CHECK (account_type IN ('farmer', 'buyer', 'scout')),
  phone           TEXT,
  district        TEXT,
  source          TEXT NOT NULL DEFAULT 'unknown',
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  stage           TEXT NOT NULL DEFAULT 'new'
                    CHECK (stage IN (
                      'new', 'contacted', 'call_booked', 'onboarded',
                      'active', 'unreachable', 'not_a_fit'
                    )),
  owner_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  next_call_at    TIMESTAMPTZ,
  last_touch_at   TIMESTAMPTZ,
  is_blocked      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_people_onboarding_stage
  ON people_onboarding (stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_people_onboarding_type
  ON people_onboarding (account_type, stage);
CREATE INDEX IF NOT EXISTS idx_people_onboarding_source
  ON people_onboarding (source, created_at DESC);

CREATE TABLE IF NOT EXISTS onboarding_touches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL
                    CHECK (kind IN ('call', 'whatsapp', 'note')),
  outcome         TEXT
                    CHECK (outcome IS NULL OR outcome IN (
                      'reached', 'no_answer', 'scheduled', 'done'
                    )),
  scheduled_for   TIMESTAMPTZ,
  note            TEXT,
  by_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_touches_user
  ON onboarding_touches (user_id, created_at DESC);

-- Existing market people → onboarding rows (source unknown until they touch again).
INSERT INTO people_onboarding (user_id, account_type, phone, district, source, stage)
SELECT u.id,
       'scout',
       sa.phone,
       sa.district,
       'unknown',
       CASE
         WHEN sa.status = 'approved' THEN 'onboarded'
         WHEN sa.status = 'rejected' THEN 'not_a_fit'
         ELSE 'new'
       END
  FROM scout_applications sa
  JOIN users u ON u.id = sa.user_id
 ON CONFLICT (user_id) DO NOTHING;

INSERT INTO people_onboarding (user_id, account_type, phone, district, source, stage)
SELECT u.id,
       'buyer',
       pb.phone,
       pb.district,
       'unknown',
       CASE WHEN pb.active IS FALSE THEN 'not_a_fit' ELSE 'active' END
  FROM pipeline_buyers pb
  JOIN users u ON u.id = pb.user_id
 WHERE pb.user_id IS NOT NULL
 ON CONFLICT (user_id) DO NOTHING;

INSERT INTO people_onboarding (user_id, account_type, phone, district, source, stage)
SELECT u.id,
       'farmer',
       fp.contact_phone,
       fp.district,
       'unknown',
       CASE
         WHEN fp.verification_status = 'verified' THEN 'onboarded'
         WHEN fp.verification_status = 'rejected' THEN 'not_a_fit'
         ELSE 'new'
       END
  FROM farm_profiles fp
  JOIN users u ON u.id = fp.owner_user_id
 WHERE fp.owner_user_id IS NOT NULL
 ON CONFLICT (user_id) DO NOTHING;

-- Instant access: scouts no longer blocked by scout_pending.
UPDATE users
   SET department_keys = COALESCE(
         (
           SELECT jsonb_agg(elem)
             FROM jsonb_array_elements(COALESCE(department_keys, '[]'::jsonb)) elem
            WHERE elem #>> '{}' <> 'scout_pending'
         ),
         '[]'::jsonb
       )
 WHERE department_keys ? 'scout_pending';

COMMENT ON TABLE signup_attempts IS
  'Every market signup try (success or fail) with ad attribution.';
COMMENT ON TABLE people_onboarding IS
  'Desk pipeline for sellers, buyers, and scouts after account creation.';
COMMENT ON TABLE onboarding_touches IS
  'Calls, WhatsApp, and notes logged against a person.';
