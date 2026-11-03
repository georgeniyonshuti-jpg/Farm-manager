-- Scout row for the current Kigali week.
-- Ramping: approved within 14 days, or not approved yet.
-- Dormant: no activity for 14 days.
-- Needs support: no verified lot in the last 10 days.
-- Otherwise On track. Lots and birds are verified lots this week.
WITH bounds AS (
  SELECT (date_trunc('week', timezone('Africa/Kigali', now())))::date AS week_from
),
people AS (
  SELECT *
    FROM analytics.person_facts
   WHERE role = 'scout'
     AND NOT COALESCE(is_internal, false)
     AND NOT COALESCE(is_synthetic, false)
),
lots AS (
  SELECT l.scouted_by::text AS person_id,
         COALESCE(l.verified_at, l.created_at) AS at,
         COALESCE(l.bird_count, 0) AS birds
    FROM pipeline_lots l
   WHERE l.scouted_by IS NOT NULL
     AND l.verification_status = 'verified'
),
week_lots AS (
  SELECT lots.person_id,
         COUNT(*)::int AS lots,
         COALESCE(SUM(lots.birds), 0)::int AS birds
    FROM lots
    CROSS JOIN bounds b
   WHERE (timezone('Africa/Kigali', lots.at))::date BETWEEN b.week_from AND b.week_from + 6
   GROUP BY lots.person_id
),
last_lot AS (
  SELECT person_id, MAX(at) AS last_verified_at
    FROM lots
   GROUP BY person_id
),
unpaid AS (
  SELECT l.scouted_by::text AS person_id,
         COALESCE(SUM(m.commission_amount_rwf), 0)::float AS unpaid_rwf
    FROM pipeline_matches m
    JOIN pipeline_lots l ON l.id = m.lot_id
   WHERE m.commission_status = 'accrued'
     AND l.scouted_by IS NOT NULL
   GROUP BY 1
)
SELECT
  COALESCE(NULLIF(btrim(p.display_name), ''), 'Scout') AS name,
  COALESCE(NULLIF(btrim(p.district), ''), 'District unknown') AS district,
  COALESCE(w.lots, 0) AS lots,
  COALESCE(w.birds, 0) AS birds,
  COALESCE(u.unpaid_rwf, 0) AS unpaid_rwf,
  CASE
    WHEN p.approved_at IS NULL
      OR EXTRACT(epoch FROM (now() - p.approved_at)) / 86400 <= 14 THEN 'Ramping'
    WHEN p.last_activity_at IS NOT NULL
      AND EXTRACT(epoch FROM (now() - p.last_activity_at)) / 86400 >= 14 THEN 'Dormant'
    WHEN ll.last_verified_at IS NULL
      OR EXTRACT(epoch FROM (now() - ll.last_verified_at)) / 86400 > 10 THEN 'Needs support'
    ELSE 'On track'
  END AS status,
  CASE
    WHEN p.approved_at IS NULL
      OR EXTRACT(epoch FROM (now() - p.approved_at)) / 86400 <= 14 THEN 3
    WHEN p.last_activity_at IS NOT NULL
      AND EXTRACT(epoch FROM (now() - p.last_activity_at)) / 86400 >= 14 THEN 4
    WHEN ll.last_verified_at IS NULL
      OR EXTRACT(epoch FROM (now() - ll.last_verified_at)) / 86400 > 10 THEN 2
    ELSE 1
  END AS status_order
  FROM people p
  LEFT JOIN week_lots w ON w.person_id = p.person_id
  LEFT JOIN last_lot ll ON ll.person_id = p.person_id
  LEFT JOIN unpaid u ON u.person_id = p.person_id
 ORDER BY lots DESC, name
;
