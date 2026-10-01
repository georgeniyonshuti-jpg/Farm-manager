-- Drop legacy Odoo sync outbox and links. ERPNext uses clevafarm_sync_outbox.
-- Keep accounting_status columns (historical values may still say sent_to_odoo).

DROP TABLE IF EXISTS odoo_sync_links;
DROP TABLE IF EXISTS odoo_sync_outbox;

-- Prefer ERPNext wording in billing plan feature lists where Odoo was named.
UPDATE billing_plans
   SET features = replace(features::text, 'Odoo integration', 'ERPNext integration')::jsonb
 WHERE features::text LIKE '%Odoo integration%';

-- Scrub odoo_send from stored page-access arrays (jsonb or text[] depending on schema).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'page_access'
  ) THEN
    -- text[] form
    BEGIN
      UPDATE users
         SET page_access = array_remove(page_access, 'odoo_send')
       WHERE page_access IS NOT NULL AND 'odoo_send' = ANY (page_access);
    EXCEPTION WHEN others THEN
      -- jsonb form
      BEGIN
        UPDATE users
           SET page_access = COALESCE(
             (
               SELECT jsonb_agg(elem)
                 FROM jsonb_array_elements_text(page_access::jsonb) AS elem
                WHERE elem <> 'odoo_send'
             ),
             '[]'::jsonb
           )
         WHERE page_access::text LIKE '%odoo_send%';
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END;
  END IF;
END $$;
