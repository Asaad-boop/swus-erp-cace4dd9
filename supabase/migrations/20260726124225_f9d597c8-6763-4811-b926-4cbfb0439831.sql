-- Stop database-side Meta daily spend posting from creating finance transactions.
-- Daily Meta spend remains available through marketing insight/consumption tables only.

CREATE OR REPLACE FUNCTION public.post_meta_ad_spend_daily_system(
  _brand_id uuid,
  _from date,
  _to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days_seen int := 0;
  v_days_skipped_zero int := 0;
  v_total_bdt numeric := 0;
  r RECORD;
BEGIN
  IF _brand_id IS NULL OR _from IS NULL OR _to IS NULL THEN
    RAISE EXCEPTION 'brand_id, from, to are required';
  END IF;

  IF _to < _from THEN
    RAISE EXCEPTION 'to must be >= from';
  END IF;

  FOR r IN
    SELECT day, spend_bdt
      FROM public.get_meta_spend_bdt(_brand_id, _from, _to)
     WHERE day IS NOT NULL
  LOOP
    v_days_seen := v_days_seen + 1;

    IF COALESCE(r.spend_bdt, 0) <= 0 THEN
      v_days_skipped_zero := v_days_skipped_zero + 1;
      CONTINUE;
    END IF;

    v_total_bdt := v_total_bdt + r.spend_bdt;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'mode', 'informational_only_no_finance_posting',
    'brand_id', _brand_id,
    'from', _from,
    'to', _to,
    'days_seen', v_days_seen,
    'days_skipped_zero', v_days_skipped_zero,
    'total_bdt', v_total_bdt
  );
END;
$function$;

-- Detach linked reporting rows before deleting accounting rows.
UPDATE public.mkt_manual_expenses
   SET transaction_id = NULL,
       account_id = NULL
 WHERE source = 'meta_auto'
   AND (transaction_id IS NOT NULL OR account_id IS NOT NULL);

-- Remove all legacy Meta ad-spend accounting transactions.
-- DELETE trigger on erp_transactions restores affected account balances.
DELETE FROM public.erp_transactions
 WHERE reference_type IN ('meta_spend', 'meta_ad_spend_daily');