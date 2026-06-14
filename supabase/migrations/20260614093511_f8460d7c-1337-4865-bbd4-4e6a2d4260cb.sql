ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS advance_source text,
  ADD COLUMN IF NOT EXISTS advance_payment_number text,
  ADD COLUMN IF NOT EXISTS advance_txn_id text;