-- Round check-in adequacy flags (ticks); legacy rows stay NULL
ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS feed_adequate BOOLEAN,
  ADD COLUMN IF NOT EXISTS water_adequate BOOLEAN;

COMMENT ON COLUMN check_ins.feed_adequate IS 'True if feed level sufficient at round check-in; NULL for legacy rows';
COMMENT ON COLUMN check_ins.water_adequate IS 'True if water level sufficient at round check-in; NULL for legacy rows';

-- Feed log: type + adequacy + optional proof photos (URLs or legacy data URLs)
ALTER TABLE flock_feed_entries
  ADD COLUMN IF NOT EXISTS feed_type TEXT,
  ADD COLUMN IF NOT EXISTS feed_adequate BOOLEAN,
  ADD COLUMN IF NOT EXISTS water_adequate BOOLEAN,
  ADD COLUMN IF NOT EXISTS photo_urls JSONB;

COMMENT ON COLUMN flock_feed_entries.feed_type IS 'Reference feed_type key, e.g. starter/grower';
COMMENT ON COLUMN flock_feed_entries.photo_urls IS 'JSON array of image URLs or data-URL strings';
