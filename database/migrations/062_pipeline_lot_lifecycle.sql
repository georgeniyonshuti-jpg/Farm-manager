-- Pipeline lot lifecycle: flock delete must cascade (SET NULL violated managed_flock CHECK).
-- Matches follow their lot so company/flock teardown cannot leave orphans.

ALTER TABLE pipeline_lots DROP CONSTRAINT IF EXISTS pipeline_lots_flock_id_fkey;
ALTER TABLE pipeline_lots
  ADD CONSTRAINT pipeline_lots_flock_id_fkey
  FOREIGN KEY (flock_id) REFERENCES poultry_flocks (id) ON DELETE CASCADE;

ALTER TABLE pipeline_matches DROP CONSTRAINT IF EXISTS pipeline_matches_lot_id_fkey;
ALTER TABLE pipeline_matches
  ADD CONSTRAINT pipeline_matches_lot_id_fkey
  FOREIGN KEY (lot_id) REFERENCES pipeline_lots (id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT pipeline_lots_flock_id_fkey ON pipeline_lots IS
  'Managed lots die with the flock; companyDelete also clears company-scoped lots explicitly.';
