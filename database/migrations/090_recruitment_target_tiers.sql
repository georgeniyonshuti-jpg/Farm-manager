-- Two target tiers. T1 is the floor. T2 is the stretch. Older rows stay T1.
-- Undo:
--   DROP INDEX IF EXISTS idx_recruitment_targets_metric_tier;
--   ALTER TABLE recruitment_targets DROP CONSTRAINT IF EXISTS recruitment_targets_tier_check;
--   ALTER TABLE recruitment_targets DROP COLUMN IF EXISTS tier;

ALTER TABLE recruitment_targets
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 't1';

ALTER TABLE recruitment_targets
  DROP CONSTRAINT IF EXISTS recruitment_targets_tier_check;

ALTER TABLE recruitment_targets
  ADD CONSTRAINT recruitment_targets_tier_check CHECK (tier IN ('t1', 't2'));

CREATE INDEX IF NOT EXISTS idx_recruitment_targets_metric_tier
  ON recruitment_targets (metric, tier, effective_from);
