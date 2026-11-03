-- CIG companies are internal. They are not on a free trial and have no plan limit.
-- Matches the CIG ERP site (https://cig.*) and the Cleva Investments Group company name,
-- plus the original host farms.
-- Undo: set plan and trial_ends_at by hand for any row that should be a trial again.

UPDATE companies c
SET plan = CASE WHEN c.plan = 'trial' THEN 'enterprise' ELSE c.plan END,
    trial_ends_at = NULL,
    payment_overdue = false,
    updated_at = now()
WHERE (c.plan = 'trial' OR c.trial_ends_at IS NOT NULL OR c.payment_overdue = true)
  AND (
    c.slug IN ('default-farm', 'cleva-tech', 'cleva-technologies')
    OR EXISTS (
      SELECT 1
      FROM erpnext_config e
      WHERE e.company_id = c.id
        AND (
          lower(trim(e.erpnext_company)) = 'cleva investments group'
          OR lower(regexp_replace(COALESCE(e.erpnext_base_url, ''), '/+$', '')) ~ '^https://cig\.'
        )
    )
  );

UPDATE billing_subscriptions b
SET status = 'active',
    plan = CASE WHEN b.plan = 'trial' THEN 'enterprise' ELSE b.plan END,
    trial_ends_at = NULL,
    updated_at = now()
WHERE (b.plan = 'trial' OR b.status = 'trialing' OR b.trial_ends_at IS NOT NULL)
  AND b.company_id IN (
    SELECT c.id
    FROM companies c
    WHERE c.slug IN ('default-farm', 'cleva-tech', 'cleva-technologies')
       OR EXISTS (
         SELECT 1
         FROM erpnext_config e
         WHERE e.company_id = c.id
           AND (
             lower(trim(e.erpnext_company)) = 'cleva investments group'
             OR lower(regexp_replace(COALESCE(e.erpnext_base_url, ''), '/+$', '')) ~ '^https://cig\.'
           )
       )
  );
