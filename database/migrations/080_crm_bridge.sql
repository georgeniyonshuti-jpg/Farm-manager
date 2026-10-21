-- Cleva side of the CRM bridge. Does not change ERPNext accounting tables.
-- To undo, remove the six tables below in reverse dependency order.

CREATE TABLE IF NOT EXISTS crm_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleva_entity_type TEXT NOT NULL,
  cleva_entity_id   TEXT NOT NULL,
  crm_lead_name     TEXT NOT NULL,
  phone_e164        TEXT,
  ambiguous         BOOLEAN NOT NULL DEFAULT false,
  detail_json       JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cleva_entity_type, cleva_entity_id),
  UNIQUE (crm_lead_name)
);

CREATE INDEX IF NOT EXISTS idx_crm_links_phone
  ON crm_links (phone_e164);

CREATE TABLE IF NOT EXISTS crm_user_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleva_user_id   UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  crm_user_email  TEXT NOT NULL,
  crm_role        TEXT NOT NULL CHECK (crm_role IN ('marketer', 'supervisor')),
  disabled_at     TIMESTAMPTZ,
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signup_tracking_links (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash           TEXT NOT NULL UNIQUE,
  crm_lead_name        TEXT NOT NULL,
  contact_type         TEXT NOT NULL,
  prefill_json         JSONB NOT NULL DEFAULT '{}',
  expires_at           TIMESTAMPTZ NOT NULL,
  used_at              TIMESTAMPTZ,
  used_by_user_id      UUID,
  created_by_crm_user  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_sync_outbox (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID NOT NULL UNIQUE,
  event_type       TEXT NOT NULL,
  payload_json     JSONB NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_sync_outbox_due
  ON crm_sync_outbox (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS crm_inbound_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   TEXT NOT NULL UNIQUE,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  result       TEXT
);

-- Sellers from CRM. Not a public listing. Scouts only see rows assigned to them.
CREATE TABLE IF NOT EXISTS crm_seller_queue (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_lead_name           TEXT NOT NULL UNIQUE,
  contact_name            TEXT NOT NULL,
  phone_e164              TEXT NOT NULL,
  district                TEXT,
  bird_count              INTEGER,
  availability_date       DATE,
  handoff_note            TEXT,
  assigned_scout_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  visit_status            TEXT NOT NULL DEFAULT 'new'
                            CHECK (visit_status IN (
                              'new', 'contacted', 'visit_scheduled',
                              'visit_completed', 'outcome_recorded'
                            )),
  next_action_at          TIMESTAMPTZ,
  outcome_note            TEXT,
  ambiguous               BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_seller_queue_scout
  ON crm_seller_queue (assigned_scout_user_id, visit_status);

COMMENT ON TABLE crm_seller_queue IS
  'CRM-qualified sellers waiting for a scout. Never published to the market from this table.';
COMMENT ON TABLE crm_sync_outbox IS
  'Events for Frappe CRM. Pending until CRM_BASE_URL is set. Dead after repeated failure.';
