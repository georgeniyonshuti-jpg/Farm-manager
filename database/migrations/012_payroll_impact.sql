CREATE TABLE payroll_impact (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  log_id          TEXT,
  log_type        TEXT NOT NULL CHECK (log_type IN ('daily_log', 'check_in')),
  rwf_delta       NUMERIC NOT NULL,
  reason          TEXT,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  approved_by     TEXT REFERENCES app_users (id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at    TIMESTAMPTZ,
  on_time         BOOLEAN
);

CREATE INDEX idx_payroll_impact_user_period ON payroll_impact (user_id, period_start, period_end);
CREATE INDEX idx_payroll_impact_approved ON payroll_impact (approved_at);

COMMENT ON COLUMN payroll_impact.rwf_delta IS 'Positive = bonus, negative = deduction.';
COMMENT ON COLUMN payroll_impact.log_id IS 'Application log reference (check-in id, daily_log id, or synthetic missed_* key).';
