CREATE OR REPLACE FUNCTION public.fn_post_order_delivery_to_finance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_status text := NEW.status::text;
  v_old_status text := COALESCE(OLD.status::text, '');
  v_total numeric;
  v_shipping numeric;
  v_refund numeric;
  v_net numeric;
  v_wallet uuid;
  v_provider text;
  v_existing uuid;
BEGIN
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

  SELECT provider INTO v_provider
  FROM public.courier_shipments
  WHERE order_id = NEW.id
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  IF v_provider IS NOT NULL THEN
    SELECT wallet_id INTO v_wallet
    FROM public.erp_courier_settings
    WHERE brand_id = NEW.brand_id AND provider = v_provider;
  END IF;

  -- Fallback: first active wallet, but NEVER an Advance wallet.
  IF v_wallet IS NULL THEN
    SELECT id INTO v_wallet
    FROM public.erp_accounts
    WHERE brand_id = NEW.brand_id
      AND is_active = true
      AND name NOT ILIKE '%advance%'
      AND COALESCE(notes, '') NOT ILIKE '%advance%'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
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
      description = format('Order delivery — net of courier ৳%s', v_shipping)
    WHERE id = v_existing;
  ELSE
    INSERT INTO public.erp_transactions(
      brand_id, txn_type, account_id, amount, transaction_date,
      description, reference_type, reference_id
    ) VALUES (
      NEW.brand_id, 'income', v_wallet, v_net,
      COALESCE(NEW.delivered_at::date, CURRENT_DATE),
      format('Order delivery — net of courier ৳%s', v_shipping),
      'order_delivery', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r RECORD;
  v_cod_wallet uuid;
  v_moved numeric;
BEGIN
  FOR r IN
    SELECT a.brand_id, a.id AS advance_id, SUM(t.amount) AS moved
    FROM public.erp_transactions t
    JOIN public.erp_accounts a ON a.id = t.account_id
    WHERE t.reference_type = 'order_delivery'
      AND (a.name ILIKE '%advance%' OR COALESCE(a.notes,'') ILIKE '%advance%')
    GROUP BY a.brand_id, a.id
  LOOP
    SELECT id INTO v_cod_wallet
    FROM public.erp_accounts
    WHERE brand_id = r.brand_id AND name = 'COD Cash'
    LIMIT 1;

    IF v_cod_wallet IS NULL THEN
      INSERT INTO public.erp_accounts(
        brand_id, name, account_type, account_subtype, wallet_type,
        opening_balance, current_balance, is_active, notes
      ) VALUES (
        r.brand_id, 'COD Cash', 'cash', 'cash', 'cash',
        0, 0, true, 'Courier COD payouts (auto-created by backfill)'
      )
      RETURNING id INTO v_cod_wallet;
    END IF;

    v_moved := r.moved;

    UPDATE public.erp_transactions
    SET account_id = v_cod_wallet
    WHERE reference_type = 'order_delivery' AND account_id = r.advance_id;

    UPDATE public.erp_accounts
    SET current_balance = COALESCE(current_balance,0) - v_moved
    WHERE id = r.advance_id;

    UPDATE public.erp_accounts
    SET current_balance = COALESCE(current_balance,0) + v_moved
    WHERE id = v_cod_wallet;
  END LOOP;
END $$;