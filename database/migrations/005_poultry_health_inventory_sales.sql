-- Health & biosecurity (vet personas)

CREATE TABLE poultry_health_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id            UUID NOT NULL REFERENCES poultry_flocks (id) ON DELETE CASCADE,
  veterinarian_id     UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  record_date         DATE NOT NULL,
  diagnosis           TEXT NOT NULL,
  treatment           TEXT,
  withdrawal_days     INTEGER NOT NULL DEFAULT 0 CHECK (withdrawal_days >= 0),
  cost                NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poultry_health_flock ON poultry_health_records (flock_id);
CREATE INDEX idx_poultry_health_vet ON poultry_health_records (veterinarian_id);

-- Link meds/feed/charcoal movements (procurement); optional flock_id for batch-specific allocation

CREATE TABLE poultry_inventory_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id            UUID REFERENCES poultry_flocks (id) ON DELETE SET NULL,
  recorded_by         UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  item_type           poultry_inventory_item_type NOT NULL,
  quantity            NUMERIC(14, 3) NOT NULL,
  unit                TEXT NOT NULL DEFAULT 'kg',
  unit_cost           NUMERIC(14, 4) NOT NULL CHECK (unit_cost >= 0),
  expiry_date         DATE,
  reference           TEXT,
  transaction_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poultry_inventory_flock ON poultry_inventory_transactions (flock_id);
CREATE INDEX idx_poultry_inventory_type ON poultry_inventory_transactions (item_type);
CREATE INDEX idx_poultry_inventory_date ON poultry_inventory_transactions (transaction_date);

-- Sales / harvest

CREATE TABLE poultry_sales_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id            UUID NOT NULL REFERENCES poultry_flocks (id) ON DELETE CASCADE,
  recorded_by         UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  order_date          DATE NOT NULL,
  number_of_birds     INTEGER NOT NULL CHECK (number_of_birds > 0),
  total_weight_kg     NUMERIC(14, 3) NOT NULL CHECK (total_weight_kg > 0),
  price_per_kg        NUMERIC(14, 4) NOT NULL CHECK (price_per_kg >= 0),
  buyer_name          TEXT,
  buyer_contact       TEXT,
  buyer_notes         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poultry_sales_flock ON poultry_sales_orders (flock_id);
CREATE INDEX idx_poultry_sales_date ON poultry_sales_orders (order_date);
