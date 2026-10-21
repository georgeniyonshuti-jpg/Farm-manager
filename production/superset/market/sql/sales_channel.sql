SELECT
  CASE WHEN pl.source = 'managed_flock' THEN 'app' ELSE 'scout' END AS channel,
  COUNT(*) AS matches,
  COALESCE(SUM(pm.birds), 0) AS birds,
  COALESCE(SUM(COALESCE(pm.buyer_paid_rwf, pm.birds * COALESCE(pm.agreed_price_per_kg, 0) * 1.5)), 0) AS gmv_rwf
  FROM pipeline_matches pm
  JOIN pipeline_lots pl ON pl.id = pm.lot_id
 WHERE pm.created_at >= now() - interval '30 days'
   AND pm.status IN ('committed', 'delivered')
 GROUP BY 1
;
