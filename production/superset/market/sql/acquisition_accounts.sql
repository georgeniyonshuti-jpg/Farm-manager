-- Weekly signup accounts by channel (succeeded attempts).
SELECT date_trunc('week', created_at)::date AS week,
       lower(COALESCE(NULLIF(trim(source), ''), 'direct')) AS source,
       COUNT(*)::int AS attempts,
       COUNT(*) FILTER (WHERE outcome = 'succeeded')::int AS accounts,
       COUNT(*) FILTER (WHERE outcome = 'failed')::int AS failed
  FROM signup_attempts
 WHERE created_at >= now() - interval '84 days'
 GROUP BY 1, 2
 ORDER BY 1, 2
;
