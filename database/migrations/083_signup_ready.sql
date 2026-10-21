-- Recruitment is a staged desk workflow. Signup creates an application.
-- A verification call records the answers. Approval moves the person to Active.
-- Everyone already waiting, and not already active, starts in Application.
--
-- Undo:
-- ALTER TABLE recruitment_contacts ALTER COLUMN stage SET DEFAULT 'new';
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_stage_check;
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_bird_type_check;
-- ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_decision_check;
-- UPDATE recruitment_contacts SET stage = CASE stage
--   WHEN 'application' THEN 'new'
--   WHEN 'call_scheduled' THEN 'call_booked'
--   WHEN 'called' THEN 'contacted'
--   WHEN 'follow_up' THEN 'onboarded'
--   ELSE stage END;
-- ALTER TABLE recruitment_contacts ADD CONSTRAINT recruitment_contacts_stage_check
--   CHECK (stage IN ('new','contacted','call_booked','onboarded','active','unreachable','not_a_fit'));
-- DROP INDEX IF EXISTS idx_recruitment_touches_idempotency;
-- ALTER TABLE recruitment_touches
--   DROP COLUMN IF EXISTS answers_json,
--   DROP COLUMN IF EXISTS challenges,
--   DROP COLUMN IF EXISTS next_action,
--   DROP COLUMN IF EXISTS scheduled_for,
--   DROP COLUMN IF EXISTS idempotency_key;
-- ALTER TABLE recruitment_contacts
--   DROP COLUMN IF EXISTS location_confirmed,
--   DROP COLUMN IF EXISTS location_corrected,
--   DROP COLUMN IF EXISTS owns_broilers,
--   DROP COLUMN IF EXISTS bird_type,
--   DROP COLUMN IF EXISTS quantity_min,
--   DROP COLUMN IF EXISTS quantity_max,
--   DROP COLUMN IF EXISTS can_slaughter,
--   DROP COLUMN IF EXISTS can_deliver,
--   DROP COLUMN IF EXISTS decision,
--   DROP COLUMN IF EXISTS decided_at,
--   DROP COLUMN IF EXISTS decided_by,
--   DROP COLUMN IF EXISTS challenges,
--   DROP COLUMN IF EXISTS next_action;

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_stage_check;

UPDATE recruitment_contacts
   SET stage = 'application'
 WHERE stage IN ('new', 'contacted', 'call_booked', 'onboarded');

ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_stage_check
  CHECK (stage IN (
    'application', 'call_scheduled', 'called', 'follow_up',
    'active', 'unreachable', 'not_a_fit'
  ));

ALTER TABLE recruitment_contacts ALTER COLUMN stage SET DEFAULT 'application';

ALTER TABLE recruitment_contacts
  ADD COLUMN IF NOT EXISTS location_confirmed BOOLEAN,
  ADD COLUMN IF NOT EXISTS location_corrected TEXT,
  ADD COLUMN IF NOT EXISTS owns_broilers BOOLEAN,
  ADD COLUMN IF NOT EXISTS bird_type TEXT,
  ADD COLUMN IF NOT EXISTS quantity_min INTEGER,
  ADD COLUMN IF NOT EXISTS quantity_max INTEGER,
  ADD COLUMN IF NOT EXISTS can_slaughter BOOLEAN,
  ADD COLUMN IF NOT EXISTS can_deliver BOOLEAN,
  ADD COLUMN IF NOT EXISTS decision TEXT,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS challenges TEXT,
  ADD COLUMN IF NOT EXISTS next_action TEXT;

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_bird_type_check;
ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_bird_type_check
  CHECK (bird_type IS NULL OR bird_type IN ('broiler', 'hybrid', 'layer', 'other'));

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_decision_check;
ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_decision_check
  CHECK (decision IS NULL OR decision IN ('approved', 'not_a_fit', 'unreachable', 'follow_up'));

ALTER TABLE recruitment_touches
  ADD COLUMN IF NOT EXISTS answers_json JSONB,
  ADD COLUMN IF NOT EXISTS challenges TEXT,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recruitment_touches_idempotency
  ON recruitment_touches (contact_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

INSERT INTO recruitment_contacts (
  phone_e164, contact_name, district, want, stage, source, user_id, signed_up_at, activated_at
)
SELECT phone, contact_name, district, want, stage, source, user_id, signed_up_at, activated_at
FROM (
  SELECT
    CASE
      WHEN regexp_replace(p.phone, '[\s-]', '', 'g') ~ '^\+250[0-9]{9}$' THEN regexp_replace(p.phone, '[\s-]', '', 'g')
      WHEN regexp_replace(p.phone, '[\s-]', '', 'g') ~ '^250[0-9]{9}$' THEN '+' || regexp_replace(p.phone, '[\s-]', '', 'g')
      WHEN regexp_replace(p.phone, '[\s-]', '', 'g') ~ '^0[0-9]{9}$' THEN '+250' || substring(regexp_replace(p.phone, '[\s-]', '', 'g') from 2)
      WHEN regexp_replace(p.phone, '[\s-]', '', 'g') ~ '^7[0-9]{8}$' THEN '+250' || regexp_replace(p.phone, '[\s-]', '', 'g')
      ELSE NULL
    END AS phone,
    u.full_name AS contact_name,
    NULLIF(btrim(p.district), '') AS district,
    CASE p.account_type WHEN 'buyer' THEN 'buy' WHEN 'scout' THEN 'scout' ELSE 'sell' END AS want,
    CASE WHEN p.stage = 'active' THEN 'active' ELSE 'application' END AS stage,
    'signup' AS source,
    p.user_id,
    p.created_at AS signed_up_at,
    CASE WHEN p.stage = 'active' THEN p.updated_at ELSE NULL END AS activated_at
  FROM people_onboarding p
  JOIN users u ON u.id = p.user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM recruitment_contacts c WHERE c.user_id = p.user_id
  )
) shaped
WHERE phone IS NOT NULL
ON CONFLICT (phone_e164) DO UPDATE SET
  user_id = COALESCE(recruitment_contacts.user_id, EXCLUDED.user_id),
  signed_up_at = COALESCE(recruitment_contacts.signed_up_at, EXCLUDED.signed_up_at),
  stage = CASE
    WHEN recruitment_contacts.stage = 'active' THEN 'active'
    ELSE 'application'
  END,
  updated_at = now();
