-- Feed-only entries (no photo round check-in); count toward cycle feed / FCR with check_ins.feed_kg.
CREATE TABLE IF NOT EXISTS flock_feed_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id            UUID NOT NULL REFERENCES poultry_flocks (id) ON DELETE CASCADE,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  feed_kg             NUMERIC(12, 3) NOT NULL CHECK (feed_kg >= 0),
  notes               TEXT,
  entered_by_user_id  UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flock_feed_entries_flock_recorded
  ON flock_feed_entries (flock_id, recorded_at DESC);

COMMENT ON TABLE flock_feed_entries IS 'Optional feed logging without a photo round check-in; summed with check_ins for cycle FCR.';

CREATE SEQUENCE IF NOT EXISTS poultry_flock_code_seq;
