
-- Pre-order support
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_preorder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preorder_expected_date date,
  ADD COLUMN IF NOT EXISTS preorder_note text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS preorder_expected_date date,
  ADD COLUMN IF NOT EXISTS preorder_converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS preorder_ready_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_is_preorder ON public.orders(is_preorder) WHERE is_preorder = true;
CREATE INDEX IF NOT EXISTS idx_products_is_preorder ON public.products(is_preorder) WHERE is_preorder = true;

-- Auto-flag orders as pre-order when (a) any line item product is_preorder, or
-- (b) requested quantity exceeds available stock at the time of order creation.
CREATE OR REPLACE FUNCTION public.auto_flag_preorder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag boolean := false;
  v_expected date;
BEGIN
  -- Product-level flag wins, and we copy expected_date for ETA visibility.
  SELECT bool_or(p.is_preorder) OR bool_or(coalesce(p.stock, 0) < oi.quantity),
         max(p.preorder_expected_date)
    INTO v_flag, v_expected
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
   WHERE oi.order_id = NEW.order_id;

  IF v_flag IS TRUE THEN
    UPDATE public.orders
       SET is_preorder = true,
           preorder_expected_date = coalesce(preorder_expected_date, v_expected)
     WHERE id = NEW.order_id
       AND coalesce(preorder_converted_at, null) IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_flag_preorder ON public.order_items;
CREATE TRIGGER trg_auto_flag_preorder
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.auto_flag_preorder();
