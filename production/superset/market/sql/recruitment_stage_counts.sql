-- Every desk stage, including stages with nobody in them.
-- Days use the latest call note, or the day the person was added.
-- in_wait is false for Onboarded and Closed.
-- Contact + Unreachable is counted on Contact, but not in the waiting-day buckets.
WITH spine AS (
  SELECT *
    FROM (VALUES
      (1, 'application', '1 Application', true),
      (2, 'contact', '2 Contact', true),
      (3, 'kyc', '3 KYC', true),
      (4, 'onboarded', '4 Onboarded', false),
      (5, 'closed', '5 Closed', false)
    ) AS s(stage_order, stage, desk_stage, in_wait)
),
aged AS (
  SELECT
    c.id,
    c.stage,
    c.desk_status,
    GREATEST(
      0,
      (timezone('Africa/Kigali', now()))::date
        - (timezone('Africa/Kigali', COALESCE(
            (SELECT MAX(t.created_at) FROM recruitment_touches t WHERE t.contact_id = c.id),
            c.created_at
          )))::date
    ) AS days_in_stage
    FROM recruitment_contacts c
)
SELECT
  s.stage_order,
  s.stage,
  s.desk_stage,
  s.in_wait,
  COUNT(a.id)::int AS people,
  COUNT(a.id) FILTER (
    WHERE s.in_wait AND COALESCE(a.desk_status, '') <> 'unreachable' AND a.days_in_stage <= 2
  )::int AS d0,
  COUNT(a.id) FILTER (
    WHERE s.in_wait AND COALESCE(a.desk_status, '') <> 'unreachable' AND a.days_in_stage BETWEEN 3 AND 5
  )::int AS d3,
  COUNT(a.id) FILTER (
    WHERE s.in_wait AND COALESCE(a.desk_status, '') <> 'unreachable' AND a.days_in_stage >= 6
  )::int AS d6
  FROM spine s
  LEFT JOIN aged a ON a.stage = s.stage
 GROUP BY s.stage_order, s.stage, s.desk_stage, s.in_wait
 ORDER BY s.stage_order
;
