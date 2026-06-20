ALTER TABLE public.erp_exchange_cases
  ADD COLUMN IF NOT EXISTS replacement_tracking_id text,
  ADD COLUMN IF NOT EXISTS replacement_courier text,
  ADD COLUMN IF NOT EXISTS original_item_restocked boolean NOT NULL DEFAULT false;