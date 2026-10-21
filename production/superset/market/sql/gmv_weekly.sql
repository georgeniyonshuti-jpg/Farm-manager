SELECT date_trunc('week', created_at)::date AS week,
       COALESCE(SUM(birds), 0) AS birds,
       COALESCE(SUM(COALESCE(buyer_paid_rwf, birds * COALESCE(agreed_price_per_kg, 0) * 1.5)), 0) AS gmv_rwf
  FROM pipeline_matches
 WHERE created_at >= now() - interval '84 days'
   AND status IN ('committed', 'delivered')
 GROUP BY 1
 ORDER BY 1
;
