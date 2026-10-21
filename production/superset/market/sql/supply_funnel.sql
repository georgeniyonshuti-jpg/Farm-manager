SELECT 'visits' AS stage, 1 AS stage_order,
       (SELECT COUNT(*) FROM market_reach
         WHERE day >= CURRENT_DATE - 30
           AND event_type = 'opened') AS count
UNION ALL
SELECT 'signups', 2,
       (SELECT COUNT(*) FROM signup_attempts
         WHERE created_at >= now() - interval '30 days'
           AND outcome = 'succeeded'
           AND account_type IN ('farmer', 'seller'))
UNION ALL
SELECT 'onboarded', 3,
       (SELECT COUNT(*) FROM people_onboarding
         WHERE account_type = 'farmer'
           AND stage IN ('contacted', 'call_booked', 'onboarded', 'active')
           AND created_at >= now() - interval '30 days')
UNION ALL
SELECT 'listed', 4,
       (SELECT COUNT(*) FROM pipeline_lots
         WHERE created_at >= now() - interval '30 days')
UNION ALL
SELECT 'first_sale', 5,
       (SELECT COUNT(DISTINCT lot_id) FROM pipeline_matches
         WHERE created_at >= now() - interval '30 days'
           AND status IN ('committed', 'delivered'))
ORDER BY stage_order
;
