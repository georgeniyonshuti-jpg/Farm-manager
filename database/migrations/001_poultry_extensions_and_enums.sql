-- Precision Poultry — AgriculturalModule (isolated from FinancingModule)
-- PostgreSQL. Run after your core auth `users` table exists; adjust FK if your table name differs.

-- Optional: ensure pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Application roles (personas from RBAC spec)
CREATE TYPE poultry_app_role AS ENUM (
  'laborer',
  'veterinarian',
  'vet_manager',
  'procurement_officer',
  'sales_coordinator',
  'management',
  'investor'
);

CREATE TYPE poultry_flock_status AS ENUM (
  'planned',
  'active',
  'completed',
  'closed'
);

CREATE TYPE poultry_inventory_item_type AS ENUM (
  'starter_feed',
  'grower_feed',
  'finisher_feed',
  'medicine',
  'charcoal',
  'other'
);

CREATE TYPE poultry_daily_log_validation_status AS ENUM (
  'draft',
  'pending_review',
  'vet_approval_required',
  'approved',
  'rejected'
);
