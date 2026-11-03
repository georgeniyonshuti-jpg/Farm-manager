-- Application for 3 or more days, and no call booked.
-- Days use the latest call note, or the day the person was added.
-- An empty result means nobody is waiting that long.
WITH touch AS (
  SELECT contact_id,
         MAX(created_at) AS last_touch_at,
         BOOL_OR(scheduled_for IS NOT NULL OR outcome = 'scheduled') AS call_booked
    FROM recruitment_touches
   GROUP BY contact_id
)
SELECT
  COALESCE(NULLIF(btrim(c.contact_name), ''), 'Unnamed') AS contact_name,
  COALESCE(NULLIF(btrim(owner.full_name), ''), 'Unassigned') AS owner_name,
  GREATEST(
    0,
    (timezone('Africa/Kigali', now()))::date
      - (timezone('Africa/Kigali', COALESCE(t.last_touch_at, c.created_at)))::date
  ) AS days_in_stage
  FROM recruitment_contacts c
  LEFT JOIN touch t ON t.contact_id = c.id
  LEFT JOIN users owner ON owner.id = c.owner_user_id
 WHERE c.stage = 'application'
   AND GREATEST(
         0,
         (timezone('Africa/Kigali', now()))::date
           - (timezone('Africa/Kigali', COALESCE(t.last_touch_at, c.created_at)))::date
       ) >= 3
   AND NOT (
     c.desk_status = 'call_scheduled'
     OR c.next_call_at IS NOT NULL
     OR COALESCE(t.call_booked, false)
   )
 ORDER BY days_in_stage DESC, contact_name
;