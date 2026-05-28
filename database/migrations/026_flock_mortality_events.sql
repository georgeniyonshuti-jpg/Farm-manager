-- Ad-hoc and round-linked mortality events (photo-based field logging)
CREATE TABLE IF NOT EXISTS flock_mortality_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id            UUID NOT NULL REFERENCES poultry_flocks (id) ON DELETE CASCADE,
  laborer_id          UUID NOT NULL,
  at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  count               INTEGER NOT NULL CHECK (count > 0),
  is_emergency        BOOLEAN NOT NULL DEFAULT false,
  photos              JSONB NOT NULL,
  notes               TEXT,
  linked_checkin_id   UUID REFERENCES check_ins (id) ON DELETE SET NULL,
  source              TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flock_mortality_events_flock_at
  ON flock_mortality_events (flock_id, at DESC);

COMMENT ON TABLE flock_mortality_events IS 'Field mortality logs (standalone or linked to a round check-in); photos stored as JSON array of URL/data-URL strings.';
COMMENT ON COLUMN flock_mortality_events.source IS 'e.g. adhoc, emergency, linked, round_checkin';
