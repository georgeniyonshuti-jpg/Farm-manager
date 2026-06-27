-- Tenant-scoped company_admin role reference options.

INSERT INTO reference_options (category, value, label, sort_order, is_active)
VALUES
  ('log_schedule_role', 'company_admin', 'company_admin', 7, true),
  ('role_label', 'company_admin', 'Company admin', 7, true)
ON CONFLICT (category, value) DO NOTHING;
