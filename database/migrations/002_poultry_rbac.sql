-- Role assignments: one row per user per agricultural role (investor = read-only at app layer)

CREATE TABLE poultry_user_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
  role            poultry_app_role NOT NULL,
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by      TEXT REFERENCES app_users (id) ON DELETE SET NULL,
  UNIQUE (user_id, role)
);

CREATE INDEX idx_poultry_user_roles_user ON poultry_user_roles (user_id);
CREATE INDEX idx_poultry_user_roles_role ON poultry_user_roles (role);

COMMENT ON TABLE poultry_user_roles IS 'AgriculturalModule RBAC; financing module uses separate grants.';
