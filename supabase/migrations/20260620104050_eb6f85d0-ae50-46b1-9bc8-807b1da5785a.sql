GRANT EXECUTE ON FUNCTION public.backfill_order_profit_snapshots(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.snapshot_order_item_profit_fields(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ord public.orders%ROWTYPE;
  _items_subtotal numeric;
  _src text;
BEGIN
  SELECT * INTO _ord FROM public.orders WHERE id = _order_id;
  IF _ord.id IS NULL THEN RETURN; END IF;
  _src := COALESCE(_ord.source::text, 'unknown');

  SELECT COALESCE(SUM(COALESCE(line_total,0)),0) INTO _items_subtotal
  FROM public.order_items WHERE order_id = _order_id;
  IF _items_subtotal <= 0 THEN _items_subtotal := 1; END IF;

  UPDATE public.order_items oi
  SET
    unit_cost_snapshot = COALESCE(
      oi.unit_cost_snapshot,
      (SELECT NULLIF(weighted_avg_cost, 0) FROM public.products WHERE id = oi.product_id),
      (SELECT cost_price FROM public.products WHERE id = oi.product_id)
    ),
    line_discount_allocated   = COALESCE(ROUND(COALESCE(_ord.discount_amount,0) * (COALESCE(oi.line_total,0) / _items_subtotal), 2), 0),
    delivery_charge_allocated = COALESCE(ROUND(COALESCE(_ord.shipping_fee,0)   * (COALESCE(oi.line_total,0) / _items_subtotal), 2), 0),
    source_type     = COALESCE(oi.source_type, _src),
    status_snapshot = _ord.status::text
  WHERE oi.order_id = _order_id;
END $function$;