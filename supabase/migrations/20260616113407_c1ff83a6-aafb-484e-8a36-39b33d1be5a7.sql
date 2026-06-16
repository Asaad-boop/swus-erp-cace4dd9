
ALTER TABLE public.erp_accounts ADD COLUMN IF NOT EXISTS wallet_type text NOT NULL DEFAULT 'other';
ALTER TABLE public.erp_accounts ADD CONSTRAINT erp_accounts_wallet_type_check CHECK (wallet_type IN ('cash','bank','mfs','courier_wallet','equity','loan','other'));

-- backfill: map account_type → wallet_type heuristics
UPDATE public.erp_accounts SET wallet_type =
  CASE
    WHEN lower(account_type) LIKE '%cash%' THEN 'cash'
    WHEN lower(account_type) LIKE '%bank%' THEN 'bank'
    WHEN lower(account_type) LIKE '%mfs%' OR lower(account_type) LIKE '%mobile%' OR lower(name) LIKE '%bkash%' OR lower(name) LIKE '%nagad%' OR lower(name) LIKE '%rocket%' THEN 'mfs'
    WHEN lower(account_type) LIKE '%courier%' THEN 'courier_wallet'
    WHEN lower(account_type) LIKE '%equity%' OR lower(account_type) LIKE '%capital%' OR lower(account_type) LIKE '%owner%' THEN 'equity'
    WHEN lower(account_type) LIKE '%loan%' THEN 'loan'
    ELSE 'other'
  END
WHERE wallet_type = 'other';
