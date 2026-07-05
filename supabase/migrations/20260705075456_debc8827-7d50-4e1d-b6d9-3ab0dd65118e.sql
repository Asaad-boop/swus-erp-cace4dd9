CREATE OR REPLACE FUNCTION public.imp_post_to_inventory(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','operations','warehouse_staff') THEN
    RAISE EXCEPTION 'not authorized to post inventory';
  END IF;
  IF v_idem IS NULL OR length(v_idem) < 8 THEN RAISE EXCEPTION 'idempotency_key required'; END IF;

  PERFORM 1 FROM stock_movements WHERE idempotency_key = 'imp_post:' || v_idem;
  IF FOUND THEN RETURN jsonb_build_object('idempotent_replay', true); END IF;

  SELECT c.status, c.po_id, p.brand_id, c.supplier_cost_bdt, c.shipping_charge_bdt, c.local_courier_bdt,
         COALESCE(p.freight_cost_bdt,0) + COALESCE(p.customs_duty_bdt,0) + COALESCE(p.other_charges_bdt,0),
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
      -- NOTE: equality check between (ok+damaged+missing) and expected removed intentionally.
      -- Seller may deliver extra or fewer pieces than PO expected; we accept the actual counts.
      UPDATE imp_carton_items SET quantity_ok=v_ok, quantity_damaged=v_dmg, quantity_missing=v_mis WHERE id = v_ci_id;
      v_total_ok := v_total_ok + v_ok;
      v_total_damaged := v_total_damaged + v_dmg;
      v_total_missing := v_total_missing + v_mis;
      v_carton_units := v_carton_units + GREATEST(v_ok + v_dmg + v_mis, v_exp);
    END;
  END LOOP;

  IF v_po_extras > 0 AND v_po_total_units > 0 THEN
    v_extras_share := round(v_po_extras * v_carton_units::numeric / v_po_total_units::numeric, 4);
  ELSE
    v_extras_share := 0;
  END IF;

  v_landed := round(v_sup + v_ship + v_loc + v_extras_share, 4);
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

  v_unit_landed := round(v_landed / v_total_ok, 6);

  DECLARE
    v_ci RECORD;
    v_old_stock int; v_old_cost numeric; v_new_cost numeric;
    v_prod_stock int; v_prod_cost numeric;
  BEGIN
    FOR v_ci IN
      SELECT ci.*, pi.unit_cost_bdt AS po_unit_bdt
      FROM imp_carton_items ci JOIN imp_po_items pi ON pi.id = ci.po_item_id
      WHERE ci.carton_id = v_carton AND ci.quantity_ok > 0
    LOOP
      IF v_ci.variant_id IS NOT NULL THEN
        SELECT pv.stock, COALESCE(p.cost_price, 0)
          INTO v_old_stock, v_old_cost
        FROM product_variants pv JOIN products p ON p.id = pv.product_id
        WHERE pv.id = v_ci.variant_id FOR UPDATE OF pv;

        v_new_cost := CASE
          WHEN (v_old_stock + v_ci.quantity_ok) > 0
            THEN round((COALESCE(v_old_stock,0) * COALESCE(v_old_cost,0) + v_ci.quantity_ok * v_unit_landed)
                       / (COALESCE(v_old_stock,0) + v_ci.quantity_ok), 4)
          ELSE v_unit_landed
        END;

        UPDATE product_variants SET stock = COALESCE(stock,0) + v_ci.quantity_ok, weighted_avg_cost = v_new_cost WHERE id = v_ci.variant_id;
      ELSE
        v_new_cost := v_unit_landed;
      END IF;

      IF v_ci.product_id IS NOT NULL THEN
        SELECT stock, COALESCE(cost_price,0) INTO v_prod_stock, v_prod_cost
        FROM products WHERE id = v_ci.product_id FOR UPDATE;

        UPDATE products SET
          stock = COALESCE(stock,0) + v_ci.quantity_ok,
          cost_price = CASE
            WHEN (COALESCE(v_prod_stock,0) + v_ci.quantity_ok) > 0
              THEN round((COALESCE(v_prod_stock,0) * COALESCE(v_prod_cost,0) + v_ci.quantity_ok * v_unit_landed)
                         / (COALESCE(v_prod_stock,0) + v_ci.quantity_ok), 4)
            ELSE v_unit_landed
          END,
          weighted_avg_cost = CASE
            WHEN (COALESCE(v_prod_stock,0) + v_ci.quantity_ok) > 0
              THEN round((COALESCE(v_prod_stock,0) * COALESCE(v_prod_cost,0) + v_ci.quantity_ok * v_unit_landed)
                         / (COALESCE(v_prod_stock,0) + v_ci.quantity_ok), 4)
            ELSE v_unit_landed
          END
        WHERE id = v_ci.product_id;

        INSERT INTO stock_movements (
          brand_id, product_id, variant_id, warehouse_id,
          delta, stock_before, stock_after, reason, note,
          unit_cost_bdt, total_cost_bdt, reference_type, reference_id, idempotency_key, user_id
        ) VALUES (
          v_brand, v_ci.product_id, v_ci.variant_id, v_wh,
          v_ci.quantity_ok, COALESCE(v_prod_stock,0), COALESCE(v_prod_stock,0) + v_ci.quantity_ok,
          'import_receive',
          format('PO %s carton item', (SELECT po_number FROM imp_purchase_orders WHERE id = v_po)),
          v_unit_landed, round(v_unit_landed * v_ci.quantity_ok, 4),
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
                       'landed', v_landed, 'unit_landed', v_unit_landed, 'po_extras_share', v_extras_share));

  PERFORM public._imp_refresh_po_totals(v_po);
  PERFORM public._imp_refresh_po_status(v_po);

  RETURN jsonb_build_object('total_ok', v_total_ok, 'landed', v_landed, 'unit_landed', v_unit_landed,
                            'po_extras_share', v_extras_share, 'journal_entry_id', v_journal);
END $$;