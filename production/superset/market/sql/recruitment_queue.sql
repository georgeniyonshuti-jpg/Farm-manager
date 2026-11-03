-- One row per recruitment desk person (recruitment_contacts).
-- Days in stage use the latest call note. If there is no note, the day the
-- person was added is used. There is no stage-changed timestamp.
-- Blank bird answers stay null. They are not zero birds.
WITH touch AS (
  SELECT contact_id,
         MAX(created_at) AS last_touch_at,
         BOOL_OR(scheduled_for IS NOT NULL OR outcome = 'scheduled') AS call_booked
    FROM recruitment_touches
   GROUP BY contact_id
),
scout_lots AS (
  SELECT fp.owner_user_id AS user_id,
         BOOL_OR(l.assigned_scout_user_id IS NOT NULL) AS has_assigned_scout,
         (ARRAY_AGG(l.assigned_scout_user_id ORDER BY l.updated_at DESC)
            FILTER (WHERE l.assigned_scout_user_id IS NOT NULL))[1] AS assigned_scout_user_id
    FROM farm_profiles fp
    JOIN pipeline_lots l ON l.farm_profile_id = fp.id
   WHERE fp.owner_user_id IS NOT NULL
   GROUP BY fp.owner_user_id
)
SELECT
  c.id AS recruit_id,
  COALESCE(NULLIF(btrim(c.contact_name), ''), 'Unnamed') AS contact_name,
  c.stage,
  c.desk_status,
  CASE c.stage
    WHEN 'application' THEN '1 Application'
    WHEN 'contact' THEN '2 Contact'
    WHEN 'kyc' THEN '3 KYC'
    WHEN 'onboarded' THEN '4 Onboarded'
    WHEN 'closed' THEN '5 Closed'
    ELSE c.stage
  END AS desk_stage,
  CASE c.desk_status
    WHEN 'call_scheduled' THEN 'Call scheduled'
    WHEN 'called' THEN 'Called'
    WHEN 'follow_up' THEN 'Follow-up needed'
    WHEN 'unreachable' THEN 'Unreachable'
    WHEN 'not_a_fit' THEN 'Not a fit'
    WHEN 'duplicate' THEN 'Duplicate'
    ELSE NULL
  END AS status_label,
  CASE c.stage
    WHEN 'application' THEN 1
    WHEN 'contact' THEN 2
    WHEN 'kyc' THEN 3
    WHEN 'onboarded' THEN 4
    WHEN 'closed' THEN 5
    ELSE 9
  END AS stage_order,
  COALESCE(t.last_touch_at, c.created_at) AS stage_entered_at,
  GREATEST(
    0,
    (timezone('Africa/Kigali', now()))::date
      - (timezone('Africa/Kigali', COALESCE(t.last_touch_at, c.created_at)))::date
  ) AS days_in_stage,
  CASE
    WHEN GREATEST(
      0,
      (timezone('Africa/Kigali', now()))::date
        - (timezone('Africa/Kigali', COALESCE(t.last_touch_at, c.created_at)))::date
    ) <= 2 THEN '0–2 days'
    WHEN GREATEST(
      0,
      (timezone('Africa/Kigali', now()))::date
        - (timezone('Africa/Kigali', COALESCE(t.last_touch_at, c.created_at)))::date
    ) <= 5 THEN '3–5 days'
    ELSE '6 days or more'
  END AS wait_bucket,
  COALESCE(NULLIF(btrim(owner.full_name), ''), 'Unassigned') AS owner_name,
  c.decision,
  CASE c.decision
    WHEN 'approved' THEN 'Approved'
    WHEN 'not_a_fit' THEN 'Not a fit'
    WHEN 'unreachable' THEN 'Unreachable'
    WHEN 'follow_up' THEN 'Follow-up'
    ELSE 'No decision yet'
  END AS decision_label,
  c.decided_at,
  c.flock_size,
  c.quantity_min,
  CASE WHEN c.flock_size IS NOT NULL THEN c.flock_size ELSE c.quantity_min END AS stated_birds,
  c.ready_in_weeks,
  (c.flock_size IS NOT NULL OR c.quantity_min IS NOT NULL) AS has_stated_birds,
  (
    c.desk_status = 'call_scheduled'
    OR c.next_call_at IS NOT NULL
    OR COALESCE(t.call_booked, false)
  ) AS has_call_booked,
  COALESCE(s.has_assigned_scout, false) AS has_assigned_scout,
  NULLIF(btrim(scout.full_name), '') AS assigned_scout_name,
  c.want
  FROM recruitment_contacts c
  LEFT JOIN touch t ON t.contact_id = c.id
  LEFT JOIN users owner ON owner.id = c.owner_user_id
  LEFT JOIN scout_lots s ON s.user_id = c.user_id
  LEFT JOIN users scout ON scout.id = s.assigned_scout_user_id
;