SELECT 'visits' AS stage, 1 AS stage_order,
       (SELECT COUNT(*) FROM market_reach
         WHERE day >= CURRENT_DATE - 30 AND event_type = 'opened') AS count
UNION ALL
SELECT 'signups', 2,
       (SELECT COUNT(*) FROM signup_attempts
         WHERE created_at >= now() - interval '30 days'
           AND outcome = 'succeeded' AND account_type = 'buyer')
UNION ALL
SELECT 'onboarded', 3,
       (SELECT COUNT(*) FROM people_onboarding
         WHERE account_type = 'buyer'
           AND stage IN ('contacted', 'call_booked', 'onboarded', 'active')
           AND created_at >= now() - interval '30 days')
UNION ALL
SELECT 'demands', 4,
       (SELECT COUNT(*) FROM pipeline_demands
         WHERE created_at >= now() - interval '30 days')
UNION ALL
SELECT 'paid', 5,
       (SELECT COUNT(*) FROM pipeline_matches
         WHERE created_at >= now() - interval '30 days'
           AND buyer_payment_status = 'paid')
ORDER BY stage_order
;
