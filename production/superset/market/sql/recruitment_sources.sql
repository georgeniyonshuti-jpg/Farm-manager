-- Live sellers this Kigali week by channel. Unknown sources stay Unattributed.
-- Opens are public-page opens. WhatsApp, scout, market visit, and word of mouth stay blank.
WITH bounds AS (
  SELECT (date_trunc('week', timezone('Africa/Kigali', now())))::date AS week_from
),
channel_of AS (
  SELECT raw,
         CASE lower(regexp_replace(COALESCE(raw, ''), '[^a-z0-9]+', '_', 'g'))
           WHEN 'facebook' THEN 'facebook_ads'
           WHEN 'fb' THEN 'facebook_ads'
           WHEN 'facebook_ads' THEN 'facebook_ads'
           WHEN 'instagram' THEN 'instagram_ads'
           WHEN 'ig' THEN 'instagram_ads'
           WHEN 'insta' THEN 'instagram_ads'
           WHEN 'instagram_ads' THEN 'instagram_ads'
           WHEN 'whatsapp' THEN 'whatsapp_direct_share'
           WHEN 'wa' THEN 'whatsapp_direct_share'
           WHEN 'whatsapp_direct_share' THEN 'whatsapp_direct_share'
           WHEN 'whatsapp_group_share' THEN 'whatsapp_group_share'
           WHEN 'whatsapp_ctwa_ads' THEN 'whatsapp_ctwa_ads'
           WHEN 'scout' THEN 'scout_referral'
           WHEN 'scout_referral' THEN 'scout_referral'
           WHEN 'market' THEN 'market_visit'
           WHEN 'market_visit' THEN 'market_visit'
           WHEN 'wom' THEN 'word_of_mouth'
           WHEN 'word_of_mouth' THEN 'word_of_mouth'
           WHEN 'google' THEN 'organic_search'
           WHEN 'organic_search' THEN 'organic_search'
           WHEN 'direct' THEN 'direct_unknown'
           WHEN 'direct_unknown' THEN 'direct_unknown'
           WHEN '' THEN 'unattributed'
           WHEN 'unknown' THEN 'unattributed'
           WHEN 'unattributed' THEN 'unattributed'
           ELSE 'unattributed'
         END AS channel
    FROM (
      SELECT first_touch_channel AS raw FROM analytics.person_facts
      UNION
      SELECT source FROM market_reach
    ) keys
),
labels AS (
  SELECT DISTINCT
         channel,
         CASE channel
           WHEN 'facebook_ads' THEN 'Facebook ads'
           WHEN 'instagram_ads' THEN 'Instagram ads'
           WHEN 'whatsapp_ctwa_ads' THEN 'WhatsApp click-to-ad'
           WHEN 'whatsapp_group_share' THEN 'WhatsApp group'
           WHEN 'whatsapp_direct_share' THEN 'WhatsApp'
           WHEN 'scout_referral' THEN 'Scout referral'
           WHEN 'market_visit' THEN 'Market visit'
           WHEN 'word_of_mouth' THEN 'Word of mouth'
           WHEN 'organic_search' THEN 'Search'
           WHEN 'direct_unknown' THEN 'Direct'
           ELSE 'Unattributed'
         END AS label
    FROM channel_of
  UNION
  SELECT 'unattributed', 'Unattributed'
),
live AS (
  SELECT c.channel, COUNT(*)::int AS live_sellers
    FROM analytics.person_facts p
    JOIN channel_of c ON c.raw IS NOT DISTINCT FROM p.first_touch_channel
    CROSS JOIN bounds b
   WHERE p.role = 'seller'
     AND NOT COALESCE(p.is_internal, false)
     AND NOT COALESCE(p.is_synthetic, false)
     AND (timezone('Africa/Kigali', p.activated_at))::date BETWEEN b.week_from AND b.week_from + 6
   GROUP BY c.channel
),
accounts AS (
  SELECT c.channel, COUNT(*)::int AS accounts
    FROM analytics.person_facts p
    JOIN channel_of c ON c.raw IS NOT DISTINCT FROM p.first_touch_channel
    CROSS JOIN bounds b
   WHERE NOT COALESCE(p.is_internal, false)
     AND NOT COALESCE(p.is_synthetic, false)
     AND (timezone('Africa/Kigali', p.created_at))::date BETWEEN b.week_from AND b.week_from + 6
   GROUP BY c.channel
),
opens AS (
  SELECT c.channel, COUNT(*)::int AS opens
    FROM market_reach m
    JOIN channel_of c ON c.raw IS NOT DISTINCT FROM m.source
    CROSS JOIN bounds b
   WHERE m.event_type = 'opened'
     AND m.day BETWEEN b.week_from AND b.week_from + 6
   GROUP BY c.channel
)
SELECT
  l.label AS channel,
  COALESCE(v.live_sellers, 0) AS live_sellers,
  COALESCE(a.accounts, 0) AS accounts,
  CASE
    WHEN l.channel IN (
      'whatsapp_group_share',
      'whatsapp_direct_share',
      'whatsapp_ctwa_ads',
      'scout_referral',
      'market_visit',
      'word_of_mouth'
    ) THEN NULL
    ELSE COALESCE(o.opens, 0)
  END AS opens,
  CASE WHEN l.channel = 'unattributed' THEN 1 ELSE 0 END AS pinned,
  CASE l.channel
    WHEN 'unattributed' THEN 1
    WHEN 'whatsapp_direct_share' THEN 2
    WHEN 'whatsapp_group_share' THEN 3
    WHEN 'whatsapp_ctwa_ads' THEN 4
    WHEN 'scout_referral' THEN 5
    WHEN 'market_visit' THEN 6
    WHEN 'word_of_mouth' THEN 7
    WHEN 'facebook_ads' THEN 8
    WHEN 'instagram_ads' THEN 9
    WHEN 'organic_search' THEN 10
    WHEN 'direct_unknown' THEN 11
    ELSE 12
  END AS channel_order
  FROM labels l
  LEFT JOIN live v ON v.channel = l.channel
  LEFT JOIN accounts a ON a.channel = l.channel
  LEFT JOIN opens o ON o.channel = l.channel
 WHERE COALESCE(v.live_sellers, 0) > 0
    OR COALESCE(a.accounts, 0) > 0
    OR COALESCE(o.opens, 0) > 0
    OR l.channel = 'unattributed'
 ORDER BY pinned, live_sellers DESC, channel
;
