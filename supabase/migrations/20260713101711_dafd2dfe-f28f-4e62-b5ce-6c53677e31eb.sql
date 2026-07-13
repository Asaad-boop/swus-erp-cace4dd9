CREATE OR REPLACE FUNCTION public.imp_post_to_inventory(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_carton uuid := (_payload->>'carton_id')::uuid;
  v_wh uuid := NULLIF(_payload->>'warehouse_id','')::uuid;
  v_qc jsonb := _payload->'qc';
  v_idem text := _payload->>'idempotency_key';
  v_status public.imp_carton_status; v_po uuid; v_brand uuid;
  v_sup numeric; v_ship numeric; v_loc numeric;
  v_total_ok int := 0; v_total_damaged int := 0; v_total_missing int := 0;
  v_landed numeric; v_unit_landed numeric;
  v_qc_row jsonb; v_existing uuid;
  v_inv_acc uuid; v_clr_acc uuid; v_loss_acc uuid;
  v_loc_pay jsonb := _payload->'local_courier_payment';
  v_due_pay jsonb := _payload->'supplier_due_payment';
  v_loc_payment uuid; v_due_payment uuid;
  v_lines jsonb := '[]'::jsonb;
  v_journal uuid;
  v_carton_loc numeric := 0;
  v_po_extras numeric := 0;
  v_po_total_units int := 0;
  v_carton_units int := 0;
  v_extras_share numeric := 0;
  v_ship_loc_per_unit numeric := 0;
  v_po_extra_per_unit numeric := 0;
  v_pre_ok_cost numeric := 0;
  v_cost_factor numeric := 1;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','operations','warehouse_staff') THEN
    RAISE EXCEPTION 'not authorized to post inventory';
  END IF;
  IF v_idem IS NULL OR length(v_idem) < 8 THEN RAISE EXCEPTION 'idempotency_key required'; END IF;

  SELECT id INTO v_existing
  FROM stock_movements
  WHERE idempotency_key LIKE ('imp_post:' || v_idem || ':%')
  LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('idempotent_replay', true); END IF;

  SELECT c.status, c.po_id, p.brand_id, c.supplier_cost_bdt, c.shipping_charge_bdt, c.local_courier_bdt,
         COALESCE(p.freight_cost_bdt,0) + COALESCE(p.customs_duty_bdt,0) + COALESCE(p.other_charges_bdt,0)
           + COALESCE(p.agent_commission_total_bdt, COALESCE(p.agent_commission_per_unit_bdt,0) * COALESCE(p.total_units,0), 0),
         COALESCE(p.total_units, 0)
    INTO v_status, v_po, v_brand, v_sup, v_ship, v_loc, v_po_extras, v_po_total_units
  FROM imp_cartons c JOIN imp_purchase_orders p ON p.id = c.po_id WHERE c.id = v_carton FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'carton not found'; END IF;
  IF v_status = 'in_stock' THEN RAISE EXCEPTION 'carton already in_stock'; END IF;
  IF v_status = 'cancelled' THEN RAISE EXCEPTION 'cancelled carton cannot be posted'; END IF;
  IF v_status NOT IN ('released','arrived_bd') THEN
    RAISE EXCEPTION 'carton must be released (or arrived_bd with override) to post';
  END IF;
  IF v_status = 'arrived_bd' AND NOT public._imp_has_any_role(v_user, 'admin','accountant') THEN
    RAISE EXCEPTION 'posting an unreleased carton requires admin/accountant';
  END IF;

  IF v_po_total_units <= 0 THEN
    SELECT COALESCE(SUM(quantity), 0)::int INTO v_po_total_units FROM imp_po_items WHERE po_id = v_po;
  END IF;

  IF v_wh IS NULL THEN
    SELECT id INTO v_wh FROM warehouses WHERE brand_id = v_brand AND is_default = true AND is_active = true LIMIT 1;
  END IF;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'no warehouse'; END IF;
  PERFORM 1 FROM warehouses WHERE id = v_wh AND brand_id = v_brand AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'warehouse not active or brand mismatch'; END IF;

  IF v_loc_pay IS NOT NULL AND (v_loc_pay ? 'amount') THEN
    v_carton_loc := (v_loc_pay->>'amount')::numeric;
    v_loc_payment := public._imp_record_payment(
      v_brand, v_po, v_carton, 'local_courier',
      v_carton_loc, (v_loc_pay->>'wallet_id')::uuid,
      COALESCE((v_loc_pay->>'payment_date')::date, CURRENT_DATE),
      v_loc_pay->>'reference', v_loc_pay->>'notes', v_loc_pay->>'idempotency_key',
      v_user,
      public.imp_get_or_create_account(v_brand, '1310-IMP-CLR', 'Import Clearing', 'asset', 'debit'),
      COALESCE(
        (SELECT id FROM erp_chart_accounts WHERE brand_id = v_brand AND code = (SELECT account_number FROM erp_accounts WHERE id = (v_loc_pay->>'wallet_id')::uuid) LIMIT 1),
        public.imp_get_or_create_account(v_brand, '1100-WALLET', 'Wallet/Bank', 'asset', 'debit')
      )
    );
    UPDATE imp_cartons SET local_courier_bdt = local_courier_bdt + v_carton_loc WHERE id = v_carton;
    v_loc := v_loc + v_carton_loc;
  END IF;

  IF v_due_pay IS NOT NULL AND (v_due_pay ? 'amount') THEN
    v_due_payment := public._imp_record_payment(
      v_brand, v_po, v_carton, 'supplier_balance',
      (v_due_pay->>'amount')::numeric, (v_due_pay->>'wallet_id')::uuid,
      COALESCE((v_due_pay->>'payment_date')::date, CURRENT_DATE),
      v_due_pay->>'reference', v_due_pay->>'notes', v_due_pay->>'idempotency_key',
      v_user,
      public.imp_get_or_create_account(v_brand, '2100-SUP-AP', 'Supplier Payable', 'liability', 'credit'),
      COALESCE(
        (SELECT id FROM erp_chart_accounts WHERE brand_id = v_brand AND code = (SELECT account_number FROM erp_accounts WHERE id = (v_due_pay->>'wallet_id')::uuid) LIMIT 1),
        public.imp_get_or_create_account(v_brand, '1100-WALLET', 'Wallet/Bank', 'asset', 'debit')
      )
    );
  END IF;

  FOR v_qc_row IN SELECT * FROM jsonb_array_elements(v_qc) LOOP
    DECLARE
      v_ci_id uuid := (v_qc_row->>'carton_item_id')::uuid;
      v_ok int := COALESCE((v_qc_row->>'quantity_ok')::int, 0);
      v_dmg int := COALESCE((v_qc_row->>'quantity_damaged')::int, 0);
      v_mis int := COALESCE((v_qc_row->>'quantity_missing')::int, 0);
      v_exp int;
    BEGIN
      IF v_ok < 0 OR v_dmg < 0 OR v_mis < 0 THEN RAISE EXCEPTION 'qc qty cannot be negative'; END IF;
      SELECT quantity_expected INTO v_exp FROM imp_carton_items WHERE id = v_ci_id AND carton_id = v_carton FOR UPDATE;
      IF v_exp IS NULL THEN RAISE EXCEPTION 'carton item not found'; END IF;
      UPDATE imp_carton_items SET quantity_ok=v_ok, quantity_damaged=v_dmg, quantity_missing=v_mis WHERE id = v_ci_id;
      v_total_ok := v_total_ok + v_ok;
      v_total_damaged := v_total_damaged + v_dmg;
      v_total_missing := v_total_missing + v_mis;
      v_carton_units := v_carton_units + GREATEST(v_ok + v_dmg + v_mis, v_exp);
    END;
  END LOOP;

  IF v_po_extras > 0 AND v_po_total_units > 0 THEN
    v_extras_share := round(v_po_extras * v_carton_units::numeric / v_po_total_units::numeric, 4);
    v_po_extra_per_unit := v_po_extras / v_po_total_units::numeric;
  ELSE
    v_extras_share := 0;
    v_po_extra_per_unit := 0;
  END IF;

  v_landed := round(v_sup + v_ship + v_loc + v_extras_share, 4);
  v_ship_loc_per_unit := CASE WHEN v_carton_units > 0 THEN (v_ship + v_loc) / v_carton_units::numeric ELSE 0 END;

  IF v_total_ok = 0 THEN
    v_loss_acc := public.imp_get_or_create_account(v_brand, '5900-IMP-LOSS', 'Import Loss (QC)', 'expense', 'debit');
    v_clr_acc := public.imp_get_or_create_account(v_brand, '1310-IMP-CLR', 'Import Clearing', 'asset', 'debit');
    v_lines := jsonb_build_array(
      jsonb_build_object('account_id', v_loss_acc, 'debit', v_landed, 'credit', 0, 'description', 'Total loss carton'),
      jsonb_build_object('account_id', v_clr_acc, 'debit', 0, 'credit', v_landed, 'description', 'Clear import clearing')
    );
    v_journal := public._imp_post_journal(v_brand, CURRENT_DATE, 'Import carton total loss', 'imp_carton_loss', v_carton, v_lines, v_user);

    UPDATE imp_cartons SET status='in_stock', qc_at=now(), posted_at=now(), warehouse_id=v_wh, total_landed_bdt=v_landed,
      notes = COALESCE(notes,'') || ' [TOTAL LOSS]'
    WHERE id = v_carton;

    PERFORM public._imp_log(v_brand, 'carton', v_carton, v_status::text, 'in_stock', 'total_loss', 'idem:' || v_idem, v_user, NULL,
      jsonb_build_object('damaged', v_total_damaged, 'missing', v_total_missing));
    PERFORM public._imp_refresh_po_status(v_po);
    PERFORM public._imp_refresh_po_totals(v_po);
    RETURN jsonb_build_object('total_loss', true, 'journal_entry_id', v_journal);
  END IF;

  SELECT COALESCE(SUM((
    CASE
      WHEN COALESCE(pi.landed_cost_bdt, 0) > 0 THEN pi.landed_cost_bdt + v_ship_loc_per_unit
      ELSE COALESCE(NULLIF(pi.unit_cost_bdt, 0), NULLIF(pi.subtotal_bdt / NULLIF(pi.quantity, 0), 0), v_sup / NULLIF(v_carton_units, 0), 0)
           + v_ship_loc_per_unit + v_po_extra_per_unit
    END
  ) * ci.quantity_ok), 0)
    INTO v_pre_ok_cost
  FROM imp_carton_items ci
  JOIN imp_po_items pi ON pi.id = ci.po_item_id
  WHERE ci.carton_id = v_carton AND ci.quantity_ok > 0;

  v_cost_factor := CASE WHEN v_pre_ok_cost > 0 THEN v_landed / v_pre_ok_cost ELSE 1 END;
  v_unit_landed := round(v_landed / v_total_ok, 6);

  DECLARE
    v_ci RECORD;
    v_old_stock int; v_old_cost numeric; v_new_cost numeric;
    v_prod_stock int; v_prod_cost numeric;
    v_item_base numeric; v_row_unit_pre numeric; v_row_unit_landed numeric; v_row_total_cost numeric;
    v_move_before int; v_move_after int;
    v_has_landed boolean;
  BEGIN
    FOR v_ci IN
      SELECT ci.*, pi.unit_cost_bdt AS po_unit_bdt, pi.landed_cost_bdt AS po_landed_bdt,
             pi.subtotal_bdt AS po_subtotal_bdt, pi.quantity AS po_quantity
      FROM imp_carton_items ci JOIN imp_po_items pi ON pi.id = ci.po_item_id
      WHERE ci.carton_id = v_carton AND ci.quantity_ok > 0
    LOOP
      v_has_landed := COALESCE(v_ci.po_landed_bdt, 0) > 0;
      v_item_base := CASE
        WHEN v_has_landed THEN v_ci.po_landed_bdt
        ELSE COALESCE(NULLIF(v_ci.po_unit_bdt, 0), NULLIF(v_ci.po_subtotal_bdt / NULLIF(v_ci.po_quantity, 0), 0), v_sup / NULLIF(v_carton_units, 0), 0)
      END;
      v_row_unit_pre := v_item_base + v_ship_loc_per_unit + CASE WHEN v_has_landed THEN 0 ELSE v_po_extra_per_unit END;
      v_row_unit_landed := round(v_row_unit_pre * v_cost_factor, 6);
      v_row_total_cost := round(v_row_unit_landed * v_ci.quantity_ok, 4);

      IF v_ci.variant_id IS NOT NULL THEN
        SELECT pv.stock, COALESCE(pv.weighted_avg_cost, p.cost_price, 0)
          INTO v_old_stock, v_old_cost
        FROM product_variants pv JOIN products p ON p.id = pv.product_id
        WHERE pv.id = v_ci.variant_id FOR UPDATE OF pv;

        v_new_cost := CASE
          WHEN (COALESCE(v_old_stock,0) + v_ci.quantity_ok) > 0
            THEN round((COALESCE(v_old_stock,0) * COALESCE(v_old_cost,0) + v_row_total_cost)
                       / (COALESCE(v_old_stock,0) + v_ci.quantity_ok), 4)
          ELSE v_row_unit_landed
        END;
        v_move_before := COALESCE(v_old_stock,0);
        v_move_after := COALESCE(v_old_stock,0) + v_ci.quantity_ok;

        UPDATE product_variants
        SET stock = COALESCE(stock,0) + v_ci.quantity_ok,
            weighted_avg_cost = v_new_cost,
            available_stock = GREATEST(COALESCE(stock,0) + v_ci.quantity_ok - COALESCE(reserved_stock,0), 0),
            updated_at = now()
        WHERE id = v_ci.variant_id;

        IF v_ci.product_id IS NOT NULL THEN
          UPDATE products p
          SET stock = COALESCE(vs.stock_sum, 0),
              available_stock = GREATEST(COALESCE(vs.stock_sum, 0) - COALESCE(p.reserved_stock, 0), 0),
              total_cost_value = COALESCE(vs.cost_sum, 0),
              cost_price = CASE WHEN COALESCE(vs.stock_sum, 0) > 0 THEN round(COALESCE(vs.cost_sum, 0) / vs.stock_sum, 4) ELSE p.cost_price END,
              weighted_avg_cost = CASE WHEN COALESCE(vs.stock_sum, 0) > 0 THEN round(COALESCE(vs.cost_sum, 0) / vs.stock_sum, 4) ELSE p.weighted_avg_cost END,
              updated_at = now()
          FROM (
            SELECT COALESCE(SUM(COALESCE(stock,0)),0)::int AS stock_sum,
                   COALESCE(SUM(COALESCE(stock,0) * COALESCE(weighted_avg_cost,0)),0) AS cost_sum
            FROM product_variants
            WHERE product_id = v_ci.product_id
          ) vs
          WHERE p.id = v_ci.product_id;
        END IF;
      ELSE
        IF v_ci.product_id IS NOT NULL THEN
          SELECT stock, COALESCE(weighted_avg_cost, cost_price, 0) INTO v_prod_stock, v_prod_cost
          FROM products WHERE id = v_ci.product_id FOR UPDATE;

          v_new_cost := CASE
            WHEN (COALESCE(v_prod_stock,0) + v_ci.quantity_ok) > 0
              THEN round((COALESCE(v_prod_stock,0) * COALESCE(v_prod_cost,0) + v_row_total_cost)
                         / (COALESCE(v_prod_stock,0) + v_ci.quantity_ok), 4)
            ELSE v_row_unit_landed
          END;
          v_move_before := COALESCE(v_prod_stock,0);
          v_move_after := COALESCE(v_prod_stock,0) + v_ci.quantity_ok;

          UPDATE products SET
            stock = COALESCE(stock,0) + v_ci.quantity_ok,
            available_stock = GREATEST(COALESCE(stock,0) + v_ci.quantity_ok - COALESCE(reserved_stock,0), 0),
            total_cost_value = COALESCE(total_cost_value,0) + v_row_total_cost,
            cost_price = v_new_cost,
            weighted_avg_cost = v_new_cost,
            updated_at = now()
          WHERE id = v_ci.product_id;
        ELSE
          v_move_before := 0;
          v_move_after := v_ci.quantity_ok;
        END IF;
      END IF;

      IF v_ci.product_id IS NOT NULL THEN
        INSERT INTO stock_movements (
          brand_id, product_id, variant_id, warehouse_id,
          delta, stock_before, stock_after, reason, note,
          unit_cost_bdt, total_cost_bdt, reference_type, reference_id, idempotency_key, user_id
        ) VALUES (
          v_brand, v_ci.product_id, v_ci.variant_id, v_wh,
          v_ci.quantity_ok, v_move_before, v_move_after,
          'import_receive',
          format('PO %s carton item', (SELECT po_number FROM imp_purchase_orders WHERE id = v_po)),
          v_row_unit_landed, v_row_total_cost,
          'imp_carton', v_carton,
          'imp_post:' || v_idem || ':' || v_ci.id::text,
          v_user
        );
      END IF;
    END LOOP;
  END;

  v_inv_acc := public.imp_get_or_create_account(v_brand, '1200-INV', 'Inventory Asset', 'asset', 'debit');
  v_clr_acc := public.imp_get_or_create_account(v_brand, '1310-IMP-CLR', 'Import Clearing', 'asset', 'debit');
  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_inv_acc, 'debit', v_landed, 'credit', 0, 'description', 'Inventory in'),
    jsonb_build_object('account_id', v_clr_acc, 'debit', 0, 'credit', v_landed, 'description', 'Clear import clearing')
  );
  v_journal := public._imp_post_journal(v_brand, CURRENT_DATE,
    format('Import inventory receipt (PO %s carton)', (SELECT po_number FROM imp_purchase_orders WHERE id = v_po)),
    'imp_carton_post', v_carton, v_lines, v_user);

  UPDATE imp_cartons SET status='in_stock', qc_at=now(), posted_at=now(), warehouse_id=v_wh, total_landed_bdt=v_landed
   WHERE id = v_carton;

  PERFORM public._imp_log(v_brand, 'carton', v_carton, v_status::text, 'in_stock', 'posted_to_inventory', 'idem:' || v_idem, v_user, NULL,
    jsonb_build_object('ok', v_total_ok, 'damaged', v_total_damaged, 'missing', v_total_missing,
                       'landed', v_landed, 'unit_landed', v_unit_landed, 'po_extras_share', v_extras_share,
                       'row_cost_factor', v_cost_factor));

  PERFORM public._imp_refresh_po_totals(v_po);
  PERFORM public._imp_refresh_po_status(v_po);

  RETURN jsonb_build_object('total_ok', v_total_ok, 'landed', v_landed, 'unit_landed', v_unit_landed,
                            'po_extras_share', v_extras_share, 'journal_entry_id', v_journal);
END $function$;