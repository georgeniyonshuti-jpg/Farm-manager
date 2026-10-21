-- People who apply to scout online. Approval clears scout_pending on the user.
CREATE TABLE IF NOT EXISTS scout_applications (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone       TEXT,
  district    TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID
);

CREATE INDEX IF NOT EXISTS idx_scout_applications_status
  ON scout_applications (status, created_at);
