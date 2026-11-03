-- Waiting time for people still in the desk queue.
-- Onboarded, Closed, and Contact + Unreachable are left out.
-- Days use the latest call note, or the day the person was added.
WITH spine AS (
  SELECT *
    FROM (VALUES
      (1, 'application', '1 Application'),
      (2, 'contact', '2 Contact'),
      (3, 'kyc', '3 KYC')
    ) AS s(stage_order, stage, desk_stage)
),
aged AS (
  SELECT
    c.id,
    c.stage,
    GREATEST(
      0,
      (timezone('Africa/Kigali', now()))::date
        - (timezone('Africa/Kigali', COALESCE(
            (SELECT MAX(t.created_at) FROM recruitment_touches t WHERE t.contact_id = c.id),
            c.created_at
          )))::date
    ) AS days_in_stage
    FROM recruitment_contacts c
   WHERE COALESCE(c.desk_status, '') <> 'unreachable'
     AND c.stage NOT IN ('closed', 'onboarded')
)
SELECT
  s.stage_order,
  s.desk_stage,
  COUNT(a.id) FILTER (WHERE a.days_in_stage <= 2)::int AS d0,
  COUNT(a.id) FILTER (WHERE a.days_in_stage BETWEEN 3 AND 5)::int AS d3,
  COUNT(a.id) FILTER (WHERE a.days_in_stage >= 6)::int AS d6
  FROM spine s
  LEFT JOIN aged a ON a.stage = s.stage
 GROUP BY s.stage_order, s.desk_stage
 ORDER BY s.stage_order
;
