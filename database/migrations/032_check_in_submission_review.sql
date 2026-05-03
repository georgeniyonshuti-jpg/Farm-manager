-- Round check-in manager review (laborer / junior vet submissions)
ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS submission_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

ALTER TABLE check_ins DROP CONSTRAINT IF EXISTS check_ins_submission_status_check;
ALTER TABLE check_ins
  ADD CONSTRAINT check_ins_submission_status_check
    CHECK (submission_status IN ('pending_review', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_check_ins_submission_at
  ON check_ins (submission_status, at DESC);

COMMENT ON COLUMN check_ins.submission_status IS 'Laborer/junior vet: pending_review until vet_manager+ approves.';
