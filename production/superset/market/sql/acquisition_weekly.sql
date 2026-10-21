-- Recruitment / Acquisition: weekly opens + accounts by channel (utm/source).
SELECT date_trunc('week', day)::date AS week,
       lower(COALESCE(NULLIF(trim(source), ''), 'direct')) AS source,
       COUNT(*) FILTER (WHERE event_type = 'opened')::int AS opens,
       COUNT(*) FILTER (WHERE event_type = 'join_started')::int AS join_started
  FROM market_reach
 WHERE day >= (CURRENT_DATE - interval '84 days')
 GROUP BY 1, 2
 ORDER BY 1, 2
;
