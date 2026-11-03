-- One row per interviewer. Zeros stay visible.
-- Open people match the desk: Application and Contact, except Unreachable.
-- Overdue matches the desk: next call is in the past, and the person is not
-- Closed, Onboarded, or Unreachable.
-- Calls are call notes. Decisions this week use Monday–Sunday Africa/Kigali.
WITH week AS (
  SELECT (date_trunc('week', timezone('Africa/Kigali', now())))::date AS week_from
),
officers AS (
  SELECT u.id,
         COALESCE(NULLIF(btrim(u.full_name), ''), 'Officer') AS owner_name
    FROM users u
   WHERE u.role IN ('sales_officer', 'sales_coordinator')
      OR EXISTS (SELECT 1 FROM recruitment_contacts c WHERE c.owner_user_id = u.id)
      OR EXISTS (SELECT 1 FROM recruitment_touches t WHERE t.by_user_id = u.id)
      OR EXISTS (SELECT 1 FROM recruitment_contacts c WHERE c.decided_by = u.id)
),
assigned AS (
  SELECT owner_user_id AS id,
         COUNT(*) FILTER (
           WHERE stage IN ('application', 'contact')
             AND COALESCE(desk_status, '') <> 'unreachable'
         )::int AS people_assigned,
         COUNT(*) FILTER (
           WHERE next_call_at IS NOT NULL
             AND next_call_at < now()
             AND stage NOT IN ('closed', 'onboarded')
             AND COALESCE(desk_status, '') <> 'unreachable'
         )::int AS overdue_next_calls
    FROM recruitment_contacts
   WHERE owner_user_id IS NOT NULL
   GROUP BY owner_user_id
),
calls AS (
  SELECT by_user_id AS id,
         COUNT(*) FILTER (WHERE kind = 'call')::int AS calls_made,
         COUNT(*) FILTER (WHERE kind = 'call' AND outcome = 'reached')::int AS reached,
         COUNT(*) FILTER (WHERE kind = 'call' AND outcome = 'no_answer')::int AS no_answer
    FROM recruitment_touches
   WHERE by_user_id IS NOT NULL
   GROUP BY by_user_id
),
decisions AS (
  SELECT c.decided_by AS id,
         COUNT(*)::int AS decisions_this_week
    FROM recruitment_contacts c
    CROSS JOIN week w
   WHERE c.decided_by IS NOT NULL
     AND c.decided_at IS NOT NULL
     AND (timezone('Africa/Kigali', c.decided_at))::date BETWEEN w.week_from AND w.week_from + 6
   GROUP BY c.decided_by
)
SELECT
  o.owner_name,
  COALESCE(a.people_assigned, 0) AS people_assigned,
  COALESCE(c.calls_made, 0) AS calls_made,
  COALESCE(c.reached, 0) AS reached,
  COALESCE(c.no_answer, 0) AS no_answer,
  COALESCE(a.overdue_next_calls, 0) AS overdue_next_calls,
  COALESCE(d.decisions_this_week, 0) AS decisions_this_week
  FROM officers o
  LEFT JOIN assigned a ON a.id = o.id
  LEFT JOIN calls c ON c.id = o.id
  LEFT JOIN decisions d ON d.id = o.id
 ORDER BY people_assigned DESC, calls_made DESC, owner_name
;