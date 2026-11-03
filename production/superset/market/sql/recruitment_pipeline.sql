-- Current seller stage, from the same timestamps as the command centre.
-- A live listing is Live. Unreachable and Not a fit apply only before that.
-- Waiting buckets are days since the stage was entered: 0–2, 3–5, and 6+.
WITH people AS (
  SELECT *
    FROM analytics.person_facts
   WHERE role = 'seller'
     AND NOT COALESCE(is_internal, false)
     AND NOT COALESCE(is_synthetic, false)
),
staged AS (
  SELECT
    CASE
      WHEN raw_stage IN ('unreachable', 'not_a_fit') AND activated_at IS NULL THEN raw_stage
      WHEN productive_at IS NOT NULL THEN 'first_sale'
      WHEN activated_at IS NOT NULL THEN 'listing_live'
      WHEN kyc_verified_at IS NOT NULL THEN 'kyc'
      WHEN contacted_at IS NOT NULL THEN 'contacted'
      ELSE 'applied'
    END AS stage_id,
    CASE
      WHEN raw_stage IN ('unreachable', 'not_a_fit') AND activated_at IS NULL THEN COALESCE(last_activity_at, created_at)
      WHEN productive_at IS NOT NULL THEN productive_at
      WHEN activated_at IS NOT NULL THEN activated_at
      WHEN kyc_verified_at IS NOT NULL THEN kyc_verified_at
      WHEN contacted_at IS NOT NULL THEN contacted_at
      ELSE COALESCE(application_submitted_at, created_at, now())
    END AS entered_at
    FROM people
)
SELECT
  CASE stage_id
    WHEN 'applied' THEN 'Applied'
    WHEN 'contacted' THEN 'Contacted'
    WHEN 'kyc' THEN 'KYC'
    WHEN 'listing_live' THEN 'Live'
    WHEN 'first_sale' THEN 'First sale'
    WHEN 'unreachable' THEN 'Unreachable'
    WHEN 'not_a_fit' THEN 'Not a fit'
    ELSE stage_id
  END AS stage,
  CASE stage_id
    WHEN 'applied' THEN 1
    WHEN 'contacted' THEN 2
    WHEN 'kyc' THEN 3
    WHEN 'listing_live' THEN 4
    WHEN 'first_sale' THEN 5
    WHEN 'unreachable' THEN 6
    WHEN 'not_a_fit' THEN 7
    ELSE 9
  END AS stage_order,
  COUNT(*)::int AS people,
  COUNT(*) FILTER (WHERE EXTRACT(epoch FROM (now() - entered_at)) / 86400 < 3)::int AS d0,
  COUNT(*) FILTER (
    WHERE EXTRACT(epoch FROM (now() - entered_at)) / 86400 >= 3
      AND EXTRACT(epoch FROM (now() - entered_at)) / 86400 < 6
  )::int AS d3,
  COUNT(*) FILTER (WHERE EXTRACT(epoch FROM (now() - entered_at)) / 86400 >= 6)::int AS d6
  FROM staged
 GROUP BY 1, 2
 ORDER BY 2
;
