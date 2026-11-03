-- Birds people said they will have, by how many weeks until they are ready.
-- flock_size is used when it was answered. quantity_min is used only when
-- flock_size is blank. If both are blank, the person is not in this chart.
-- A week with no answer stays in the list with a null total. Null is not zero birds.
WITH answered AS (
  SELECT ready_in_weeks,
         CASE WHEN flock_size IS NOT NULL THEN flock_size ELSE quantity_min END AS stated_birds
    FROM recruitment_contacts
   WHERE flock_size IS NOT NULL OR quantity_min IS NOT NULL
)
SELECT
  w.week_order,
  w.ready_label,
  SUM(a.stated_birds)::int AS stated_birds
  FROM (
    SELECT generate_series AS week_order,
           generate_series::text || ' weeks' AS ready_label
      FROM generate_series(0, 8)
  ) w
  LEFT JOIN answered a ON a.ready_in_weeks = w.week_order
 GROUP BY w.week_order, w.ready_label
 UNION ALL
SELECT 9,
       'Week not said',
       SUM(stated_birds)::int
  FROM answered
 WHERE ready_in_weeks IS NULL
HAVING SUM(stated_birds) IS NOT NULL
 ORDER BY 1
;