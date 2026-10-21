-- One person per phone for the recruitment queue.
-- Undo by removing recruitment_touches, then recruitment_contacts.

CREATE TABLE IF NOT EXISTS recruitment_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164      TEXT NOT NULL UNIQUE,
  contact_name    TEXT,
  district        TEXT,
  bird_count      INTEGER,
  want            TEXT NOT NULL DEFAULT 'sell'
                    CHECK (want IN ('sell', 'buy', 'scout')),
  stage           TEXT NOT NULL DEFAULT 'new'
                    CHECK (stage IN (
                      'new', 'contacted', 'call_booked', 'onboarded',
                      'active', 'unreachable', 'not_a_fit'
                    )),
  source          TEXT NOT NULL DEFAULT 'whatsapp'
                    CHECK (source IN ('whatsapp', 'signup', 'market_form')),
  owner_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  next_call_at    TIMESTAMPTZ,
  last_touch_at   TIMESTAMPTZ,
  user_id         UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  signed_up_at    TIMESTAMPTZ,
  activated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruitment_contacts_stage
  ON recruitment_contacts (stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_contacts_owner
  ON recruitment_contacts (owner_user_id, next_call_at);

CREATE TABLE IF NOT EXISTS recruitment_touches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    UUID NOT NULL REFERENCES recruitment_contacts(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('call', 'whatsapp', 'note')),
  outcome       TEXT CHECK (outcome IS NULL OR outcome IN (
                  'reached', 'no_answer', 'scheduled', 'done'
                )),
  note          TEXT,
  by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruitment_touches_contact
  ON recruitment_touches (contact_id, created_at DESC);
