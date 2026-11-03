-- Interview results. Categories can overlap, so they do not add up to the queue.
-- Reached: a call note with outcome reached.
-- No answer: a call note with outcome no answer.
-- Call booked: status is call scheduled, a next call time is set, or a note booked a call.
-- Approved: decision is approved, or the stage is KYC or Onboarded.
-- Follow-up: decision is follow-up, or the status is follow-up.
-- Not a fit: decision is not a fit, or the closed status is not a fit.
-- Unreachable: decision is unreachable, or the status is unreachable.
-- A zero on every row means no interview has been recorded yet.
WITH counts AS (
  SELECT 'reached' AS result_id,
         COUNT(DISTINCT t.contact_id)::int AS people
    FROM recruitment_touches t
   WHERE t.kind = 'call' AND t.outcome = 'reached'
  UNION ALL
  SELECT 'no_answer',
         COUNT(DISTINCT t.contact_id)::int
    FROM recruitment_touches t
   WHERE t.kind = 'call' AND t.outcome = 'no_answer'
  UNION ALL
  SELECT 'call_booked',
         COUNT(*)::int
    FROM recruitment_contacts c
   WHERE c.desk_status = 'call_scheduled'
      OR c.next_call_at IS NOT NULL
      OR EXISTS (
        SELECT 1
          FROM recruitment_touches t
         WHERE t.contact_id = c.id
           AND (t.scheduled_for IS NOT NULL OR t.outcome = 'scheduled')
      )
  UNION ALL
  SELECT 'approved',
         COUNT(*)::int
    FROM recruitment_contacts c
   WHERE c.decision = 'approved' OR c.stage IN ('kyc', 'onboarded')
  UNION ALL
  SELECT 'follow_up',
         COUNT(*)::int
    FROM recruitment_contacts c
   WHERE c.decision = 'follow_up' OR c.desk_status = 'follow_up'
  UNION ALL
  SELECT 'not_a_fit',
         COUNT(*)::int
    FROM recruitment_contacts c
   WHERE c.decision = 'not_a_fit' OR c.desk_status = 'not_a_fit'
  UNION ALL
  SELECT 'unreachable',
         COUNT(*)::int
    FROM recruitment_contacts c
   WHERE c.decision = 'unreachable' OR c.desk_status = 'unreachable'
)
SELECT
  s.result_order,
  s.result_label,
  COALESCE(c.people, 0)::int AS people
  FROM (VALUES
    (1, 'reached', '1 Reached'),
    (2, 'no_answer', '2 No answer'),
    (3, 'call_booked', '3 Call booked'),
    (4, 'approved', '4 Approved'),
    (5, 'follow_up', '5 Follow-up'),
    (6, 'not_a_fit', '6 Not a fit'),
    (7, 'unreachable', '7 Unreachable')
  ) AS s(result_order, result_id, result_label)
  LEFT JOIN counts c ON c.result_id = s.result_id
 ORDER BY s.result_order
;