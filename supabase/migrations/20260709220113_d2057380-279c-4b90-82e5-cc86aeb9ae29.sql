
-- Idempotency guard: only one meta_ad_spend_daily row per (brand, day)
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_transactions_meta_ad_spend_daily
  ON public.erp_transactions (brand_id, transaction_date)
  WHERE reference_type = 'meta_ad_spend_daily';

CREATE OR REPLACE FUNCTION public.post_meta_ad_spend_daily(
  _brand_id uuid,
  _from date,
  _to date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_category_id uuid;
  v_days_posted int := 0;
  v_days_updated int := 0;
  v_days_skipped int := 0;
  v_total_bdt numeric := 0;
  r RECORD;
  v_existing_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (
    public.has_role(v_user, 'admin'::public.app_role)
    OR public.has_role(v_user, 'accountant'::public.app_role)
    OR public.has_role(v_user, 'marketing_manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _brand_id IS NULL OR _from IS NULL OR _to IS NULL THEN
    RAISE EXCEPTION 'brand_id, from, to are required';
  END IF;
  IF _to < _from THEN RAISE EXCEPTION 'to must be >= from'; END IF;

  -- Resolve / create the per-brand "Meta Ads Expense" category (idempotent).
  SELECT id INTO v_category_id
    FROM public.erp_expense_categories
   WHERE brand_id = _brand_id
     AND kind = 'expense'
     AND lower(name) = 'meta ads expense'
     AND is_active = true
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_category_id IS NULL THEN
    INSERT INTO public.erp_expense_categories (brand_id, name, kind, is_active)
    VALUES (_brand_id, 'Meta Ads Expense', 'expense', true)
    RETURNING id INTO v_category_id;
  END IF;

  -- Iterate over daily spend from the existing RPC.
  FOR r IN
    SELECT day, spend_bdt, is_estimated
      FROM public.get_meta_spend_bdt(_brand_id, _from, _to)
     WHERE day IS NOT NULL
  LOOP
    IF COALESCE(r.spend_bdt, 0) <= 0 THEN
      v_days_skipped := v_days_skipped + 1;
      CONTINUE;
    END IF;

    SELECT id INTO v_existing_id
      FROM public.erp_transactions
     WHERE reference_type = 'meta_ad_spend_daily'
       AND brand_id = _brand_id
       AND transaction_date = r.day
     LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.erp_transactions (
        brand_id, txn_type, category_id, amount,
        reference_type, reference_id,
        description, transaction_date, created_by
      ) VALUES (
        _brand_id, 'expense', v_category_id, r.spend_bdt,
        'meta_ad_spend_daily', NULL,
        'Meta Ads daily spend' || CASE WHEN r.is_estimated THEN ' (FX est.)' ELSE ' (FIFO)' END,
        r.day, v_user
      );
      v_days_posted := v_days_posted + 1;
    ELSE
      UPDATE public.erp_transactions
         SET amount = r.spend_bdt,
             category_id = v_category_id,
             description = 'Meta Ads daily spend'
               || CASE WHEN r.is_estimated THEN ' (FX est.)' ELSE ' (FIFO)' END,
             updated_at = now()
       WHERE id = v_existing_id
         AND amount IS DISTINCT FROM r.spend_bdt;
      IF FOUND THEN
        v_days_updated := v_days_updated + 1;
      END IF;
    END IF;

    v_total_bdt := v_total_bdt + r.spend_bdt;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'brand_id', _brand_id,
    'from', _from,
    'to', _to,
    'category_id', v_category_id,
    'days_posted', v_days_posted,
    'days_updated', v_days_updated,
    'days_skipped_zero', v_days_skipped,
    'total_bdt', v_total_bdt,
    'note', CASE WHEN v_total_bdt = 0
      THEN 'FX baseline empty — 0 spend expected until dollar-purchase data exists'
      ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_meta_ad_spend_daily(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.post_meta_ad_spend_daily(uuid, date, date) TO authenticated, service_role;
