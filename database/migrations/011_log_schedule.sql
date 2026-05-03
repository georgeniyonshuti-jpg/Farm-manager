-- Time-based log windows per flock + role (payroll incentive alignment)
CREATE TABLE log_schedule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id        UUID NOT NULL REFERENCES poultry_flocks (id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  interval_hours  NUMERIC NOT NULL CHECK (interval_hours > 0),
  window_open     TIME NOT NULL,
  window_close    TIME NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_log_schedule_flock ON log_schedule (flock_id);
CREATE INDEX idx_log_schedule_role ON log_schedule (role);

COMMENT ON TABLE log_schedule IS 'Payroll windows: submissions inside [window_open, window_close] (farm local day) count as on-time.';
