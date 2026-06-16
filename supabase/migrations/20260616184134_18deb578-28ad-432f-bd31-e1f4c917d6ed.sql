
-- Add 'meta_ads' to marketing expense category enum
ALTER TYPE public.mkt_expense_category ADD VALUE IF NOT EXISTS 'meta_ads';

-- Track which Meta ad account & source posted a manual expense (for idempotent auto-posting)
ALTER TABLE public.mkt_manual_expenses
  ADD COLUMN IF NOT EXISTS mkt_ad_account_id uuid REFERENCES public.mkt_ad_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- One auto-posted row per (ad account, date)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mkt_manual_expenses_meta_auto
  ON public.mkt_manual_expenses(brand_id, mkt_ad_account_id, date)
  WHERE source = 'meta_auto';

-- Per-account auto-posting config
ALTER TABLE public.mkt_ad_accounts
  ADD COLUMN IF NOT EXISTS auto_post_to_finance boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS finance_wallet_id uuid REFERENCES public.erp_accounts(id) ON DELETE SET NULL;
