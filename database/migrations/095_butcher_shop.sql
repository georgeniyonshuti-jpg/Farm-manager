-- Butcher shop. Households order chicken on market.cleva.rw, partner butchers
-- fill the order, Cleva takes payment and pays the butcher minus commission.
-- See docs/butcher-shop-plan.md.
--
-- New tables only, plus 'butcher' added to the recruitment and contract
-- `want` checks. No existing row is changed.
-- Customer phone and address stay until a retention period is chosen.
-- This migration does not delete them on a timer.
--
-- Undo:
--   DROP TABLE IF EXISTS shop_order_events, shop_settlements, shop_order_lines,
--     shop_orders, shop_butcher_zones, shop_butchers, shop_zones, shop_products,
--     shop_settings;
--   Then put the three `want` checks back to ('sell', 'buy', 'scout'),
--   after moving any 'butcher' rows.

ALTER TABLE recruitment_contacts DROP CONSTRAINT IF EXISTS recruitment_contacts_want_check;
ALTER TABLE recruitment_contacts
  ADD CONSTRAINT recruitment_contacts_want_check CHECK (want IN ('sell', 'buy', 'scout', 'butcher'));

ALTER TABLE seller_contract_templates DROP CONSTRAINT IF EXISTS seller_contract_templates_want_check;
ALTER TABLE seller_contract_templates
  ADD CONSTRAINT seller_contract_templates_want_check CHECK (want IN ('sell', 'buy', 'scout', 'butcher'));

ALTER TABLE seller_contracts DROP CONSTRAINT IF EXISTS seller_contracts_want_check;
ALTER TABLE seller_contracts
  ADD CONSTRAINT seller_contracts_want_check CHECK (want IN ('sell', 'buy', 'scout', 'butcher'));

CREATE TABLE IF NOT EXISTS shop_settings (
  id                     SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  commission_pct         NUMERIC(5, 2) NOT NULL DEFAULT 12
                           CHECK (commission_pct >= 0 AND commission_pct <= 100),
  min_order_rwf          INTEGER NOT NULL DEFAULT 10000 CHECK (min_order_rwf >= 0),
  min_order_items        INTEGER NOT NULL DEFAULT 2 CHECK (min_order_items >= 0),
  pay_within_minutes     INTEGER NOT NULL DEFAULT 30 CHECK (pay_within_minutes > 0),
  accept_within_minutes  INTEGER NOT NULL DEFAULT 20 CHECK (accept_within_minutes > 0),
  is_open                BOOLEAN NOT NULL DEFAULT false,
  closed_message         TEXT NOT NULL DEFAULT '',
  order_hours            JSONB NOT NULL DEFAULT '{"open": "08:00", "close": "18:00"}'::jsonb,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by             UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO shop_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS shop_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku             TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  name_rw         TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  description_rw  TEXT NOT NULL DEFAULT '',
  weight_min_kg   NUMERIC(6, 3) CHECK (weight_min_kg IS NULL OR weight_min_kg > 0),
  weight_max_kg   NUMERIC(6, 3) CHECK (weight_max_kg IS NULL OR weight_max_kg > 0),
  price_rwf       INTEGER NOT NULL CHECK (price_rwf > 0),
  photo_url       TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (weight_min_kg IS NULL OR weight_max_kg IS NULL OR weight_max_kg >= weight_min_kg)
);

-- A sector belongs to at most one active zone. The server checks that on save,
-- because a cross-row array check is not a plain constraint.
CREATE TABLE IF NOT EXISTS shop_zones (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  district                TEXT NOT NULL,
  sectors                 TEXT[] NOT NULL DEFAULT '{}',
  delivery_fee_rwf        INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_rwf >= 0),
  free_delivery_over_rwf  INTEGER CHECK (free_delivery_over_rwf IS NULL OR free_delivery_over_rwf >= 0),
  active                  BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shop_butchers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  shop_name           TEXT NOT NULL,
  owner_name          TEXT NOT NULL DEFAULT '',
  phone               TEXT,
  whatsapp            TEXT,
  district            TEXT,
  sector              TEXT,
  address_note        TEXT NOT NULL DEFAULT '',
  licence_ref         TEXT NOT NULL DEFAULT '',
  licence_photo_url   TEXT,
  momo_payout_phone   TEXT,
  momo_payout_name    TEXT NOT NULL DEFAULT '',
  contract_id         UUID REFERENCES seller_contracts(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'active', 'paused', 'ended')),
  notes               TEXT NOT NULL DEFAULT '',
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shop_butcher_zones (
  butcher_id  UUID NOT NULL REFERENCES shop_butchers(id) ON DELETE CASCADE,
  zone_id     UUID NOT NULL REFERENCES shop_zones(id) ON DELETE CASCADE,
  priority    INTEGER NOT NULL DEFAULT 100,
  PRIMARY KEY (butcher_id, zone_id)
);

CREATE INDEX IF NOT EXISTS shop_butcher_zones_zone_idx
  ON shop_butcher_zones (zone_id, priority);

CREATE TABLE IF NOT EXISTS shop_orders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref                       TEXT NOT NULL UNIQUE,
  track_token_hash          TEXT NOT NULL,
  customer_name             TEXT NOT NULL,
  customer_phone            TEXT NOT NULL,
  district                  TEXT NOT NULL,
  sector                    TEXT NOT NULL,
  address_note              TEXT NOT NULL DEFAULT '',
  zone_id                   UUID REFERENCES shop_zones(id) ON DELETE SET NULL,
  butcher_id                UUID REFERENCES shop_butchers(id) ON DELETE SET NULL,
  subtotal_rwf              INTEGER NOT NULL CHECK (subtotal_rwf >= 0),
  delivery_fee_rwf          INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_rwf >= 0),
  total_rwf                 INTEGER NOT NULL CHECK (total_rwf >= 0),
  commission_pct            NUMERIC(5, 2) NOT NULL,
  commission_rwf            INTEGER NOT NULL CHECK (commission_rwf >= 0),
  butcher_payout_rwf        INTEGER NOT NULL CHECK (butcher_payout_rwf >= 0),
  delivery_paid_by          TEXT NOT NULL CHECK (delivery_paid_by IN ('customer', 'cleva')),
  cleva_delivery_cost_rwf   INTEGER CHECK (cleva_delivery_cost_rwf IS NULL OR cleva_delivery_cost_rwf >= 0),
  payment_status            TEXT NOT NULL DEFAULT 'unpaid'
                              CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'refunded')),
  payer_phone               TEXT,
  momo_txn_id               TEXT,
  paid_confirmed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  paid_confirmed_at         TIMESTAMPTZ,
  status                    TEXT NOT NULL DEFAULT 'placed'
                              CHECK (status IN (
                                'placed', 'payment_pending', 'paid', 'accepted', 'ready',
                                'out_for_delivery', 'delivered', 'problem', 'resolved',
                                'cancelled', 'expired'
                              )),
  problem_kind              TEXT CHECK (problem_kind IS NULL OR problem_kind IN ('short', 'wrong', 'late', 'quality', 'other')),
  problem_note              TEXT,
  cancel_reason             TEXT,
  source                    TEXT,
  attribution               JSONB NOT NULL DEFAULT '{}'::jsonb,
  placed_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at               TIMESTAMPTZ,
  ready_at                  TIMESTAMPTZ,
  out_at                    TIMESTAMPTZ,
  delivered_at              TIMESTAMPTZ,
  cancelled_at              TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (total_rwf = subtotal_rwf + delivery_fee_rwf)
);

CREATE INDEX IF NOT EXISTS shop_orders_status_idx ON shop_orders (status, placed_at DESC);
CREATE INDEX IF NOT EXISTS shop_orders_butcher_idx ON shop_orders (butcher_id, status);

CREATE TABLE IF NOT EXISTS shop_order_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES shop_products(id) ON DELETE SET NULL,
  sku             TEXT NOT NULL,
  name            TEXT NOT NULL,
  weight_min_kg   NUMERIC(6, 3),
  weight_max_kg   NUMERIC(6, 3),
  unit_price_rwf  INTEGER NOT NULL CHECK (unit_price_rwf >= 0),
  qty             INTEGER NOT NULL CHECK (qty > 0),
  line_total_rwf  INTEGER NOT NULL CHECK (line_total_rwf >= 0),
  CHECK (line_total_rwf = unit_price_rwf * qty)
);

CREATE INDEX IF NOT EXISTS shop_order_lines_order_idx ON shop_order_lines (order_id);

CREATE TABLE IF NOT EXISTS shop_settlements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  side          TEXT NOT NULL CHECK (side IN ('customer_in', 'butcher_out', 'delivery_out', 'refund')),
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  amount_rwf    INTEGER NOT NULL CHECK (amount_rwf >= 0),
  method        TEXT NOT NULL DEFAULT 'momo',
  phone         TEXT,
  reference     TEXT,
  note          TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS shop_settlements_order_idx ON shop_settlements (order_id, side);

CREATE TABLE IF NOT EXISTS shop_order_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
  actor_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL,
  from_status    TEXT,
  to_status      TEXT,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shop_order_events_order_idx ON shop_order_events (order_id, created_at);
