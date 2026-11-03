-- This week, Africa/Kigali Monday–Sunday.
-- Sellers live and buyers active: activated_at inside the week.
-- Scouts producing: a verified lot inside the week.
-- Passed probation: a seller paid within 21 days of going live, or a scout's
-- 8th verified lot within 21 days of approval, with that moment in the last 3 weeks.
-- Targets are the recorded defaults (10 sellers, 8 buyers, 2 scouts).
WITH bounds AS (
  SELECT
    (date_trunc('week', timezone('Africa/Kigali', now())))::date AS week_from,
    ((date_trunc('week', timezone('Africa/Kigali', now())))::date - 14) AS probation_from
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
  (SELECT COUNT(*)::int
     FROM people p, bounds b
    WHERE p.role = 'seller'
      AND (timezone('Africa/Kigali', p.activated_at))::date BETWEEN b.week_from AND b.week_from + 6) AS sellers_live,
  10::int AS sellers_target,
  (SELECT COUNT(*)::int
     FROM people p, bounds b
    WHERE p.role = 'buyer'
      AND (timezone('Africa/Kigali', p.activated_at))::date BETWEEN b.week_from AND b.week_from + 6) AS buyers_active,
  8::int AS buyers_target,
  (SELECT COUNT(DISTINCT s.person_id)::int
     FROM scout_lots s, bounds b
    WHERE (timezone('Africa/Kigali', s.at))::date BETWEEN b.week_from AND b.week_from + 6) AS scouts_producing,
  2::int AS scouts_target,
  (
    (SELECT COUNT(*)::int
       FROM people p, bounds b
      WHERE p.role = 'seller'
        AND p.activated_at IS NOT NULL
        AND p.productive_at IS NOT NULL
        AND p.productive_at >= p.activated_at
        AND p.productive_at <= p.activated_at + interval '21 days'
        AND (timezone('Africa/Kigali', p.productive_at))::date BETWEEN b.probation_from AND b.week_from + 6)
    +
    (SELECT COUNT(*)::int
       FROM scout_pass s, bounds b
      WHERE (timezone('Africa/Kigali', s.pass_at))::date BETWEEN b.probation_from AND b.week_from + 6)
  ) AS passed_probation
;
