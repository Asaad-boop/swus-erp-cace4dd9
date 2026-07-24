UPDATE public.mkt_ad_accounts
SET auto_post_to_finance = true
WHERE brand_id = '1f1f366d-ad85-4513-85ab-2dbb6b23c513';

CREATE OR REPLACE FUNCTION public.post_meta_ad_spend_all_brands(
  _from date DEFAULT ((CURRENT_DATE - '3 days'::interval))::date,
  _to date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  b RECORD;
  results jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
  one jsonb;
  has_enabled boolean;
BEGIN
  FOR b IN
    SELECT DISTINCT brand_id
      FROM public.mkt_insights_daily
     WHERE brand_id IS NOT NULL
       AND date >= _from
       AND date <= _to
  LOOP
    -- Only post if the brand has at least one ACTIVE ad account with
    -- auto_post_to_finance = true. Fully-disabled brands are skipped.
    SELECT EXISTS (
      SELECT 1
        FROM public.mkt_ad_accounts
       WHERE brand_id = b.brand_id
         AND status = 'active'
         AND auto_post_to_finance = true
    ) INTO has_enabled;

    IF NOT has_enabled THEN
      skipped := skipped || jsonb_build_array(
        jsonb_build_object('brand_id', b.brand_id, 'reason', 'auto_post_to_finance disabled')
      );
      CONTINUE;
    END IF;

    one := public.post_meta_ad_spend_daily_system(b.brand_id, _from, _to);
    results := results || jsonb_build_array(one);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'from', _from,
    'to', _to,
    'brands', results,
    'skipped', skipped
  );
END;
$function$;