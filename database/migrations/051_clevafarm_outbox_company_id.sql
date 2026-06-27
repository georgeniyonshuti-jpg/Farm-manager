-- Per-company isolation for ClevaFarm outbound sync outbox.

ALTER TABLE clevafarm_sync_outbox
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clevafarm_outbox_company_id
  ON clevafarm_sync_outbox (company_id)
  WHERE company_id IS NOT NULL;

COMMENT ON COLUMN clevafarm_sync_outbox.company_id IS
  'Farm Manager company that owns this sync row; used to resolve erpnext_config.erpnext_company before push.';
