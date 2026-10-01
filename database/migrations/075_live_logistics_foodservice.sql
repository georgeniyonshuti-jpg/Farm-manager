-- Live logistics: who moves birds + foodservice min order on lots.

ALTER TABLE pipeline_matches
  ADD COLUMN IF NOT EXISTS delivery_actor TEXT
    CHECK (delivery_actor IS NULL OR delivery_actor IN ('buyer', 'farm', 'cleva'));

COMMENT ON COLUMN pipeline_matches.delivery_actor IS
  'Who moves birds: buyer (collect), farm (farm delivery), or cleva (ops-arranged). Distinct from merchant tier cleva_run.';

-- Backfill from existing collect/delivery flag.
UPDATE pipeline_matches
   SET delivery_actor = CASE
     WHEN collect_or_delivery = 'delivery' THEN 'farm'
     WHEN collect_or_delivery = 'collect' THEN 'buyer'
     ELSE delivery_actor
   END
 WHERE delivery_actor IS NULL
   AND collect_or_delivery IN ('collect', 'delivery');

ALTER TABLE pipeline_lots
  ADD COLUMN IF NOT EXISTS min_order_birds INTEGER
    CHECK (min_order_birds IS NULL OR min_order_birds >= 1);

COMMENT ON COLUMN pipeline_lots.min_order_birds IS
  'Optional seller MOQ. Buyer UI floors at max(10, min_order_birds); ranked board MOQ stays 50.';
