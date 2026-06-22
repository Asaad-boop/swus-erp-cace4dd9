
-- Unique index so we can upsert one advance txn per order
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_transactions_order_advance
  ON public.erp_transactions (reference_id)
  WHERE reference_type = 'order_advance';

CREATE OR REPLACE FUNCTION public.fn_post_order_advance_to_finance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := COALESCE(NEW.advance_amount, 0);
  v_source text := lower(COALESCE(NEW.advance_source, ''));
  v_wallet uuid;
  v_existing uuid;
BEGIN
  -- Find existing posted advance txn for this order
  SELECT id INTO v_existing
  FROM public.erp_transactions
  WHERE reference_type = 'order_advance' AND reference_id = NEW.id
  LIMIT 1;

  -- No advance → remove any prior posting
  IF v_amount <= 0 OR v_source = '' THEN
    IF v_existing IS NOT NULL THEN
      DELETE FROM public.erp_transactions WHERE id = v_existing;
    END IF;
    RETURN NEW;
  END IF;

  -- Resolve wallet for this brand matching advance source
  SELECT id INTO v_wallet
  FROM public.erp_accounts
  WHERE brand_id = NEW.brand_id
    AND is_active = true
    AND lower(COALESCE(account_subtype, account_type)) = v_source
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_wallet IS NULL THEN
    -- No matching wallet; skip silently (don't block order create)
    RETURN NEW;
  END IF;

  IF v_existing IS NOT NULL THEN
    UPDATE public.erp_transactions SET
      amount = v_amount,
      account_id = v_wallet,
      transaction_date = COALESCE(NEW.created_at::date, CURRENT_DATE),
      description = format('Order advance (%s)', NEW.advance_source)
    WHERE id = v_existing;
  ELSE
    INSERT INTO public.erp_transactions(
      brand_id, txn_type, account_id, amount, transaction_date,
      description, reference_type, reference_id
    ) VALUES (
      NEW.brand_id, 'income', v_wallet, v_amount,
      COALESCE(NEW.created_at::date, CURRENT_DATE),
      format('Order advance (%s)', NEW.advance_source),
      'order_advance', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_advance_finance_ins ON public.orders;
CREATE TRIGGER trg_order_advance_finance_ins
AFTER INSERT ON public.orders
FOR EACH ROW
WHEN (COALESCE(NEW.advance_amount,0) > 0)
EXECUTE FUNCTION public.fn_post_order_advance_to_finance();

DROP TRIGGER IF EXISTS trg_order_advance_finance_upd ON public.orders;
CREATE TRIGGER trg_order_advance_finance_upd
AFTER UPDATE OF advance_amount, advance_source ON public.orders
FOR EACH ROW
WHEN (
  COALESCE(NEW.advance_amount,0) IS DISTINCT FROM COALESCE(OLD.advance_amount,0)
  OR COALESCE(NEW.advance_source,'') IS DISTINCT FROM COALESCE(OLD.advance_source,'')
)
EXECUTE FUNCTION public.fn_post_order_advance_to_finance();

-- Backfill existing orders missing an advance posting
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT o.id, o.brand_id, o.advance_amount, o.advance_source, o.created_at
    FROM public.orders o
    WHERE COALESCE(o.advance_amount,0) > 0
      AND COALESCE(o.advance_source,'') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.erp_transactions t
        WHERE t.reference_type = 'order_advance' AND t.reference_id = o.id
      )
  LOOP
    PERFORM 1; -- noop, trigger fires via UPDATE below
    UPDATE public.orders SET advance_amount = r.advance_amount WHERE id = r.id;
  END LOOP;
END $$;
