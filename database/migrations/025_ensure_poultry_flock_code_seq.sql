-- Idempotent: flock code depends on this sequence (see server POST /api/flocks).
-- Ensures DBs that skipped or partially applied earlier migrations can still create flocks.
CREATE SEQUENCE IF NOT EXISTS poultry_flock_code_seq;
