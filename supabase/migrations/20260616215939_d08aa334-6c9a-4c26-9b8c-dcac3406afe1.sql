
-- 1) Allow PO creation without supplier; persist product_id (already supported)
CREATE OR REPLACE FUNCTION public.imp_create_po(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_brand uuid := (_payload->>'brand_id')::uuid;
  v_agent uuid := NULLIF(_payload->>'cargo_agent_id','')::uuid;
  v_order_date date := COALESCE((_payload->>'order_date')::date, CURRENT_DATE);
  v_currency text := COALESCE(_payload->>'currency', 'CNY');
  v_fx numeric := COALESCE((_payload->>'fx_rate')::numeric, 0);
  v_notes text := _payload->>'notes';
  v_idem text := _payload->>'idempotency_key';
  v_supplier_payload jsonb := _payload->'supplier';
  v_items jsonb := _payload->'items';
  v_cartons jsonb := _payload->'cartons';
  v_init jsonb := _payload->'initial_payment';
  v_supplier_id uuid;
  v_existing_po uuid;
  v_po_id uuid; v_po_number text;
  v_item jsonb; v_carton jsonb; v_alloc jsonb;
  v_item_ids uuid[] := ARRAY[]::uuid[];
  v_item_qty int[] := ARRAY[]::int[];
  v_carton_id uuid; v_idx int;
  v_total_items int := 0; v_total_cartons int := 0;
  v_item_qty_total int; v_carton_qty_total int;
  v_payment_id uuid;
  v_dr uuid; v_cr uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','operations','accountant') THEN
    RAISE EXCEPTION 'not authorized to create import PO';
  END IF;
  IF v_brand IS NULL THEN RAISE EXCEPTION 'brand_id required'; END IF;
  IF v_idem IS NULL OR length(v_idem) < 8 THEN RAISE EXCEPTION 'idempotency_key required'; END IF;
  IF v_fx <= 0 THEN RAISE EXCEPTION 'fx_rate must be positive'; END IF;
  IF v_agent IS NULL THEN RAISE EXCEPTION 'cargo_agent_id required'; END IF;
  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN RAISE EXCEPTION 'items required'; END IF;
  IF v_cartons IS NULL OR jsonb_array_length(v_cartons) = 0 THEN RAISE EXCEPTION 'cartons required'; END IF;

  -- idempotency
  SELECT id INTO v_existing_po FROM imp_purchase_orders
    WHERE brand_id = v_brand AND notes LIKE '%[idem:' || v_idem || ']%' LIMIT 1;
  IF v_existing_po IS NOT NULL THEN
    RETURN jsonb_build_object('po_id', v_existing_po, 'po_number',
           (SELECT po_number FROM imp_purchase_orders WHERE id = v_existing_po),
           'idempotent_replay', true);
  END IF;

  -- supplier (fully optional)
  IF v_supplier_payload IS NOT NULL AND v_supplier_payload ? 'id' AND NULLIF(v_supplier_payload->>'id','') IS NOT NULL THEN
    v_supplier_id := (v_supplier_payload->>'id')::uuid;
    PERFORM 1 FROM erp_suppliers WHERE id = v_supplier_id AND brand_id = v_brand AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'supplier not found or inactive'; END IF;
  ELSIF v_supplier_payload IS NOT NULL AND NULLIF(v_supplier_payload->>'name','') IS NOT NULL THEN
    INSERT INTO erp_suppliers (brand_id, name, phone, address, notes, source_link, country, currency, payment_terms_days, credit_limit_bdt, supplier_type)
    VALUES (
      v_brand,
      v_supplier_payload->>'name',
      v_supplier_payload->>'phone',
      v_supplier_payload->>'address',
      v_supplier_payload->>'notes',
      v_supplier_payload->>'source_link',
      COALESCE(v_supplier_payload->>'country','CN'),
      COALESCE(v_supplier_payload->>'currency', v_currency),
      COALESCE((v_supplier_payload->>'payment_terms_days')::int, 0),
      COALESCE((v_supplier_payload->>'credit_limit_bdt')::numeric, 0),
      COALESCE(v_supplier_payload->>'supplier_type','import')
    ) RETURNING id INTO v_supplier_id;
  ELSE
    v_supplier_id := NULL;
  END IF;

  PERFORM 1 FROM imp_cargo_agents WHERE id = v_agent AND brand_id = v_brand AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'cargo agent not found or inactive'; END IF;

  v_po_number := public.imp_next_po_number(v_brand);

  INSERT INTO imp_purchase_orders (po_number, brand_id, cargo_agent_id, supplier_id, order_date, currency, fx_rate, status, notes, created_by)
  VALUES (v_po_number, v_brand, v_agent, v_supplier_id, v_order_date, v_currency, v_fx, 'ordered',
          COALESCE(v_notes,'') || ' [idem:' || v_idem || ']', v_user)
  RETURNING id INTO v_po_id;

  v_idx := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    DECLARE
      v_item_id uuid;
      v_qty int := (v_item->>'quantity')::int;
      v_unit_f numeric := (v_item->>'unit_cost_foreign')::numeric;
      v_unit_b numeric := round(v_unit_f * v_fx, 4);
      v_sub numeric := round(v_qty * v_unit_b, 4);
    BEGIN
      IF v_qty <= 0 THEN RAISE EXCEPTION 'item quantity must be positive'; END IF;
      INSERT INTO imp_po_items (po_id, product_id, variant_id, sku_snapshot, name_snapshot, image_snapshot,
                                quantity, unit_cost_foreign, unit_cost_bdt, subtotal_bdt)
      VALUES (v_po_id,
              NULLIF(v_item->>'product_id','')::uuid,
              NULLIF(v_item->>'variant_id','')::uuid,
              v_item->>'sku_snapshot',
              COALESCE(v_item->>'name_snapshot','Item'),
              v_item->>'image_snapshot',
              v_qty, v_unit_f, v_unit_b, v_sub)
      RETURNING id INTO v_item_id;
      v_item_ids := array_append(v_item_ids, v_item_id);
      v_item_qty := array_append(v_item_qty, v_qty);
      v_total_items := v_total_items + v_qty;
    END;
    v_idx := v_idx + 1;
  END LOOP;

  DECLARE
    v_carton_alloc_totals int[] := array_fill(0, ARRAY[array_length(v_item_ids,1)]);
    v_cnum int := 0;
  BEGIN
    FOR v_carton IN SELECT * FROM jsonb_array_elements(v_cartons) LOOP
      v_cnum := COALESCE((v_carton->>'carton_number')::int, v_cnum + 1);
      v_carton_qty_total := 0;

      INSERT INTO imp_cartons (po_id, carton_number, barcode, weight_kg, status, expected_quantity)
      VALUES (v_po_id, v_cnum, v_po_number || '-C' || v_cnum,
              NULLIF(v_carton->>'weight_kg','')::numeric, 'ordered', 0)
      RETURNING id INTO v_carton_id;

      FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_carton->'allocations') LOOP
        DECLARE
          v_ii int := (v_alloc->>'item_index')::int;
          v_aq int := (v_alloc->>'quantity')::int;
          v_item_id uuid;
        BEGIN
          IF v_aq < 0 THEN RAISE EXCEPTION 'carton allocation quantity negative'; END IF;
          IF v_aq = 0 THEN CONTINUE; END IF;
          IF v_ii < 0 OR v_ii >= array_length(v_item_ids,1) THEN
            RAISE EXCEPTION 'invalid item_index %', v_ii;
          END IF;
          v_item_id := v_item_ids[v_ii + 1];
          v_carton_alloc_totals[v_ii + 1] := v_carton_alloc_totals[v_ii + 1] + v_aq;
          v_carton_qty_total := v_carton_qty_total + v_aq;

          INSERT INTO imp_carton_items (carton_id, po_item_id, product_id, variant_id, sku_snapshot, quantity_expected)
          SELECT v_carton_id, v_item_id, product_id, variant_id, sku_snapshot, v_aq
          FROM imp_po_items WHERE id = v_item_id;
        END;
      END LOOP;

      UPDATE imp_cartons SET expected_quantity = v_carton_qty_total WHERE id = v_carton_id;
      v_total_cartons := v_total_cartons + v_carton_qty_total;
    END LOOP;

    FOR v_idx IN 1 .. array_length(v_item_ids,1) LOOP
      IF v_carton_alloc_totals[v_idx] <> v_item_qty[v_idx] THEN
        RAISE EXCEPTION 'carton totals (%) do not match item quantity (%) at index %',
          v_carton_alloc_totals[v_idx], v_item_qty[v_idx], v_idx - 1;
      END IF;
    END LOOP;
  END;

  IF v_total_cartons <> v_total_items THEN
    RAISE EXCEPTION 'carton grand total (%) != item grand total (%)', v_total_cartons, v_total_items;
  END IF;

  UPDATE imp_cartons c SET supplier_cost_bdt = round(coalesce(s.cost,0), 4)
  FROM (
    SELECT ci.carton_id AS cid, SUM(ci.quantity_expected * pi.unit_cost_bdt) AS cost
    FROM imp_carton_items ci JOIN imp_po_items pi ON pi.id = ci.po_item_id
    GROUP BY ci.carton_id
  ) s WHERE s.cid = c.id AND c.po_id = v_po_id;

  UPDATE imp_cartons SET total_landed_bdt = supplier_cost_bdt + shipping_charge_bdt + local_courier_bdt
   WHERE po_id = v_po_id;

  -- initial payment goes to cargo-agent advance (since supplier is optional now)
  IF v_init IS NOT NULL AND (v_init ? 'amount_bdt') THEN
    v_dr := public.imp_get_or_create_account(v_brand, '1320-SUP-ADV', 'Supplier Advance', 'asset', 'debit');
    v_payment_id := public._imp_record_payment(
      v_brand, v_po_id, NULL,
      COALESCE((v_init->>'payment_type')::public.imp_payment_type, 'supplier_advance'),
      (v_init->>'amount_bdt')::numeric,
      (v_init->>'wallet_id')::uuid,
      COALESCE((v_init->>'payment_date')::date, v_order_date),
      v_init->>'reference', v_init->>'notes',
      v_init->>'idempotency_key',
      v_user, v_dr,
      COALESCE(
        (SELECT id FROM erp_chart_accounts WHERE brand_id = v_brand AND code = (SELECT account_number FROM erp_accounts WHERE id = (v_init->>'wallet_id')::uuid) LIMIT 1),
        public.imp_get_or_create_account(v_brand, '1100-WALLET', 'Wallet/Bank', 'asset', 'debit')
      )
    );
  END IF;

  PERFORM public._imp_refresh_po_totals(v_po_id);
  PERFORM public._imp_log(v_brand, 'po', v_po_id, NULL, 'ordered', 'created', NULL, v_user, NULL,
    jsonb_build_object('po_number', v_po_number, 'items', array_length(v_item_ids,1), 'cartons', jsonb_array_length(v_cartons)));

  RETURN jsonb_build_object('po_id', v_po_id, 'po_number', v_po_number, 'payment_id', v_payment_id);
END $function$;

-- 2) Quick product create (used inline from New PO page)
CREATE OR REPLACE FUNCTION public.imp_quick_create_product(_brand uuid, _title text, _sku text DEFAULT NULL, _image text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_slug text;
  v_base text;
  v_suffix int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','operations','accountant') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _brand IS NULL THEN RAISE EXCEPTION 'brand required'; END IF;
  IF _title IS NULL OR length(trim(_title)) = 0 THEN RAISE EXCEPTION 'title required'; END IF;

  v_base := lower(regexp_replace(trim(_title), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  IF v_base = '' THEN v_base := 'product'; END IF;
  v_slug := v_base;
  WHILE EXISTS(SELECT 1 FROM products WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base || '-' || v_suffix;
  END LOOP;

  INSERT INTO products (brand_id, title, slug, description, image, gallery, benefits, specs, price, stock, cost_price, sku, is_active, is_featured, is_new_arrival, rating, reviews, display_order, low_stock_threshold)
  VALUES (_brand, trim(_title), v_slug, '', COALESCE(_image,'/placeholder.svg'), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 0, 0, 0, NULLIF(_sku,''), true, false, true, 0, 0, 0, 5)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'title', _title, 'slug', v_slug);
END $function$;

REVOKE EXECUTE ON FUNCTION public.imp_quick_create_product(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.imp_quick_create_product(uuid, text, text, text) TO authenticated;

-- 3) Incoming-stock view (units expected from pending POs minus already posted OK qty)
CREATE OR REPLACE VIEW public.v_product_incoming AS
WITH expected AS (
  SELECT pi.product_id, p.brand_id, SUM(pi.quantity)::int AS qty
  FROM imp_po_items pi
  JOIN imp_purchase_orders p ON p.id = pi.po_id
  WHERE pi.product_id IS NOT NULL
    AND p.status NOT IN ('completed','cancelled')
  GROUP BY pi.product_id, p.brand_id
),
received AS (
  SELECT ci.product_id, p.brand_id, SUM(ci.quantity_ok)::int AS qty
  FROM imp_carton_items ci
  JOIN imp_cartons c ON c.id = ci.carton_id
  JOIN imp_purchase_orders p ON p.id = c.po_id
  WHERE ci.product_id IS NOT NULL
    AND c.status = 'in_stock'
    AND p.status NOT IN ('completed','cancelled')
  GROUP BY ci.product_id, p.brand_id
)
SELECT
  e.product_id,
  e.brand_id,
  GREATEST(e.qty - COALESCE(r.qty, 0), 0)::int AS incoming
FROM expected e
LEFT JOIN received r ON r.product_id = e.product_id AND r.brand_id = e.brand_id
WHERE GREATEST(e.qty - COALESCE(r.qty, 0), 0) > 0;

GRANT SELECT ON public.v_product_incoming TO authenticated;
