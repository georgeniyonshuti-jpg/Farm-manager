WITH lot_regions AS (
  SELECT COALESCE(NULLIF(trim(district), ''), 'Unknown') AS district,
         COUNT(*) FILTER (WHERE status IN ('open', 'partial', 'matched')) AS listings,
         COALESCE(SUM(bird_count) FILTER (WHERE status IN ('open', 'partial')), 0) AS birds_listed
    FROM pipeline_lots
   GROUP BY 1
),
buyer_regions AS (
  SELECT COALESCE(NULLIF(trim(district), ''), 'Unknown') AS district,
         COUNT(*) AS buyers
    FROM pipeline_buyers
   WHERE active IS TRUE
   GROUP BY 1
)
SELECT l.district, l.listings, l.birds_listed, COALESCE(b.buyers, 0) AS buyers
  FROM lot_regions l
  LEFT JOIN buyer_regions b ON b.district = l.district
 ORDER BY l.birds_listed DESC
;
