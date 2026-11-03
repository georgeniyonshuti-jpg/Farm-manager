-- People in KYC or Active, split by whether any of their flocks names a scout.
-- Lots are counted once per person before the join.
-- Both numbers are zero when nobody has been handed to a scout yet.
WITH scout_lots AS (
  SELECT fp.owner_user_id AS user_id,
         BOOL_OR(l.assigned_scout_user_id IS NOT NULL) AS has_scout
    FROM farm_profiles fp
    JOIN pipeline_lots l ON l.farm_profile_id = fp.id
   WHERE fp.owner_user_id IS NOT NULL
   GROUP BY fp.owner_user_id
),
ready AS (
  SELECT COALESCE(s.has_scout, false) AS has_scout
    FROM recruitment_contacts c
    LEFT JOIN scout_lots s ON s.user_id = c.user_id
   WHERE c.stage IN ('kyc', 'onboarded')
)
SELECT
  COUNT(*) FILTER (WHERE has_scout)::int AS handed,
  COUNT(*) FILTER (WHERE NOT has_scout)::int AS not_handed
  FROM ready
;