DROP TABLE IF EXISTS public._backup_phase4b_brand_remap;
CREATE TABLE public._backup_phase4b_brand_remap AS
SELECT 'mkt_campaigns'::text AS tbl, id::text AS row_id, brand_id::text AS prior_brand_id, external_id::text AS ref
FROM public.mkt_campaigns
UNION ALL
SELECT 'mkt_insights_daily', id::text, brand_id::text, campaign_id::text
FROM public.mkt_insights_daily
UNION ALL
SELECT 'mkt_adsets', id::text, brand_id::text, external_id::text
FROM public.mkt_adsets
UNION ALL
SELECT 'mkt_ads', id::text, brand_id::text, external_id::text
FROM public.mkt_ads
UNION ALL
SELECT 'mkt_ad_accounts', id::text, brand_id::text, external_id::text
FROM public.mkt_ad_accounts
WHERE id = '21741ec7-5518-4bdc-867e-20a222481f5d'
UNION ALL
SELECT 'mkt_ad_account_brands', ad_account_id::text || ':' || brand_id::text, brand_id::text, is_primary::text
FROM public.mkt_ad_account_brands
WHERE ad_account_id = '21741ec7-5518-4bdc-867e-20a222481f5d';

UPDATE public.mkt_campaigns
SET brand_id = '40abf6fa-404e-4c3f-b0df-f35c1535e95d'
WHERE external_id IN (
  '120247618257600173','120247658710570173','120247669789470173',
  '120247669678030173','120247793952660173'
);

UPDATE public.mkt_campaigns
SET brand_id = '1f1f366d-ad85-4513-85ab-2dbb6b23c513'
WHERE account_id = '21741ec7-5518-4bdc-867e-20a222481f5d'
  AND external_id NOT IN (
    '120247618257600173','120247658710570173','120247669789470173',
    '120247669678030173','120247793952660173'
  );

UPDATE public.mkt_adsets a SET brand_id = c.brand_id
FROM public.mkt_campaigns c WHERE a.campaign_id = c.id;

UPDATE public.mkt_ads a SET brand_id = c.brand_id
FROM public.mkt_campaigns c WHERE a.campaign_id = c.id;

UPDATE public.mkt_insights_daily i SET brand_id = c.brand_id
FROM public.mkt_campaigns c
WHERE i.campaign_id = c.id AND c.brand_id IS NOT NULL;

UPDATE public.mkt_ad_accounts
SET brand_id = '1f1f366d-ad85-4513-85ab-2dbb6b23c513'
WHERE id = '21741ec7-5518-4bdc-867e-20a222481f5d';

-- Flip Toyora off primary FIRST, then upsert HobbyShop as primary
UPDATE public.mkt_ad_account_brands
SET is_primary = false
WHERE ad_account_id = '21741ec7-5518-4bdc-867e-20a222481f5d'
  AND brand_id = '40abf6fa-404e-4c3f-b0df-f35c1535e95d';

INSERT INTO public.mkt_ad_account_brands (ad_account_id, brand_id, is_primary)
VALUES ('21741ec7-5518-4bdc-867e-20a222481f5d', '1f1f366d-ad85-4513-85ab-2dbb6b23c513', true)
ON CONFLICT (ad_account_id, brand_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;