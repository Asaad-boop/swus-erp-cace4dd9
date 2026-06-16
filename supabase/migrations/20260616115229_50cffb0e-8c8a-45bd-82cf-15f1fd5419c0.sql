
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot        numeric,
  ADD COLUMN IF NOT EXISTS line_discount_allocated   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_charge_allocated numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS courier_cost_allocated    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_cost_allocated  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_amount_allocated   numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_type               text,
  ADD COLUMN IF NOT EXISTS status_snapshot           text;

CREATE INDEX IF NOT EXISTS idx_order_items_product_status ON public.order_items(product_id, status_snapshot);
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON public.order_items(variant_id);

CREATE OR REPLACE FUNCTION public.snapshot_order_item_profit_fields(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
    unit_cost_snapshot = COALESCE(oi.unit_cost_snapshot,
      (SELECT cost_price FROM public.products WHERE id = oi.product_id)),
    line_discount_allocated   = COALESCE(ROUND(COALESCE(_ord.discount_amount,0) * (COALESCE(oi.line_total,0) / _items_subtotal), 2), 0),
    delivery_charge_allocated = COALESCE(ROUND(COALESCE(_ord.shipping_fee,0)   * (COALESCE(oi.line_total,0) / _items_subtotal), 2), 0),
    source_type     = COALESCE(oi.source_type, _src),
    status_snapshot = _ord.status::text
  WHERE oi.order_id = _order_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_snapshot_profit_on_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF (TG_OP = 'UPDATE'
      AND OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('confirmed'::public.order_status,'delivered'::public.order_status,
                         'partial_delivered'::public.order_status,'paid'::public.order_status,
                         'shipped'::public.order_status)) THEN
    PERFORM public.snapshot_order_item_profit_fields(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_order_profit_snapshot ON public.orders;
CREATE TRIGGER trg_order_profit_snapshot
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_snapshot_profit_on_status_change();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.orders WHERE status <> 'new'::public.order_status LOOP
    PERFORM public.snapshot_order_item_profit_fields(r.id);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.erp_return_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  sku text,
  return_type text NOT NULL CHECK (return_type IN ('normal_return','paid_return','damage_return','refund')),
  item_condition text NOT NULL CHECK (item_condition IN ('sellable','damaged','missing','disposed')),
  qty numeric NOT NULL DEFAULT 1,
  refund_amount numeric NOT NULL DEFAULT 0,
  customer_paid_delivery numeric NOT NULL DEFAULT 0,
  outbound_delivery_cost numeric NOT NULL DEFAULT 0,
  return_delivery_cost numeric NOT NULL DEFAULT 0,
  product_cost_loss numeric NOT NULL DEFAULT 0,
  packaging_loss numeric NOT NULL DEFAULT 0,
  note text,
  status text NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_return_cases TO authenticated;
GRANT ALL ON public.erp_return_cases TO service_role;
ALTER TABLE public.erp_return_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "return_cases_staff_all" ON public.erp_return_cases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE INDEX IF NOT EXISTS idx_return_cases_brand_product ON public.erp_return_cases(brand_id, product_id);
CREATE INDEX IF NOT EXISTS idx_return_cases_order ON public.erp_return_cases(order_id);
CREATE TRIGGER erp_return_cases_updated_at BEFORE UPDATE ON public.erp_return_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.erp_exchange_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  original_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  original_order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  original_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  original_variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  original_sku text,
  exchange_type text NOT NULL CHECK (exchange_type IN ('normal','damage','different_product','refund_only')),
  old_item_condition text NOT NULL CHECK (old_item_condition IN ('sellable','damaged','missing','disposed')),
  replacement_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  replacement_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  replacement_variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  replacement_sku text,
  replacement_qty numeric NOT NULL DEFAULT 1,
  exchange_charge_collected numeric NOT NULL DEFAULT 0,
  replacement_delivery_cost numeric NOT NULL DEFAULT 0,
  return_delivery_cost numeric NOT NULL DEFAULT 0,
  product_cost_loss numeric NOT NULL DEFAULT 0,
  refund_amount numeric NOT NULL DEFAULT 0,
  note text,
  status text NOT NULL DEFAULT 'open',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_exchange_cases TO authenticated;
GRANT ALL ON public.erp_exchange_cases TO service_role;
ALTER TABLE public.erp_exchange_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exchange_cases_staff_all" ON public.erp_exchange_cases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE INDEX IF NOT EXISTS idx_exchange_cases_brand_product ON public.erp_exchange_cases(brand_id, original_product_id);
CREATE INDEX IF NOT EXISTS idx_exchange_cases_order ON public.erp_exchange_cases(original_order_id);
CREATE TRIGGER erp_exchange_cases_updated_at BEFORE UPDATE ON public.erp_exchange_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.erp_product_expense_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  sku text,
  expense_transaction_id uuid REFERENCES public.erp_transactions(id) ON DELETE CASCADE,
  journal_entry_id uuid REFERENCES public.erp_journal_entries(id) ON DELETE SET NULL,
  expense_type text NOT NULL CHECK (expense_type IN ('video_production','photography','influencer','model','content_creator','studio','meta_ads_manual','other_marketing','packaging','other')),
  amount numeric NOT NULL DEFAULT 0,
  allocation_method text NOT NULL DEFAULT 'direct' CHECK (allocation_method IN ('direct','percent','equal_split')),
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_product_expense_allocations TO authenticated;
GRANT ALL ON public.erp_product_expense_allocations TO service_role;
ALTER TABLE public.erp_product_expense_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_expense_alloc_staff_all" ON public.erp_product_expense_allocations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));
CREATE INDEX IF NOT EXISTS idx_prod_expense_alloc_product ON public.erp_product_expense_allocations(brand_id, product_id);
CREATE INDEX IF NOT EXISTS idx_prod_expense_alloc_txn ON public.erp_product_expense_allocations(expense_transaction_id);

CREATE TABLE IF NOT EXISTS public.erp_ad_product_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'meta',
  campaign_id uuid,
  adset_id uuid,
  ad_id uuid,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  sku text,
  allocation_percent numeric NOT NULL DEFAULT 100 CHECK (allocation_percent >= 0 AND allocation_percent <= 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_ad_product_links TO authenticated;
GRANT ALL ON public.erp_ad_product_links TO service_role;
ALTER TABLE public.erp_ad_product_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_product_links_staff_all" ON public.erp_ad_product_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role) OR public.has_role(auth.uid(),'marketing_manager'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role) OR public.has_role(auth.uid(),'marketing_manager'::public.app_role));
CREATE INDEX IF NOT EXISTS idx_ad_product_links_product ON public.erp_ad_product_links(brand_id, product_id);
CREATE INDEX IF NOT EXISTS idx_ad_product_links_campaign ON public.erp_ad_product_links(campaign_id);

CREATE OR REPLACE FUNCTION public.get_order_courier_cost(_order_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(delivery_fee),0)::numeric FROM public.courier_shipments WHERE order_id = _order_id;
$$;

CREATE OR REPLACE FUNCTION public.get_product_profitability_report(
  p_brand_id uuid,
  p_product_id uuid,
  p_variant_id uuid DEFAULT NULL,
  p_date_from date  DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_date_to   date  DEFAULT CURRENT_DATE,
  p_date_basis text DEFAULT 'delivered',
  p_sources   text[] DEFAULT NULL,
  p_couriers  text[] DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _user uuid := auth.uid();
  _product jsonb; _stock jsonb; _qty jsonb; _sources jsonb;
  _revenue jsonb; _cost jsonb; _profit jsonb;
  _items jsonb; _returns jsonb; _exchanges jsonb; _marketing jsonb;
  _warnings text[] := ARRAY[]::text[];
  v_current_stock int;
  v_gross numeric := 0; v_delivery_collected numeric := 0; v_discount numeric := 0;
  v_net_payable numeric := 0; v_cogs numeric := 0; v_courier_out numeric := 0;
  v_courier_return numeric := 0; v_packaging numeric := 0;
  v_return_loss numeric := 0; v_exchange_loss numeric := 0;
  v_damage_loss numeric := 0; v_refund_loss numeric := 0;
  v_marketing_total numeric := 0; v_meta_ads numeric := 0;
  v_q_website int := 0; v_q_manual int := 0; v_q_confirmed int := 0;
  v_q_delivered int := 0; v_q_shipped int := 0; v_q_cancelled int := 0;
  v_q_returned int := 0; v_q_exchanged int := 0; v_q_damaged int := 0;
  v_missing_cost_items int := 0; v_missing_source_items int := 0;
BEGIN
  IF NOT (public.has_role(_user,'admin'::public.app_role)
       OR public.has_role(_user,'operations'::public.app_role)
       OR public.has_role(_user,'accountant'::public.app_role)
       OR public.has_role(_user,'customer_service'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object('id', p.id,'name', p.name,'sku', p.sku,'image', p.image_url,'brand_id', p.brand_id,'cost_price', p.cost_price,'stock', p.stock)
  INTO _product FROM public.products p WHERE p.id = p_product_id;
  IF _product IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  SELECT stock INTO v_current_stock FROM public.products WHERE id = p_product_id;

  WITH base AS (
    SELECT oi.*, o.status::text AS o_status, o.source::text AS o_source,
           o.discount_amount AS o_discount, o.shipping_fee AS o_shipping,
           o.subtotal AS o_subtotal, o.total AS o_total,
           o.created_at AS o_created, o.confirmed_at AS o_confirmed,
           o.delivered_at AS o_delivered, o.brand_id AS o_brand,
           public.get_order_courier_cost(o.id) AS o_courier_cost
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = p_product_id
      AND (p_variant_id IS NULL OR oi.variant_id = p_variant_id)
      AND (p_brand_id IS NULL OR o.brand_id = p_brand_id)
      AND (
        (p_date_basis='created'   AND o.created_at::date BETWEEN p_date_from AND p_date_to) OR
        (p_date_basis='confirmed' AND o.confirmed_at::date BETWEEN p_date_from AND p_date_to) OR
        (p_date_basis='delivered' AND COALESCE(o.delivered_at, o.created_at)::date BETWEEN p_date_from AND p_date_to)
      )
      AND (p_sources  IS NULL OR COALESCE(o.source::text,'unknown') = ANY (p_sources))
      AND (p_couriers IS NULL OR EXISTS (SELECT 1 FROM public.courier_shipments cs WHERE cs.order_id = o.id AND cs.provider = ANY (p_couriers)))
  )
  SELECT
    COALESCE(SUM(CASE WHEN COALESCE(o_source,'website') IN ('website','web','online') THEN quantity ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN COALESCE(o_source,'website') NOT IN ('website','web','online') THEN quantity ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN o_status IN ('confirmed','packaging','packed','ready_to_ship','ready_to_pack','shipped','in_transit','delivered','partial_delivered','paid') THEN quantity ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN o_status IN ('delivered','partial_delivered','paid') THEN quantity ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN o_status IN ('shipped','in_transit') THEN quantity ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN o_status IN ('cancelled','fake') THEN quantity ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN o_status IN ('returned','paid_return','unpaid_return','partial_return','pending_return') THEN quantity ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN o_status IN ('exchanged','exchange') THEN quantity ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN o_status IN ('damaged') THEN quantity ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN o_status IN ('delivered','partial_delivered','paid') THEN COALESCE(line_total,0) ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN o_status IN ('delivered','partial_delivered','paid') THEN delivery_charge_allocated ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN o_status IN ('delivered','partial_delivered','paid') THEN line_discount_allocated ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN o_status IN ('delivered','partial_delivered','paid')
                      THEN COALESCE(unit_cost_snapshot,(SELECT cost_price FROM public.products WHERE id = p_product_id),0) * quantity
                      ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN o_status IN ('delivered','partial_delivered','paid','shipped','in_transit') AND o_subtotal > 0
                      THEN o_courier_cost * (COALESCE(line_total,0) / o_subtotal) ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN unit_cost_snapshot IS NULL THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN source_type IS NULL OR source_type = '' THEN 1 ELSE 0 END),0)
  INTO
    v_q_website, v_q_manual, v_q_confirmed, v_q_delivered, v_q_shipped,
    v_q_cancelled, v_q_returned, v_q_exchanged, v_q_damaged,
    v_gross, v_delivery_collected, v_discount, v_cogs, v_courier_out,
    v_missing_cost_items, v_missing_source_items
  FROM base;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('source',src,'created',created_qty,'confirmed',confirmed_qty,'shipped',shipped_qty,'delivered',delivered_qty,'returned',returned_qty,'revenue',revenue,'delivery_collected',delivery_collected,'net_payable',revenue+delivery_collected-discount,'delivery_rate',CASE WHEN confirmed_qty>0 THEN ROUND(delivered_qty::numeric*100/confirmed_qty,1) ELSE 0 END) ORDER BY revenue DESC NULLS LAST),'[]'::jsonb) INTO _sources
  FROM (
    SELECT COALESCE(NULLIF(oi.source_type,''), COALESCE(o.source::text,'unknown')) AS src,
      SUM(oi.quantity)::int AS created_qty,
      SUM(CASE WHEN o.status::text IN ('confirmed','packaging','packed','ready_to_ship','ready_to_pack','shipped','in_transit','delivered','partial_delivered','paid') THEN oi.quantity ELSE 0 END)::int AS confirmed_qty,
      SUM(CASE WHEN o.status::text IN ('shipped','in_transit') THEN oi.quantity ELSE 0 END)::int AS shipped_qty,
      SUM(CASE WHEN o.status::text IN ('delivered','partial_delivered','paid') THEN oi.quantity ELSE 0 END)::int AS delivered_qty,
      SUM(CASE WHEN o.status::text IN ('returned','paid_return','unpaid_return','partial_return','pending_return') THEN oi.quantity ELSE 0 END)::int AS returned_qty,
      SUM(CASE WHEN o.status::text IN ('delivered','partial_delivered','paid') THEN COALESCE(oi.line_total,0) ELSE 0 END) AS revenue,
      SUM(CASE WHEN o.status::text IN ('delivered','partial_delivered','paid') THEN oi.delivery_charge_allocated ELSE 0 END) AS delivery_collected,
      SUM(CASE WHEN o.status::text IN ('delivered','partial_delivered','paid') THEN oi.line_discount_allocated ELSE 0 END) AS discount
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = p_product_id
      AND (p_variant_id IS NULL OR oi.variant_id = p_variant_id)
      AND (p_brand_id IS NULL OR o.brand_id = p_brand_id)
      AND (
        (p_date_basis='created'   AND o.created_at::date BETWEEN p_date_from AND p_date_to) OR
        (p_date_basis='confirmed' AND o.confirmed_at::date BETWEEN p_date_from AND p_date_to) OR
        (p_date_basis='delivered' AND COALESCE(o.delivered_at,o.created_at)::date BETWEEN p_date_from AND p_date_to)
      )
    GROUP BY src
  ) s;

  SELECT
    COALESCE(SUM(refund_amount + return_delivery_cost + outbound_delivery_cost + product_cost_loss + packaging_loss - customer_paid_delivery),0),
    COALESCE(SUM(CASE WHEN item_condition IN ('damaged','disposed','missing') THEN product_cost_loss ELSE 0 END),0),
    COALESCE(SUM(refund_amount),0),
    COALESCE(SUM(return_delivery_cost),0),
    COALESCE(SUM(packaging_loss),0),
    COALESCE(jsonb_agg(jsonb_build_object('id',id,'order_id',order_id,'return_type',return_type,'condition',item_condition,'qty',qty,'refund',refund_amount,'cost_loss',product_cost_loss,'status',status,'created_at',created_at) ORDER BY created_at DESC),'[]'::jsonb)
  INTO v_return_loss, v_damage_loss, v_refund_loss, v_courier_return, v_packaging, _returns
  FROM public.erp_return_cases
  WHERE product_id = p_product_id
    AND (p_brand_id IS NULL OR brand_id = p_brand_id)
    AND created_at::date BETWEEN p_date_from AND p_date_to;

  SELECT
    COALESCE(SUM(replacement_delivery_cost + return_delivery_cost + product_cost_loss + refund_amount - exchange_charge_collected),0),
    COALESCE(jsonb_agg(jsonb_build_object('id',id,'original_order_id',original_order_id,'exchange_type',exchange_type,'old_condition',old_item_condition,'replacement_product_id',replacement_product_id,'qty',replacement_qty,'loss',(replacement_delivery_cost+return_delivery_cost+product_cost_loss+refund_amount-exchange_charge_collected),'status',status,'created_at',created_at) ORDER BY created_at DESC),'[]'::jsonb)
  INTO v_exchange_loss, _exchanges
  FROM public.erp_exchange_cases
  WHERE original_product_id = p_product_id
    AND (p_brand_id IS NULL OR brand_id = p_brand_id)
    AND created_at::date BETWEEN p_date_from AND p_date_to;

  SELECT
    COALESCE(SUM(amount),0),
    COALESCE(SUM(CASE WHEN expense_type='meta_ads_manual' THEN amount ELSE 0 END),0),
    COALESCE(jsonb_agg(jsonb_build_object('expense_type',expense_type,'amount',amount,'note',note,'created_at',created_at) ORDER BY created_at DESC),'[]'::jsonb)
  INTO v_marketing_total, v_meta_ads, _marketing
  FROM public.erp_product_expense_allocations
  WHERE product_id = p_product_id
    AND (p_brand_id IS NULL OR brand_id = p_brand_id)
    AND created_at::date BETWEEN p_date_from AND p_date_to;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id',oi.order_id,'item_id',oi.id,'date',o.created_at::date,'status',o.status::text,'source',COALESCE(oi.source_type,o.source::text,'unknown'),'qty',oi.quantity,'unit_price',oi.unit_price,'line_total',oi.line_total,'unit_cost',oi.unit_cost_snapshot,'discount_alloc',oi.line_discount_allocated,'delivery_alloc',oi.delivery_charge_allocated,'courier_cost',CASE WHEN o.subtotal>0 THEN ROUND(public.get_order_courier_cost(o.id)*(COALESCE(oi.line_total,0)/o.subtotal),2) ELSE 0 END) ORDER BY o.created_at DESC),'[]'::jsonb) INTO _items
  FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id
    AND (p_variant_id IS NULL OR oi.variant_id = p_variant_id)
    AND (p_brand_id IS NULL OR o.brand_id = p_brand_id)
    AND (
      (p_date_basis='created'   AND o.created_at::date BETWEEN p_date_from AND p_date_to) OR
      (p_date_basis='confirmed' AND o.confirmed_at::date BETWEEN p_date_from AND p_date_to) OR
      (p_date_basis='delivered' AND COALESCE(o.delivered_at,o.created_at)::date BETWEEN p_date_from AND p_date_to)
    );

  v_net_payable := v_gross + v_delivery_collected - v_discount - v_refund_loss;

  IF v_missing_cost_items > 0 THEN _warnings := array_append(_warnings, format('missing_cost:%s items lack unit_cost_snapshot', v_missing_cost_items)); END IF;
  IF v_missing_source_items > 0 THEN _warnings := array_append(_warnings, format('missing_source:%s items lack source_type', v_missing_source_items)); END IF;
  IF v_courier_out = 0 AND v_q_delivered > 0 THEN _warnings := array_append(_warnings, 'missing_courier_cost:no courier_shipments for delivered orders'); END IF;
  IF v_marketing_total = 0 THEN _warnings := array_append(_warnings, 'no_marketing_attribution:link expenses to this product to see net profit'); END IF;

  _stock := jsonb_build_object('current',v_current_stock,'delivered_in_range',v_q_delivered,'returned_in_range',v_q_returned);
  _qty := jsonb_build_object('website_orders',v_q_website,'manual_orders',v_q_manual,'confirmed',v_q_confirmed,'delivered',v_q_delivered,'shipped',v_q_shipped,'cancelled',v_q_cancelled,'returned',v_q_returned,'exchanged',v_q_exchanged,'damaged',v_q_damaged);
  _revenue := jsonb_build_object('gross',v_gross,'delivery_collected',v_delivery_collected,'discount',v_discount,'refund',v_refund_loss,'net_payable',v_net_payable);
  _cost := jsonb_build_object('cogs',v_cogs,'courier_out',v_courier_out,'courier_return',v_courier_return,'packaging',v_packaging,'return_loss',v_return_loss,'exchange_loss',v_exchange_loss,'damage_loss',v_damage_loss,'refund_loss',v_refund_loss,'meta_ads',v_meta_ads,'marketing_content',GREATEST(v_marketing_total-v_meta_ads,0));
  _profit := jsonb_build_object(
    'gross', v_net_payable - v_cogs,
    'contribution', v_net_payable - v_cogs - v_courier_out - v_packaging - v_return_loss - v_exchange_loss - v_damage_loss - v_meta_ads,
    'net', v_net_payable - v_cogs - v_courier_out - v_packaging - v_return_loss - v_exchange_loss - v_damage_loss - v_meta_ads - GREATEST(v_marketing_total - v_meta_ads, 0),
    'per_delivered_unit', CASE WHEN v_q_delivered>0 THEN ROUND((v_net_payable-v_cogs-v_courier_out)/v_q_delivered,2) ELSE 0 END,
    'per_confirmed_unit', CASE WHEN v_q_confirmed>0 THEN ROUND((v_net_payable-v_cogs-v_courier_out)/v_q_confirmed,2) ELSE 0 END,
    'return_rate', CASE WHEN v_q_confirmed>0 THEN ROUND(v_q_returned::numeric*100/v_q_confirmed,1) ELSE 0 END,
    'exchange_rate', CASE WHEN v_q_confirmed>0 THEN ROUND(v_q_exchanged::numeric*100/v_q_confirmed,1) ELSE 0 END,
    'damage_rate', CASE WHEN v_q_confirmed>0 THEN ROUND(v_q_damaged::numeric*100/v_q_confirmed,1) ELSE 0 END,
    'delivery_success_rate', CASE WHEN v_q_confirmed>0 THEN ROUND(v_q_delivered::numeric*100/v_q_confirmed,1) ELSE 0 END
  );

  RETURN jsonb_build_object('product',_product,'stock',_stock,'quantities',_qty,'sources',_sources,'revenue',_revenue,'cost',_cost,'profit',_profit,'items',_items,'returns',_returns,'exchanges',_exchanges,'marketing',_marketing,'warnings',to_jsonb(_warnings),'filters',jsonb_build_object('brand_id',p_brand_id,'product_id',p_product_id,'variant_id',p_variant_id,'from',p_date_from,'to',p_date_to,'date_basis',p_date_basis,'sources',p_sources,'couriers',p_couriers));
END $$;

GRANT EXECUTE ON FUNCTION public.get_product_profitability_report(uuid,uuid,uuid,date,date,text,text[],text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_courier_cost(uuid) TO authenticated;
