-- Market Overview KPIs (virtual dataset). Filter in charts with temporal range on day.
SELECT
  CURRENT_DATE AS day,
  (SELECT COALESCE(SUM(birds), 0) FROM pipeline_matches
    WHERE created_at >= now() - interval '30 days'
      AND status IN ('committed', 'delivered')) AS birds_sold,
  (SELECT COALESCE(SUM(COALESCE(buyer_paid_rwf, birds * COALESCE(agreed_price_per_kg, 0) * 1.5)), 0)
     FROM pipeline_matches
    WHERE created_at >= now() - interval '30 days'
      AND status IN ('committed', 'delivered')) AS gmv_rwf,
  (SELECT COUNT(*) FROM pipeline_lots WHERE status IN ('open', 'partial')) AS listings_live,
  (SELECT COUNT(*) FROM pipeline_buyers WHERE active IS TRUE) AS active_buyers,
  (SELECT COUNT(DISTINCT owner_user_id) FROM farm_profiles
    WHERE verification_status IN ('verified', 'pending')) AS active_sellers,
  (SELECT COUNT(*) FROM pipeline_matches
    WHERE created_at >= now() - interval '30 days'
      AND status IN ('committed', 'delivered')) AS matches_30d,
  (SELECT COUNT(*) FROM pipeline_lots
    WHERE created_at >= now() - interval '30 days') AS lots_30d
;
