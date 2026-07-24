-- ============================================================
-- Fix 3: Return Charges accounting + paid_return mapping + 48-row backfill
-- ============================================================

-- 1) Create "Return Charges" expense categories (one per brand), idempotent.
INSERT INTO public.erp_expense_categories (brand_id, name, kind, is_active, is_cogs_category, excluded_from_pnl)
SELECT b.id, 'Return Charges', 'expense', true, false, false
FROM public.brands b
WHERE NOT EXISTS (
  SELECT 1 FROM public.erp_expense_categories c
  WHERE c.brand_id = b.id AND c.name = 'Return Charges'
);

-- 2) Extend map_courier_status_to_order to cover the 4 missing raw statuses.
CREATE OR REPLACE FUNCTION public.map_courier_status_to_order(_raw text)
RETURNS order_status
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  k text;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  k := lower(regexp_replace(trim(_raw), '[\s\-]+', '_', 'g'));
  IF k = '' THEN RETURN NULL; END IF;

  IF k IN ('delivered') THEN RETURN 'delivered'::order_status; END IF;
  IF k IN ('partial_delivery','partial_delivered') THEN RETURN 'partial_delivered'::order_status; END IF;
  IF k IN ('paid_return') THEN RETURN 'paid_return'::order_status; END IF;
  IF k IN ('unpaid_return') THEN RETURN 'unpaid_return'::order_status; END IF;
  IF k IN ('returned') THEN RETURN 'returned'::order_status; END IF;
  IF k IN ('return','returning','return_processing','pending_return','return_in_transit','return_to_pickup','return_to_merchant') THEN RETURN 'pending_return'::order_status; END IF;
  IF k IN ('exchange','exchanged') THEN RETURN 'exchange'::order_status; END IF;
  IF k IN ('cancelled','canceled','pickup_cancelled','cancelled_by_courier') THEN RETURN 'cancelled'::order_status; END IF;
  IF k IN ('hold','on_hold','delivery_hold','delivery_failed','lost','damaged') THEN RETURN 'on_hold'::order_status; END IF;
  IF k IN ('picked','pickup','picked_up','collected','at_the_sorting_hub','at_sorting_hub','in_transit','received_at_last_mile_hub','at_delivery_hub','on_the_way_to_delivery_hub','assigned_for_delivery','on_delivery','out_for_delivery','hub_received','rider_assigned','forwarded','reached','sorting_hub','last_mile_hub') THEN RETURN 'in_transit'::order_status; END IF;
  IF k IN ('pickup_requested','assigned_for_pickup','pickup_failed','pending') THEN RETURN 'ready_to_ship'::order_status; END IF;
  RETURN NULL;
END;
$function$;

-- 3) Extend fn_post_order_delivery_to_finance to handle paid_return / unpaid_return.
CREATE OR REPLACE FUNCTION public.fn_post_order_delivery_to_finance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_status text := NEW.status::text;
  v_old_status text := COALESCE(OLD.status::text, '');
  v_total numeric;
  v_shipping numeric;
  v_refund numeric;
  v_net numeric;
  v_wallet uuid;
  v_existing uuid;
  v_return_cat uuid;
  v_return_amount numeric;
BEGIN
  -- ---------- PAID_RETURN / UNPAID_RETURN branch ----------
  IF v_new_status IN ('paid_return','unpaid_return') THEN
    -- If leaving a delivered state, remove any prior delivery income row.
    IF v_old_status IN ('delivered','partial_delivered') THEN
      DELETE FROM public.erp_transactions
       WHERE reference_type = 'order_delivery' AND reference_id = NEW.id;
    END IF;

    -- Look up brand's Return Charges expense category.
    SELECT id INTO v_return_cat
      FROM public.erp_expense_categories
     WHERE brand_id = NEW.brand_id AND name = 'Return Charges' AND is_active = true
     LIMIT 1;

    IF v_return_cat IS NULL THEN
      RETURN NEW;
    END IF;

    v_return_amount := COALESCE(NEW.actual_shipping_cost, NEW.shipping_fee, 0);
    IF v_return_amount <= 0 THEN
      DELETE FROM public.erp_transactions
       WHERE reference_type = 'order_return_charge' AND reference_id = NEW.id;
      RETURN NEW;
    END IF;

    SELECT id INTO v_existing
      FROM public.erp_transactions
     WHERE reference_type = 'order_return_charge' AND reference_id = NEW.id
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.erp_transactions SET
        amount = v_return_amount,
        category_id = v_return_cat,
        transaction_date = COALESCE(NEW.delivered_at::date, CURRENT_DATE),
        description = format('Return charge (courier ৳%s)', v_return_amount)
      WHERE id = v_existing;
    ELSE
      INSERT INTO public.erp_transactions(
        brand_id, txn_type, category_id, amount, transaction_date,
        description, reference_type, reference_id
      ) VALUES (
        NEW.brand_id, 'expense', v_return_cat, v_return_amount,
        COALESCE(NEW.delivered_at::date, CURRENT_DATE),
        format('Return charge (courier ৳%s)', v_return_amount),
        'order_return_charge', NEW.id
      );
    END IF;

    RETURN NEW;
  END IF;

  -- If moving away from a return state, clean up its expense row.
  IF v_old_status IN ('paid_return','unpaid_return')
     AND v_new_status NOT IN ('paid_return','unpaid_return') THEN
    DELETE FROM public.erp_transactions
     WHERE reference_type = 'order_return_charge' AND reference_id = NEW.id;
  END IF;

  -- ---------- DELIVERED / PARTIAL_DELIVERED branch (unchanged) ----------
  IF v_new_status NOT IN ('delivered','partial_delivered') THEN
    IF v_old_status IN ('delivered','partial_delivered') THEN
      DELETE FROM public.erp_transactions
      WHERE reference_type = 'order_delivery' AND reference_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  IF v_new_status = 'partial_delivered' THEN
    v_total := COALESCE(NEW.partial_amount, NEW.total, 0);
  ELSE
    v_total := COALESCE(NEW.total, 0);
  END IF;
  v_shipping := COALESCE(NEW.actual_shipping_cost, NEW.shipping_fee, 0);
  v_refund := COALESCE(NEW.refund_amount, 0);
  v_net := v_total - v_shipping - v_refund;

  IF v_net <= 0 THEN
    DELETE FROM public.erp_transactions
    WHERE reference_type = 'order_delivery' AND reference_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT id INTO v_wallet
    FROM public.erp_accounts
   WHERE brand_id = NEW.brand_id AND name = 'COD Receivable' AND is_active = true
   LIMIT 1;

  IF v_wallet IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_existing
    FROM public.erp_transactions
   WHERE reference_type = 'order_delivery' AND reference_id = NEW.id
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.erp_transactions SET
      amount = v_net,
      account_id = v_wallet,
      transaction_date = COALESCE(NEW.delivered_at::date, CURRENT_DATE),
      description = format('COD receivable (net of courier ৳%s)', v_shipping)
    WHERE id = v_existing;
  ELSE
    INSERT INTO public.erp_transactions(
      brand_id, txn_type, account_id, amount, transaction_date,
      description, reference_type, reference_id
    ) VALUES (
      NEW.brand_id, 'income', v_wallet, v_net,
      COALESCE(NEW.delivered_at::date, CURRENT_DATE),
      format('COD receivable (net of courier ৳%s)', v_shipping),
      'order_delivery', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Backfill: 48 orders → status=paid_return + return-charge expense.
--    Single transaction, strict count/amount guards, rolls back on mismatch.
DO $$
DECLARE
  v_order_count int;
  v_expected_orders int := 48;
  v_expected_total numeric := 5184.82;
  v_status_updated int;
  v_txn_inserted int;
  v_txn_total numeric;
BEGIN
  SELECT COUNT(*) INTO v_order_count
    FROM orders o JOIN courier_shipments cs ON cs.order_id=o.id
   WHERE cs.status='paid_return';

  IF v_order_count <> v_expected_orders THEN
    RAISE EXCEPTION 'Backfill aborted: expected % candidate orders, found %', v_expected_orders, v_order_count;
  END IF;

  -- Update order status → paid_return. Trigger will auto-post the expense.
  WITH targets AS (
    SELECT o.id FROM orders o JOIN courier_shipments cs ON cs.order_id=o.id
     WHERE cs.status='paid_return'
  )
  UPDATE orders o
     SET status = 'paid_return'::order_status,
         updated_at = now()
    FROM targets t
   WHERE o.id = t.id;
  GET DIAGNOSTICS v_status_updated = ROW_COUNT;

  IF v_status_updated <> v_expected_orders THEN
    RAISE EXCEPTION 'Backfill aborted: expected % status updates, got %', v_expected_orders, v_status_updated;
  END IF;

  -- Verify the trigger inserted 48 return-charge txns with the correct total.
  SELECT COUNT(*), ROUND(COALESCE(SUM(amount),0)::numeric,2)
    INTO v_txn_inserted, v_txn_total
    FROM erp_transactions
   WHERE reference_type = 'order_return_charge'
     AND reference_id IN (
       SELECT o.id FROM orders o JOIN courier_shipments cs ON cs.order_id=o.id
        WHERE cs.status='paid_return'
     );

  IF v_txn_inserted <> v_expected_orders THEN
    RAISE EXCEPTION 'Backfill aborted: expected % return-charge txns, got %', v_expected_orders, v_txn_inserted;
  END IF;

  IF v_txn_total <> v_expected_total THEN
    RAISE EXCEPTION 'Backfill aborted: expected total ৳%, got ৳%', v_expected_total, v_txn_total;
  END IF;

  RAISE NOTICE 'Backfill OK: % orders → paid_return, % txns totalling ৳%', v_status_updated, v_txn_inserted, v_txn_total;
END $$;