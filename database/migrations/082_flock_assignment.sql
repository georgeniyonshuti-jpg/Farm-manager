-- Desk names the scout who should review a flock.
-- Undo by removing pipeline_lots.assigned_scout_user_id.

ALTER TABLE pipeline_lots
  ADD COLUMN IF NOT EXISTS assigned_scout_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_lots_assigned_scout
  ON pipeline_lots (assigned_scout_user_id);

COMMENT ON COLUMN pipeline_lots.assigned_scout_user_id IS
  'Scout named by desk to review this flock. This is not the person who logged a visit.';
