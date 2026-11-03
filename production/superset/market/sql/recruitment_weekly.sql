-- Eight Kigali weeks, oldest first.
-- Each column uses the same rule as the this-week tiles, counted inside that week.
WITH weeks AS (
  SELECT ((date_trunc('week', timezone('Africa/Kigali', now())))::date - (n * 7)) AS week_from
    FROM generate_series(7, 0, -1) AS n
),
people AS (
  SELECT *
    FROM analytics.person_facts
   WHERE NOT COALESCE(is_internal, false)
     AND NOT COALESCE(is_synthetic, false)
),
scout_lots AS (
  SELECT l.scouted_by::text AS person_id,
         COALESCE(l.verified_at, l.created_at) AS at
    FROM pipeline_lots l
    JOIN people p ON p.person_id = l.scouted_by::text AND p.role = 'scout'
   WHERE l.verification_status = 'verified'
     AND l.scouted_by IS NOT NULL
),
scout_pass AS (
  SELECT person_id, at AS pass_at
    FROM (
      SELECT s.person_id,
             s.at,
             row_number() OVER (PARTITION BY s.person_id ORDER BY s.at) AS n
        FROM scout_lots s
        JOIN people p ON p.person_id = s.person_id
       WHERE p.approved_at IS NOT NULL
         AND s.at >= p.approved_at
         AND s.at <= p.approved_at + interval '21 days'
    ) ranked
   WHERE n = 8
)
SELECT
  w.week_from AS week,
  (SELECT COUNT(*)::int
     FROM people p
    WHERE p.role = 'seller'
      AND (timezone('Africa/Kigali', p.activated_at))::date BETWEEN w.week_from AND w.week_from + 6) AS sellers_live,
  (SELECT COUNT(*)::int
     FROM people p
    WHERE p.role = 'buyer'
      AND (timezone('Africa/Kigali', p.activated_at))::date BETWEEN w.week_from AND w.week_from + 6) AS buyers_active,
  (SELECT COUNT(DISTINCT s.person_id)::int
     FROM scout_lots s
    WHERE (timezone('Africa/Kigali', s.at))::date BETWEEN w.week_from AND w.week_from + 6) AS scouts_producing,
  (
    (SELECT COUNT(*)::int
       FROM people p
      WHERE p.role = 'seller'
        AND p.activated_at IS NOT NULL
        AND p.productive_at IS NOT NULL
        AND p.productive_at >= p.activated_at
        AND p.productive_at <= p.activated_at + interval '21 days'
        AND (timezone('Africa/Kigali', p.productive_at))::date BETWEEN w.week_from AND w.week_from + 6)
    +
    (SELECT COUNT(*)::int
       FROM scout_pass s
      WHERE (timezone('Africa/Kigali', s.pass_at))::date BETWEEN w.week_from AND w.week_from + 6)
  ) AS passed_probation
  FROM weeks w
 ORDER BY w.week_from
;
