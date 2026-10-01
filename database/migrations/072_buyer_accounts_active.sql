-- Buyer/butcher login accounts are live on signup. Flip leftover review holds
-- for linked accounts so existing butchers can browse and request immediately.
UPDATE pipeline_buyers
   SET verification_status = 'verified',
       verified_at = COALESCE(verified_at, now()),
       updated_at = now()
 WHERE verification_status = 'pending'
   AND COALESCE(active, true) = true
   AND user_id IS NOT NULL;
