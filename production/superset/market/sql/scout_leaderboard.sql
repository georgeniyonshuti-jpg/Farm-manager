SELECT u.id::text AS scout_id,
       COALESCE(NULLIF(trim(u.full_name), ''), u.email, 'Scout') AS name,
       COALESCE(NULLIF(trim(po.district), ''), NULLIF(trim(sa.district), ''), '—') AS district,
       COUNT(pl.id) AS lots,
       COALESCE(SUM(pl.bird_count), 0) AS birds,
       COUNT(DISTINCT pl.contact_phone) AS sellers,
       COUNT(pm.id) AS matches
  FROM users u
  LEFT JOIN people_onboarding po ON po.user_id = u.id
  LEFT JOIN scout_applications sa ON sa.user_id = u.id
  LEFT JOIN pipeline_lots pl
    ON pl.scouted_by = u.id
   AND pl.created_at >= now() - interval '30 days'
  LEFT JOIN pipeline_matches pm
    ON pm.lot_id = pl.id
   AND pm.status IN ('committed', 'delivered')
 WHERE (u.department_keys ? 'scout')
    OR u.role = 'vet'
    OR sa.user_id IS NOT NULL
    OR po.account_type = 'scout'
 GROUP BY u.id, u.full_name, u.email, po.district, sa.district
 ORDER BY lots DESC, birds DESC
;
