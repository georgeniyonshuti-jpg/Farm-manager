-- Runtime reference data and app settings (superuser-editable)

CREATE TABLE IF NOT EXISTS reference_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, value)
);

CREATE INDEX IF NOT EXISTS idx_reference_options_category_active
  ON reference_options (category, active, sort_order);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS breed_standards_document (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  document JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO breed_standards_document (id, document) VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('config_version', '1'),
  ('rate_limit_login_max', '10'),
  ('rate_limit_login_window_ms', '900000'),
  ('rate_limit_translate_max', '30'),
  ('rate_limit_translate_window_ms', '60000'),
  ('rate_limit_api_max', '200'),
  ('rate_limit_api_window_ms', '60000'),
  ('max_image_upload_bytes', '5242880'),
  ('demo_initial_count', '1000')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO reference_options (category, value, label, sort_order, active) VALUES
  ('breed', 'generic_broiler', 'generic_broiler', 0, true),
  ('breed', 'cobb_500', 'cobb_500', 1, true),
  ('breed', 'ross_308', 'ross_308', 2, true),

  ('slaughter_reason', 'planned_market', 'Planned market harvest', 0, true),
  ('slaughter_reason', 'target_weight_reached', 'Target weight reached', 1, true),
  ('slaughter_reason', 'emergency_cull', 'Emergency cull', 2, true),
  ('slaughter_reason', 'partial_harvest', 'Partial harvest', 3, true),
  ('slaughter_reason', 'other', 'Other', 4, true),

  ('treatment_reason', 'routine_prevention', 'Routine prevention', 0, true),
  ('treatment_reason', 'suspected_infection', 'Suspected infection', 1, true),
  ('treatment_reason', 'confirmed_infection', 'Confirmed infection', 2, true),
  ('treatment_reason', 'vet_directive', 'Vet directive', 3, true),
  ('treatment_reason', 'other', 'Other', 4, true),

  ('treatment_route', 'oral', 'oral', 0, true),
  ('treatment_route', 'injection', 'injection', 1, true),
  ('treatment_route', 'waterline', 'waterline', 2, true),
  ('treatment_route', 'spray', 'spray', 3, true),
  ('treatment_route', 'other', 'other', 4, true),

  ('treatment_dose_unit', 'ml', 'ml', 0, true),
  ('treatment_dose_unit', 'g', 'g', 1, true),
  ('treatment_dose_unit', 'mg', 'mg', 2, true),
  ('treatment_dose_unit', 'tablet', 'tablet', 3, true),
  ('treatment_dose_unit', 'drop', 'drop', 4, true),
  ('treatment_dose_unit', 'other', 'other', 5, true),

  ('medicine_stock_unit', 'ml', 'ml', 0, true),
  ('medicine_stock_unit', 'g', 'g', 1, true),
  ('medicine_stock_unit', 'doses', 'doses', 2, true),
  ('medicine_stock_unit', 'sachets', 'sachets', 3, true),

  ('medicine_category', 'vaccine', 'vaccine', 0, true),
  ('medicine_category', 'antibiotic', 'antibiotic', 1, true),
  ('medicine_category', 'coccidiostat', 'coccidiostat', 2, true),
  ('medicine_category', 'vitamin', 'vitamin', 3, true),
  ('medicine_category', 'electrolyte', 'electrolyte', 4, true),
  ('medicine_category', 'other', 'other', 5, true),

  ('medicine_admin_route', 'drinking_water', 'drinking water', 0, true),
  ('medicine_admin_route', 'feed_additive', 'feed additive', 1, true),
  ('medicine_admin_route', 'injection', 'injection', 2, true),
  ('medicine_admin_route', 'topical', 'topical', 3, true),

  ('inventory_procurement_reason', 'supplier_delivery', 'Supplier delivery', 0, true),
  ('inventory_procurement_reason', 'internal_transfer_in', 'Internal transfer in', 1, true),
  ('inventory_procurement_reason', 'returned_stock', 'Returned stock', 2, true),
  ('inventory_procurement_reason', 'other', 'Other', 3, true),

  ('inventory_consumption_reason', 'round_feed', 'Round feed', 0, true),
  ('inventory_consumption_reason', 'catchup_feed', 'Catch-up feed', 1, true),
  ('inventory_consumption_reason', 'spillage_adjusted', 'Spillage adjusted', 2, true),
  ('inventory_consumption_reason', 'other', 'Other', 3, true),

  ('inventory_adjust_reason', 'stock_count_correction', 'Stock count correction', 0, true),
  ('inventory_adjust_reason', 'damage_loss', 'Damage/loss', 1, true),
  ('inventory_adjust_reason', 'expired_feed', 'Expired feed', 2, true),
  ('inventory_adjust_reason', 'other', 'Other', 3, true),

  ('department_key', 'investor_memo', 'Investor memo channel', 0, true),
  ('department_key', 'credit_committee', 'Credit committee', 1, true),
  ('department_key', 'dispatch', 'Dispatch / logistics', 2, true),

  ('log_schedule_role', 'laborer', 'laborer', 0, true),
  ('log_schedule_role', 'dispatcher', 'dispatcher', 1, true),
  ('log_schedule_role', 'vet', 'vet', 2, true),
  ('log_schedule_role', 'vet_manager', 'vet_manager', 3, true),
  ('log_schedule_role', 'manager', 'manager', 4, true),
  ('log_schedule_role', 'procurement_officer', 'procurement_officer', 5, true),
  ('log_schedule_role', 'sales_coordinator', 'sales_coordinator', 6, true),

  ('role_label', 'laborer', 'Laborer', 0, true),
  ('role_label', 'dispatcher', 'Dispatcher', 1, true),
  ('role_label', 'procurement_officer', 'Procurement officer', 2, true),
  ('role_label', 'sales_coordinator', 'Sales coordinator', 3, true),
  ('role_label', 'vet', 'Veterinarian', 4, true),
  ('role_label', 'vet_manager', 'Vet manager', 5, true),
  ('role_label', 'investor', 'Investor (read-oriented)', 6, true),
  ('role_label', 'manager', 'Manager', 7, true),
  ('role_label', 'superuser', 'Superuser', 8, true)
ON CONFLICT (category, value) DO NOTHING;

COMMENT ON TABLE reference_options IS 'Superuser-managed dropdown values; validated on related API writes.';
COMMENT ON TABLE app_settings IS 'Scalar operational settings (rate limits, upload caps, etc.).';
COMMENT ON TABLE breed_standards_document IS 'JSON merged over data/breed_standards.json for growth curves.';
