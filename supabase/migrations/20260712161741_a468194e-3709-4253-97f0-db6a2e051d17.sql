-- Add printed_at tracking to orders (reversible: DROP COLUMN)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS printed_at timestamptz NULL;

-- Partial index for "Not Printed" filter (small, fast)
CREATE INDEX IF NOT EXISTS idx_orders_not_printed
  ON public.orders (created_at DESC)
  WHERE printed_at IS NULL;

-- Partial index for "Printed" filter
CREATE INDEX IF NOT EXISTS idx_orders_printed_at
  ON public.orders (printed_at DESC)
  WHERE printed_at IS NOT NULL;