-- Digital recruitment contracts. One platform letterhead, three agreements
-- (seller, buyer, scout), and one frozen copy for each signing attempt.
-- Existing people are not changed.
-- Selfies and signatures are personal data. They stay until a retention
-- period is chosen. This migration does not delete them on a timer.
--
-- Undo by removing the three new tables in this order:
-- seller_contracts, seller_contract_templates, seller_contract_settings.

CREATE TABLE IF NOT EXISTS seller_contract_settings (
  id                         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_legal_name         TEXT NOT NULL DEFAULT '',
  company_registration_no    TEXT NOT NULL DEFAULT '',
  company_tin                TEXT NOT NULL DEFAULT '',
  company_address            TEXT NOT NULL DEFAULT '',
  company_phone              TEXT NOT NULL DEFAULT '',
  company_email              TEXT NOT NULL DEFAULT '',
  logo_bytes                 BYTEA,
  logo_mime                  TEXT,
  letterhead_header          TEXT NOT NULL DEFAULT '',
  letterhead_footer          TEXT NOT NULL DEFAULT '',
  signer_name                TEXT NOT NULL DEFAULT '',
  signer_title               TEXT NOT NULL DEFAULT '',
  signer_signature_bytes     BYTEA,
  signer_signature_mime      TEXT,
  commission_percent         TEXT NOT NULL DEFAULT '',
  payout_days                TEXT NOT NULL DEFAULT '',
  acceptance_hours           TEXT NOT NULL DEFAULT '',
  rate_change_notice_days    TEXT NOT NULL DEFAULT '',
  termination_notice_days    TEXT NOT NULL DEFAULT '',
  cancellation_fee_rule      TEXT NOT NULL DEFAULT '',
  non_circumvention_months   TEXT NOT NULL DEFAULT '',
  circumvention_penalty_rule TEXT NOT NULL DEFAULT '',
  dispute_forum              TEXT NOT NULL DEFAULT '',
  mediation_days             TEXT NOT NULL DEFAULT '',
  data_protection_law_reference TEXT NOT NULL DEFAULT '',
  prevailing_language        TEXT NOT NULL DEFAULT '',
  payout_fee_rule            TEXT NOT NULL DEFAULT '',
  otp_required               BOOLEAN NOT NULL DEFAULT false,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                 UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO seller_contract_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS seller_contract_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  want        TEXT NOT NULL CHECK (want IN ('sell', 'buy', 'scout')),
  version     INTEGER NOT NULL CHECK (version > 0),
  language    TEXT NOT NULL CHECK (language IN ('en', 'rw')),
  body        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (want, language, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS seller_contract_templates_one_active
  ON seller_contract_templates (want, language)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS seller_contracts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID NOT NULL REFERENCES recruitment_contacts(id) ON DELETE CASCADE,
  want                  TEXT NOT NULL CHECK (want IN ('sell', 'buy', 'scout')),
  template_id           UUID REFERENCES seller_contract_templates(id) ON DELETE SET NULL,
  template_version      INTEGER,
  language              TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'rw')),
  contract_number       TEXT,
  presented_text        TEXT,
  frozen_text           TEXT,
  text_sha256           TEXT,
  status                TEXT NOT NULL DEFAULT 'sent' CHECK (status IN (
                          'not_sent', 'sent', 'opened', 'signed', 'approved', 'rejected', 'expired'
                        )),
  token_hash            TEXT,
  download_token_hash   TEXT,
  token_expires_at      TIMESTAMPTZ,
  typed_name            TEXT,
  signature_bytes       BYTEA,
  signature_mime        TEXT,
  selfie_bytes          BYTEA,
  selfie_mime           TEXT,
  read_confirmed        BOOLEAN NOT NULL DEFAULT false,
  electronic_consent    BOOLEAN NOT NULL DEFAULT false,
  otp_verified          BOOLEAN NOT NULL DEFAULT false,
  otp_code_hash         TEXT,
  otp_expires_at        TIMESTAMPTZ,
  otp_attempts          INTEGER NOT NULL DEFAULT 0,
  otp_sent_at           TIMESTAMPTZ,
  signed_at             TIMESTAMPTZ,
  signer_ip             TEXT,
  signer_user_agent     TEXT,
  reviewed_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
  pdf_bytes             BYTEA,
  opened_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS seller_contracts_token_hash_uidx
  ON seller_contracts (token_hash)
  WHERE token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS seller_contracts_download_token_uidx
  ON seller_contracts (download_token_hash)
  WHERE download_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS seller_contracts_contact_idx
  ON seller_contracts (contact_id, created_at DESC);

COMMENT ON TABLE seller_contracts IS
  'One row per signing attempt. The frozen text is the exact agreement the person saw. Selfies and signatures are personal data and are not deleted on a timer.';
