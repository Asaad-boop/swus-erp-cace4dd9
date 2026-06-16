-- =========================================================================
-- IMPORTS MODULE — Phase 2: Atomic RPCs
-- =========================================================================

-- ---------------------------------------------------------------------
-- Helper: post a balanced journal (called only from already-authorized SD fns)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._imp_post_journal(
  _brand_id uuid,
  _entry_date date,
  _description text,
  _source_type text,
  _source_id uuid,
  _lines jsonb,
  _user uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry_id uuid;
  v_entry_no text;
  v_seq bigint;
  v_total_debit numeric(18,4) := 0;
  v_total_credit numeric(18,4) := 0;
  v_line jsonb;
  v_acc_brand uuid;
BEGIN
  IF _lines IS NULL OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'Journal must have at least 2 lines';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_total_debit  := v_total_debit  + COALESCE((v_line->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + COALESCE((v_line->>'credit')::numeric, 0);
    SELECT brand_id INTO v_acc_brand FROM erp_chart_accounts WHERE id = (v_line->>'account_id')::uuid;
    IF v_acc_brand IS NULL OR v_acc_brand <> _brand_id THEN
      RAISE EXCEPTION 'Account brand mismatch';
    END IF;
  END LOOP;

  IF round(v_total_debit,4) <> round(v_total_credit,4) THEN
    RAISE EXCEPTION 'Journal not balanced: debit %, credit %', v_total_debit, v_total_credit;
  END IF;
  IF v_total_debit <= 0 THEN
    RAISE EXCEPTION 'Journal totals must be positive';
  END IF;

  v_seq := nextval('erp_journal_entries_seq_' || to_char(_entry_date,'YYYYMM'));
  v_entry_no := 'JE-' || to_char(_entry_date,'YYYYMM') || '-' || lpad(v_seq::text, 5, '0');

  INSERT INTO erp_journal_entries (brand_id, entry_no, entry_date, description, source_type, source_id, status, created_by)
  VALUES (_brand_id, v_entry_no, _entry_date, _description, _source_type, _source_id, 'posted', _user)
  RETURNING id INTO v_entry_id;

  INSERT INTO erp_journal_lines (brand_id, journal_entry_id, account_id, debit, credit, description, line_order)
  SELECT _brand_id, v_entry_id, (l->>'account_id')::uuid,
         COALESCE((l->>'debit')::numeric, 0),
         COALESCE((l->>'credit')::numeric, 0),
         l->>'description',
         (ord - 1)::int
  FROM jsonb_array_elements(_lines) WITH ORDINALITY AS t(l, ord);

  RETURN v_entry_id;
EXCEPTION WHEN undefined_table THEN
  -- monthly sequence missing — create and retry once
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS erp_journal_entries_seq_%s', to_char(_entry_date,'YYYYMM'));
  v_seq := nextval('erp_journal_entries_seq_' || to_char(_entry_date,'YYYYMM'));
  v_entry_no := 'JE-' || to_char(_entry_date,'YYYYMM') || '-' || lpad(v_seq::text, 5, '0');
  INSERT INTO erp_journal_entries (brand_id, entry_no, entry_date, description, source_type, source_id, status, created_by)
  VALUES (_brand_id, v_entry_no, _entry_date, _description, _source_type, _source_id, 'posted', _user)
  RETURNING id INTO v_entry_id;
  INSERT INTO erp_journal_lines (brand_id, journal_entry_id, account_id, debit, credit, description, line_order)
  SELECT _brand_id, v_entry_id, (l->>'account_id')::uuid,
         COALESCE((l->>'debit')::numeric, 0),
         COALESCE((l->>'credit')::numeric, 0),
         l->>'description',
         (ord - 1)::int
  FROM jsonb_array_elements(_lines) WITH ORDINALITY AS t(l, ord);
  RETURN v_entry_id;
END $$;

REVOKE EXECUTE ON FUNCTION public._imp_post_journal(uuid,date,text,text,uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- Helper: role gate
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._imp_has_any_role(_user uuid, VARIADIC _roles text[])
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r text;
BEGIN
  IF _user IS NULL THEN RETURN false; END IF;
  FOREACH r IN ARRAY _roles LOOP
    IF public.has_role(_user, r::public.app_role) THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;
REVOKE EXECUTE ON FUNCTION public._imp_has_any_role(uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._imp_has_any_role(uuid, text[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Helper: audit log
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._imp_log(
  _brand uuid, _entity_type text, _entity_id uuid,
  _prev text, _new text, _action text, _notes text, _user uuid,
  _before jsonb DEFAULT NULL, _after jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO imp_status_history (brand_id, entity_type, entity_id, previous_status, new_status, action, notes, changed_by, before_data, after_data)
  VALUES (_brand, _entity_type, _entity_id, _prev, _new, _action, _notes, _user, _before, _after);
END $$;
REVOKE EXECUTE ON FUNCTION public._imp_log(uuid,text,uuid,text,text,text,text,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- Helper: refresh PO totals from items + cartons + active payments
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._imp_refresh_po_totals(_po uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prod numeric(18,4); v_ship numeric(18,4); v_loc numeric(18,4);
  v_paid numeric(18,4); v_grand numeric(18,4);
BEGIN
  SELECT COALESCE(SUM(subtotal_bdt),0) INTO v_prod FROM imp_po_items WHERE po_id = _po;
  SELECT COALESCE(SUM(shipping_charge_bdt),0), COALESCE(SUM(local_courier_bdt),0)
    INTO v_ship, v_loc FROM imp_cartons WHERE po_id = _po AND status <> 'cancelled';
  SELECT COALESCE(SUM(amount_bdt),0) INTO v_paid FROM imp_payments WHERE po_id = _po AND is_reversed = false;
  v_grand := round(v_prod + v_ship + v_loc, 4);
  UPDATE imp_purchase_orders SET
    product_subtotal_bdt = round(v_prod,4),
    shipping_total_bdt   = round(v_ship,4),
    local_courier_total_bdt = round(v_loc,4),
    grand_total_bdt = v_grand,
    paid_bdt = round(v_paid,4),
    due_bdt = GREATEST(round(v_grand - v_paid, 4), 0)
  WHERE id = _po;
END $$;
REVOKE EXECUTE ON FUNCTION public._imp_refresh_po_totals(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- Helper: auto-roll PO status based on carton states
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._imp_refresh_po_status(_po uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total int; v_instock int; v_arrived int; v_intransit int; v_atchina int; v_ordered int;
  v_new public.imp_po_status; v_old public.imp_po_status;
BEGIN
  SELECT status INTO v_old FROM imp_purchase_orders WHERE id = _po FOR UPDATE;
  IF v_old = 'cancelled' THEN RETURN; END IF;

  SELECT COUNT(*) FILTER (WHERE status <> 'cancelled'),
         COUNT(*) FILTER (WHERE status = 'in_stock'),
         COUNT(*) FILTER (WHERE status = 'arrived_bd' OR status = 'released'),
         COUNT(*) FILTER (WHERE status = 'in_transit'),
         COUNT(*) FILTER (WHERE status = 'at_china_warehouse'),
         COUNT(*) FILTER (WHERE status = 'ordered')
    INTO v_total, v_instock, v_arrived, v_intransit, v_atchina, v_ordered
  FROM imp_cartons WHERE po_id = _po;

  IF v_total = 0 THEN RETURN; END IF;

  IF v_instock = v_total THEN v_new := 'completed';
  ELSIF v_instock > 0 THEN v_new := 'partially_received';
  ELSIF v_arrived > 0 THEN v_new := 'arrived_bd';
  ELSIF v_intransit = v_total THEN v_new := 'in_transit';
  ELSIF v_atchina = v_total THEN v_new := 'at_china_warehouse';
  ELSIF v_ordered = v_total THEN v_new := 'ordered';
  ELSE v_new := v_old; -- mixed pre-arrival; keep
  END IF;

  IF v_new IS DISTINCT FROM v_old THEN
    UPDATE imp_purchase_orders SET status = v_new WHERE id = _po;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public._imp_refresh_po_status(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- Helper: record a payment row + post journal + update wallet
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._imp_record_payment(
  _brand uuid, _po uuid, _carton uuid, _ptype public.imp_payment_type,
  _amount numeric, _wallet uuid, _date date, _ref text, _notes text,
  _idem text, _user uuid,
  _dr_account uuid, _cr_account uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing uuid; v_balance numeric; v_journal uuid; v_payment uuid;
  v_wallet_brand uuid; v_dr text; v_cr text;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  IF _idem IS NULL OR length(_idem) < 8 THEN RAISE EXCEPTION 'idempotency key required'; END IF;

  -- idempotency check
  SELECT id INTO v_existing FROM imp_payments WHERE idempotency_key = _idem;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  -- wallet brand + balance
  SELECT brand_id, current_balance INTO v_wallet_brand, v_balance FROM erp_accounts WHERE id = _wallet FOR UPDATE;
  IF v_wallet_brand IS NULL THEN RAISE EXCEPTION 'wallet not found'; END IF;
  IF v_wallet_brand <> _brand THEN RAISE EXCEPTION 'wallet brand mismatch'; END IF;
  IF v_balance < _amount THEN RAISE EXCEPTION 'insufficient wallet balance (have %, need %)', v_balance, _amount; END IF;

  -- post journal
  SELECT code INTO v_dr FROM erp_chart_accounts WHERE id = _dr_account;
  SELECT code INTO v_cr FROM erp_chart_accounts WHERE id = _cr_account;
  v_journal := public._imp_post_journal(
    _brand, _date,
    format('Import %s payment (PO %s)', _ptype, COALESCE((SELECT po_number FROM imp_purchase_orders WHERE id = _po), '')),
    'imp_payment', NULL,
    jsonb_build_array(
      jsonb_build_object('account_id', _dr_account, 'debit', _amount, 'credit', 0, 'description', _ptype::text),
      jsonb_build_object('account_id', _cr_account, 'debit', 0, 'credit', _amount, 'description', 'Wallet outflow')
    ),
    _user
  );

  -- insert payment
  INSERT INTO imp_payments (brand_id, po_id, carton_id, payment_type, amount_bdt, wallet_id,
                            payment_date, reference, notes, journal_entry_id, idempotency_key, created_by)
  VALUES (_brand, _po, _carton, _ptype, round(_amount,4), _wallet, _date, _ref, _notes, v_journal, _idem, _user)
  RETURNING id INTO v_payment;

  -- link journal to payment
  UPDATE erp_journal_entries SET source_type='imp_payment', source_id=v_payment WHERE id = v_journal;

  -- wallet balance
  UPDATE erp_accounts SET current_balance = current_balance - _amount, updated_at = now() WHERE id = _wallet;

  RETURN v_payment;
END $$;
REVOKE EXECUTE ON FUNCTION public._imp_record_payment(uuid,uuid,uuid,public.imp_payment_type,numeric,uuid,date,text,text,text,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;

-- =====================================================================
-- RPC 1: create import PO (atomic)
-- payload: {
--   brand_id, cargo_agent_id?, order_date, currency, fx_rate, notes?,
--   supplier: { id? | name, source_link?, phone?, address?, currency?, payment_terms_days?, credit_limit_bdt?, notes? },
--   items: [{ product_id?, variant_id?, sku_snapshot, name_snapshot, image_snapshot?, quantity, unit_cost_foreign }],
--   cartons: [{ carton_number, weight_kg?, allocations: [{ item_index, quantity }] }],
--   initial_payment?: { amount_bdt, wallet_id, payment_date, reference?, idempotency_key, payment_type? },
--   idempotency_key
-- }
-- =====================================================================
CREATE OR REPLACE FUNCTION public.imp_create_po(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN RAISE EXCEPTION 'items required'; END IF;
  IF v_cartons IS NULL OR jsonb_array_length(v_cartons) = 0 THEN RAISE EXCEPTION 'cartons required'; END IF;

  -- idempotency: if a PO already exists for this key, return it
  SELECT id INTO v_existing_po FROM imp_purchase_orders
    WHERE brand_id = v_brand AND notes LIKE '%[idem:' || v_idem || ']%' LIMIT 1;
  IF v_existing_po IS NOT NULL THEN
    RETURN jsonb_build_object('po_id', v_existing_po, 'po_number',
           (SELECT po_number FROM imp_purchase_orders WHERE id = v_existing_po),
           'idempotent_replay', true);
  END IF;

  -- resolve supplier
  IF v_supplier_payload ? 'id' AND NULLIF(v_supplier_payload->>'id','') IS NOT NULL THEN
    v_supplier_id := (v_supplier_payload->>'id')::uuid;
    PERFORM 1 FROM erp_suppliers WHERE id = v_supplier_id AND brand_id = v_brand AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'supplier not found or inactive'; END IF;
  ELSE
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
  END IF;

  -- validate cargo agent brand
  IF v_agent IS NOT NULL THEN
    PERFORM 1 FROM imp_cargo_agents WHERE id = v_agent AND brand_id = v_brand AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'cargo agent not found or inactive'; END IF;
  END IF;

  -- generate PO number
  v_po_number := public.imp_next_po_number(v_brand);

  -- insert PO
  INSERT INTO imp_purchase_orders (po_number, brand_id, cargo_agent_id, supplier_id, order_date, currency, fx_rate, status, notes, created_by)
  VALUES (v_po_number, v_brand, v_agent, v_supplier_id, v_order_date, v_currency, v_fx, 'ordered',
          COALESCE(v_notes,'') || ' [idem:' || v_idem || ']', v_user)
  RETURNING id INTO v_po_id;

  -- insert items
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

  -- insert cartons + carton_items, and accumulate per-item totals
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

    -- reconcile per-item totals
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

  -- supplier-cost allocation to cartons: proportional to expected_quantity * (item unit cost)
  -- For simplicity in MVP: supplier_cost_bdt per carton = sum of (alloc_qty * item unit_cost_bdt)
  UPDATE imp_cartons c SET supplier_cost_bdt = round(coalesce(s.cost,0), 4)
  FROM (
    SELECT ci.carton_id AS cid, SUM(ci.quantity_expected * pi.unit_cost_bdt) AS cost
    FROM imp_carton_items ci JOIN imp_po_items pi ON pi.id = ci.po_item_id
    GROUP BY ci.carton_id
  ) s WHERE s.cid = c.id AND c.po_id = v_po_id;

  UPDATE imp_cartons SET total_landed_bdt = supplier_cost_bdt + shipping_charge_bdt + local_courier_bdt
   WHERE po_id = v_po_id;

  -- optional initial payment
  IF v_init IS NOT NULL AND (v_init ? 'amount_bdt') THEN
    v_dr := public.imp_get_or_create_account(v_brand, '1320-SUP-ADV', 'Supplier Advance', 'asset', 'debit');
    SELECT id INTO v_cr FROM erp_accounts WHERE id = (v_init->>'wallet_id')::uuid;
    v_payment_id := public._imp_record_payment(
      v_brand, v_po_id, NULL,
      COALESCE((v_init->>'payment_type')::public.imp_payment_type, 'supplier_advance'),
      (v_init->>'amount_bdt')::numeric,
      (v_init->>'wallet_id')::uuid,
      COALESCE((v_init->>'payment_date')::date, v_order_date),
      v_init->>'reference', v_init->>'notes',
      v_init->>'idempotency_key',
      v_user,
      v_dr,
      -- credit wallet account: resolve via erp_accounts.account_number → CoA, fallback to clearing
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
END $$;
REVOKE EXECUTE ON FUNCTION public.imp_create_po(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.imp_create_po(jsonb) TO authenticated, service_role;

-- =====================================================================
-- RPC 2: update carton stage (pre-arrival only)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.imp_update_carton_stage(_carton uuid, _new_stage text, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_cur public.imp_carton_status; v_po uuid; v_brand uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','operations','warehouse_staff') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _new_stage NOT IN ('ordered','at_china_warehouse','in_transit','cancelled') THEN
    RAISE EXCEPTION 'only pre-arrival or cancel stage allowed via this RPC';
  END IF;

  SELECT c.status, c.po_id, p.brand_id INTO v_cur, v_po, v_brand
  FROM imp_cartons c JOIN imp_purchase_orders p ON p.id = c.po_id
  WHERE c.id = _carton FOR UPDATE;
  IF v_cur IS NULL THEN RAISE EXCEPTION 'carton not found'; END IF;
  IF v_cur IN ('arrived_bd','released','in_stock') THEN
    RAISE EXCEPTION 'carton already past pre-arrival stage';
  END IF;

  UPDATE imp_cartons SET status = _new_stage::public.imp_carton_status WHERE id = _carton;
  PERFORM public._imp_log(v_brand, 'carton', _carton, v_cur::text, _new_stage, 'stage_change', _notes, v_user, NULL, NULL);
  PERFORM public._imp_refresh_po_status(v_po);
END $$;
REVOKE EXECUTE ON FUNCTION public.imp_update_carton_stage(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.imp_update_carton_stage(uuid, text, text) TO authenticated, service_role;

-- =====================================================================
-- RPC 3: mark arrived in BD (shipping allocation)
-- payload: { po_id, total_weight_kg, rate_per_kg_bdt, carton_ids?[],
--            shipping_payment?: {amount, wallet_id, payment_date, reference, idempotency_key},
--            idempotency_key }
-- =====================================================================
CREATE OR REPLACE FUNCTION public.imp_mark_arrived(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_po uuid := (_payload->>'po_id')::uuid;
  v_w numeric := (_payload->>'total_weight_kg')::numeric;
  v_rate numeric := (_payload->>'rate_per_kg_bdt')::numeric;
  v_brand uuid; v_ship_total numeric; v_allocated numeric := 0;
  v_total_qty int; v_carton RECORD;
  v_last_id uuid; v_idem text := _payload->>'idempotency_key';
  v_existing uuid; v_pay jsonb := _payload->'shipping_payment';
  v_payment_id uuid; v_dr uuid; v_cr uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','operations','accountant') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_w IS NULL OR v_w <= 0 OR v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'weight and rate must be positive';
  END IF;
  IF v_idem IS NULL OR length(v_idem) < 8 THEN RAISE EXCEPTION 'idempotency_key required'; END IF;

  -- idempotency: log entry
  SELECT id INTO v_existing FROM imp_status_history
    WHERE entity_type='po' AND entity_id=v_po AND action='arrived_bd' AND notes = 'idem:' || v_idem LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('idempotent_replay', true);
  END IF;

  SELECT brand_id INTO v_brand FROM imp_purchase_orders WHERE id = v_po FOR UPDATE;
  IF v_brand IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;

  v_ship_total := round(v_w * v_rate, 4);

  -- pick eligible cartons (not yet arrived/released/in_stock/cancelled)
  SELECT COALESCE(SUM(expected_quantity),0) INTO v_total_qty
  FROM imp_cartons WHERE po_id = v_po AND status IN ('ordered','at_china_warehouse','in_transit');
  IF v_total_qty <= 0 THEN RAISE EXCEPTION 'no eligible cartons to receive'; END IF;

  -- iterate, allocate proportionally
  FOR v_carton IN
    SELECT id, expected_quantity FROM imp_cartons
    WHERE po_id = v_po AND status IN ('ordered','at_china_warehouse','in_transit')
    ORDER BY carton_number
  LOOP
    DECLARE
      v_share numeric := round(v_ship_total * v_carton.expected_quantity::numeric / v_total_qty, 2);
    BEGIN
      v_allocated := v_allocated + v_share;
      v_last_id := v_carton.id;
      UPDATE imp_cartons SET
        shipping_charge_bdt = v_share,
        status = 'arrived_bd',
        received_at = now(),
        total_landed_bdt = supplier_cost_bdt + v_share + local_courier_bdt
      WHERE id = v_carton.id;
    END;
  END LOOP;

  -- absorb rounding diff into last carton
  IF v_last_id IS NOT NULL AND round(v_allocated,4) <> round(v_ship_total,4) THEN
    UPDATE imp_cartons SET
      shipping_charge_bdt = shipping_charge_bdt + round(v_ship_total - v_allocated, 4),
      total_landed_bdt = supplier_cost_bdt + (shipping_charge_bdt + round(v_ship_total - v_allocated, 4)) + local_courier_bdt
    WHERE id = v_last_id;
  END IF;

  -- optional shipping payment
  IF v_pay IS NOT NULL AND (v_pay ? 'amount') THEN
    v_dr := public.imp_get_or_create_account(v_brand, '1310-IMP-CLR', 'Import Clearing', 'asset', 'debit');
    v_cr := COALESCE(
      (SELECT id FROM erp_chart_accounts WHERE brand_id = v_brand AND code = (SELECT account_number FROM erp_accounts WHERE id = (v_pay->>'wallet_id')::uuid) LIMIT 1),
      public.imp_get_or_create_account(v_brand, '1100-WALLET', 'Wallet/Bank', 'asset', 'debit')
    );
    v_payment_id := public._imp_record_payment(
      v_brand, v_po, NULL, 'shipping',
      (v_pay->>'amount')::numeric, (v_pay->>'wallet_id')::uuid,
      COALESCE((v_pay->>'payment_date')::date, CURRENT_DATE),
      v_pay->>'reference', v_pay->>'notes', v_pay->>'idempotency_key',
      v_user, v_dr, v_cr
    );
  END IF;

  PERFORM public._imp_refresh_po_totals(v_po);
  PERFORM public._imp_refresh_po_status(v_po);
  PERFORM public._imp_log(v_brand, 'po', v_po, NULL, 'arrived_bd', 'arrived_bd', 'idem:' || v_idem, v_user, NULL,
    jsonb_build_object('weight_kg', v_w, 'rate', v_rate, 'shipping_total', v_ship_total));

  RETURN jsonb_build_object('shipping_total', v_ship_total, 'payment_id', v_payment_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.imp_mark_arrived(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.imp_mark_arrived(jsonb) TO authenticated, service_role;

-- =====================================================================
-- RPC 4: release carton
-- payload: { carton_id, payment?: {...}, release_without_payment?: bool, notes?, idempotency_key }
-- =====================================================================
CREATE OR REPLACE FUNCTION public.imp_release_carton(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_carton uuid := (_payload->>'carton_id')::uuid;
  v_idem text := _payload->>'idempotency_key';
  v_pay jsonb := _payload->'payment';
  v_skip bool := COALESCE((_payload->>'release_without_payment')::bool, false);
  v_status public.imp_carton_status; v_po uuid; v_brand uuid;
  v_payment_id uuid; v_dr uuid; v_cr uuid; v_existing uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','operations','accountant','warehouse_staff') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_idem IS NULL OR length(v_idem) < 8 THEN RAISE EXCEPTION 'idempotency_key required'; END IF;

  SELECT id INTO v_existing FROM imp_status_history
    WHERE entity_type='carton' AND entity_id=v_carton AND action='released' AND notes = 'idem:' || v_idem LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('idempotent_replay', true); END IF;

  SELECT c.status, c.po_id, p.brand_id INTO v_status, v_po, v_brand
  FROM imp_cartons c JOIN imp_purchase_orders p ON p.id = c.po_id WHERE c.id = v_carton FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'carton not found'; END IF;
  IF v_status <> 'arrived_bd' THEN RAISE EXCEPTION 'carton must be arrived_bd to release (current: %)', v_status; END IF;

  IF v_pay IS NOT NULL AND (v_pay ? 'amount') THEN
    v_dr := public.imp_get_or_create_account(v_brand, '2100-SUP-AP', 'Supplier Payable', 'liability', 'credit');
    v_cr := COALESCE(
      (SELECT id FROM erp_chart_accounts WHERE brand_id = v_brand AND code = (SELECT account_number FROM erp_accounts WHERE id = (v_pay->>'wallet_id')::uuid) LIMIT 1),
      public.imp_get_or_create_account(v_brand, '1100-WALLET', 'Wallet/Bank', 'asset', 'debit')
    );
    v_payment_id := public._imp_record_payment(
      v_brand, v_po, v_carton, 'carton_release',
      (v_pay->>'amount')::numeric, (v_pay->>'wallet_id')::uuid,
      COALESCE((v_pay->>'payment_date')::date, CURRENT_DATE),
      v_pay->>'reference', v_pay->>'notes', v_pay->>'idempotency_key',
      v_user, v_dr, v_cr
    );
  ELSIF v_skip THEN
    IF NOT public._imp_has_any_role(v_user, 'admin','accountant') THEN
      RAISE EXCEPTION 'release without payment requires admin/accountant';
    END IF;
  ELSE
    RAISE EXCEPTION 'provide payment or set release_without_payment=true';
  END IF;

  UPDATE imp_cartons SET status='released', released_at=now() WHERE id = v_carton;
  PERFORM public._imp_refresh_po_totals(v_po);
  PERFORM public._imp_refresh_po_status(v_po);
  PERFORM public._imp_log(v_brand, 'carton', v_carton, 'arrived_bd', 'released', 'released', 'idem:' || v_idem, v_user, NULL, NULL);

  RETURN jsonb_build_object('payment_id', v_payment_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.imp_release_carton(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.imp_release_carton(jsonb) TO authenticated, service_role;

-- =====================================================================
-- RPC 5: post carton to inventory (QC)
-- payload: { carton_id, warehouse_id?, qc: [{carton_item_id, quantity_ok, quantity_damaged, quantity_missing}],
--            local_courier_payment?: {...}, supplier_due_payment?: {...},
--            due_override_reason?, notes?, idempotency_key }
-- =====================================================================
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
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','operations','warehouse_staff') THEN
    RAISE EXCEPTION 'not authorized to post inventory';
  END IF;
  IF v_idem IS NULL OR length(v_idem) < 8 THEN RAISE EXCEPTION 'idempotency_key required'; END IF;

  -- idempotency via stock_movements unique key
  PERFORM 1 FROM stock_movements WHERE idempotency_key = 'imp_post:' || v_idem;
  IF FOUND THEN RETURN jsonb_build_object('idempotent_replay', true); END IF;

  SELECT c.status, c.po_id, p.brand_id, c.supplier_cost_bdt, c.shipping_charge_bdt, c.local_courier_bdt
    INTO v_status, v_po, v_brand, v_sup, v_ship, v_loc
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

  -- resolve warehouse
  IF v_wh IS NULL THEN
    SELECT id INTO v_wh FROM warehouses WHERE brand_id = v_brand AND is_default = true AND is_active = true LIMIT 1;
  END IF;
  IF v_wh IS NULL THEN RAISE EXCEPTION 'no warehouse'; END IF;
  PERFORM 1 FROM warehouses WHERE id = v_wh AND brand_id = v_brand AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'warehouse not active or brand mismatch'; END IF;

  -- optional payments BEFORE inventory posting
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

  -- validate and apply QC
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
      IF (v_ok + v_dmg + v_mis) <> v_exp THEN
        RAISE EXCEPTION 'qc qty (% + % + % = %) != expected (%)', v_ok, v_dmg, v_mis, (v_ok+v_dmg+v_mis), v_exp;
      END IF;
      UPDATE imp_carton_items SET quantity_ok=v_ok, quantity_damaged=v_dmg, quantity_missing=v_mis WHERE id = v_ci_id;
      v_total_ok := v_total_ok + v_ok;
      v_total_damaged := v_total_damaged + v_dmg;
      v_total_missing := v_total_missing + v_mis;
    END;
  END LOOP;

  v_landed := round(v_sup + v_ship + v_loc, 4);
  IF v_total_ok = 0 THEN
    -- full loss: write to loss account, do not post inventory
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

  -- insert stock movements + update variant/product weighted average cost
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
      -- update variant
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

        UPDATE product_variants SET stock = COALESCE(stock,0) + v_ci.quantity_ok WHERE id = v_ci.variant_id;
      ELSE
        v_new_cost := v_unit_landed;
      END IF;

      -- update product aggregate
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

  -- journal: Dr Inventory / Cr Import Clearing (full landed)
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
                       'landed', v_landed, 'unit_landed', v_unit_landed));

  PERFORM public._imp_refresh_po_totals(v_po);
  PERFORM public._imp_refresh_po_status(v_po);

  RETURN jsonb_build_object('total_ok', v_total_ok, 'landed', v_landed, 'unit_landed', v_unit_landed, 'journal_entry_id', v_journal);
END $$;
REVOKE EXECUTE ON FUNCTION public.imp_post_to_inventory(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.imp_post_to_inventory(jsonb) TO authenticated, service_role;

-- =====================================================================
-- RPC 6: standalone payment recorder
-- payload: { brand_id, po_id, carton_id?, payment_type, amount_bdt, wallet_id, payment_date, reference, notes, idempotency_key }
-- =====================================================================
CREATE OR REPLACE FUNCTION public.imp_record_payment_rpc(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_brand uuid := (_payload->>'brand_id')::uuid;
  v_po uuid := (_payload->>'po_id')::uuid;
  v_ptype public.imp_payment_type := (_payload->>'payment_type')::public.imp_payment_type;
  v_dr uuid; v_cr uuid; v_pay uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public._imp_has_any_role(v_user, 'admin','accountant') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_dr := CASE v_ptype
    WHEN 'supplier_advance' THEN public.imp_get_or_create_account(v_brand, '1320-SUP-ADV', 'Supplier Advance', 'asset', 'debit')
    WHEN 'supplier_payment' THEN public.imp_get_or_create_account(v_brand, '2100-SUP-AP', 'Supplier Payable', 'liability', 'credit')
    WHEN 'supplier_balance' THEN public.imp_get_or_create_account(v_brand, '2100-SUP-AP', 'Supplier Payable', 'liability', 'credit')
    WHEN 'shipping'         THEN public.imp_get_or_create_account(v_brand, '1310-IMP-CLR', 'Import Clearing', 'asset', 'debit')
    WHEN 'carton_release'   THEN public.imp_get_or_create_account(v_brand, '2100-SUP-AP', 'Supplier Payable', 'liability', 'credit')
    WHEN 'local_courier'    THEN public.imp_get_or_create_account(v_brand, '1310-IMP-CLR', 'Import Clearing', 'asset', 'debit')
    ELSE public.imp_get_or_create_account(v_brand, '5210-IMP-LOC', 'Local Courier (Imports)', 'expense', 'debit')
  END;

  v_cr := COALESCE(
    (SELECT id FROM erp_chart_accounts WHERE brand_id = v_brand AND code = (SELECT account_number FROM erp_accounts WHERE id = (_payload->>'wallet_id')::uuid) LIMIT 1),
    public.imp_get_or_create_account(v_brand, '1100-WALLET', 'Wallet/Bank', 'asset', 'debit')
  );

  v_pay := public._imp_record_payment(
    v_brand, v_po, NULLIF(_payload->>'carton_id','')::uuid, v_ptype,
    (_payload->>'amount_bdt')::numeric, (_payload->>'wallet_id')::uuid,
    COALESCE((_payload->>'payment_date')::date, CURRENT_DATE),
    _payload->>'reference', _payload->>'notes', _payload->>'idempotency_key',
    v_user, v_dr, v_cr
  );

  PERFORM public._imp_refresh_po_totals(v_po);
  PERFORM public._imp_log(v_brand, 'po', v_po, NULL, NULL, 'payment_'||v_ptype::text, _payload->>'reference', v_user, NULL,
    jsonb_build_object('amount', (_payload->>'amount_bdt')::numeric, 'payment_id', v_pay));

  RETURN jsonb_build_object('payment_id', v_pay);
END $$;
REVOKE EXECUTE ON FUNCTION public.imp_record_payment_rpc(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.imp_record_payment_rpc(jsonb) TO authenticated, service_role;