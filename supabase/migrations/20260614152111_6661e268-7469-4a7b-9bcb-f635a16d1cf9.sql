
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS reorder_point integer;

CREATE INDEX IF NOT EXISTS products_sku_idx ON public.products (sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_barcode_idx ON public.products (barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_brand_sku_uniq ON public.products (brand_id, sku) WHERE sku IS NOT NULL;

-- RPC: set absolute stock count (opening stock). Computes delta and logs as a stock_movement.
CREATE OR REPLACE FUNCTION public.set_product_stock(_product_id uuid, _new_qty integer, _reason text DEFAULT 'opening_stock', _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _before integer;
  _brand uuid;
  _delta integer;
BEGIN
  IF NOT (public.has_role(_user, 'admin'::public.app_role) OR public.has_role(_user, 'operations'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized to set stock';
  END IF;
  IF _new_qty < 0 THEN
    RAISE EXCEPTION 'Quantity cannot be negative';
  END IF;

  SELECT stock, brand_id INTO _before, _brand
  FROM public.products WHERE id = _product_id FOR UPDATE;
  IF _before IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;

  _delta := _new_qty - _before;
  IF _delta = 0 THEN
    RETURN jsonb_build_object('product_id', _product_id, 'stock_before', _before, 'stock_after', _new_qty, 'delta', 0, 'skipped', true);
  END IF;

  UPDATE public.products SET stock = _new_qty, updated_at = now() WHERE id = _product_id;

  INSERT INTO public.stock_movements
    (product_id, user_id, delta, stock_before, stock_after, reason, note, brand_id)
  VALUES
    (_product_id, _user, _delta, _before, _new_qty, _reason, _note, _brand);

  RETURN jsonb_build_object('product_id', _product_id, 'stock_before', _before, 'stock_after', _new_qty, 'delta', _delta);
END;
$$;

-- Inline editable threshold helper
CREATE OR REPLACE FUNCTION public.update_product_inventory_fields(
  _product_id uuid,
  _low_stock_threshold integer DEFAULT NULL,
  _reorder_point integer DEFAULT NULL,
  _cost_price numeric DEFAULT NULL,
  _sku text DEFAULT NULL,
  _barcode text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operations'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.products
  SET low_stock_threshold = COALESCE(_low_stock_threshold, low_stock_threshold),
      reorder_point = COALESCE(_reorder_point, reorder_point),
      cost_price = COALESCE(_cost_price, cost_price),
      sku = COALESCE(NULLIF(_sku, ''), sku),
      barcode = COALESCE(NULLIF(_barcode, ''), barcode),
      updated_at = now()
  WHERE id = _product_id;
END;
$$;
