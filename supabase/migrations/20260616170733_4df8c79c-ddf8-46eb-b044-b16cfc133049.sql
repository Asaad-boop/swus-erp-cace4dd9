
ALTER TABLE public.mkt_ad_accounts
  ADD COLUMN IF NOT EXISTS app_id text,
  ADD COLUMN IF NOT EXISTS app_secret text,
  ADD COLUMN IF NOT EXISTS usd_to_bdt_rate numeric NOT NULL DEFAULT 110;
