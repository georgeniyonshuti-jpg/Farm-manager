-- Round check-in structured photos + coop temperature capture
ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS coop_temperature_c NUMERIC(6, 2);

-- Backfill legacy photo_urls array/object into structured slots.
-- Existing flat arrays become flockSign photos by default.
UPDATE check_ins
SET photo_urls = CASE
  WHEN photo_urls IS NULL AND photo_url IS NOT NULL THEN
    jsonb_build_object('flockSign', jsonb_build_array(photo_url), 'thermometer', '[]'::jsonb, 'feed', '[]'::jsonb, 'water', '[]'::jsonb)
  WHEN jsonb_typeof(photo_urls) = 'array' THEN
    jsonb_build_object('flockSign', photo_urls, 'thermometer', '[]'::jsonb, 'feed', '[]'::jsonb, 'water', '[]'::jsonb)
  WHEN jsonb_typeof(photo_urls) = 'object' THEN
    jsonb_build_object(
      'flockSign', COALESCE(photo_urls->'flockSign', CASE WHEN photo_urls ? 'photos' THEN photo_urls->'photos' ELSE '[]'::jsonb END),
      'thermometer', COALESCE(photo_urls->'thermometer', '[]'::jsonb),
      'feed', COALESCE(photo_urls->'feed', '[]'::jsonb),
      'water', COALESCE(photo_urls->'water', '[]'::jsonb)
    )
  ELSE
    jsonb_build_object('flockSign', '[]'::jsonb, 'thermometer', '[]'::jsonb, 'feed', '[]'::jsonb, 'water', '[]'::jsonb)
END
WHERE
  photo_urls IS NOT NULL
  OR photo_url IS NOT NULL;

COMMENT ON COLUMN check_ins.coop_temperature_c IS 'Coop temperature in Celsius captured during round check-in.';
COMMENT ON COLUMN check_ins.photo_urls IS 'Structured round check-in media slots: flockSign[], thermometer[], feed[], water[].';
