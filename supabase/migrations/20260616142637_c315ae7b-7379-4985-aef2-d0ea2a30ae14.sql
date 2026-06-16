
CREATE TABLE IF NOT EXISTS public.marketing_spend_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  ad_account_id uuid REFERENCES public.marketing_ad_accounts(id) ON DELETE SET NULL,
  posting_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BDT',
  txn_id uuid REFERENCES public.erp_transactions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'posted',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, ad_account_id, posting_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_spend_postings TO authenticated;
GRANT ALL ON public.marketing_spend_postings TO service_role;

ALTER TABLE public.marketing_spend_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_spend_postings" ON public.marketing_spend_postings
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'operations'::app_role)
    OR public.has_role(auth.uid(),'accountant'::app_role)
  );

CREATE POLICY "ops_manage_spend_postings" ON public.marketing_spend_postings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role));

CREATE INDEX IF NOT EXISTS idx_spend_postings_brand_date
  ON public.marketing_spend_postings(brand_id, posting_date DESC);

CREATE TRIGGER trg_spend_postings_updated
  BEFORE UPDATE ON public.marketing_spend_postings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Core: post (or upsert) a Finance expense for a single brand+day, per ad account
CREATE OR REPLACE FUNCTION public.mkt_post_meta_spend_day(
  p_brand_id uuid,
  p_day date,
  p_force boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.marketing_cost_rules%ROWTYPE;
  v_category_id uuid;
  v_payment_account_id uuid;
  v_brand_name text;
  v_rec record;
  v_txn_id uuid;
  v_posted integer := 0;
  v_skipped integer := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_rule FROM public.marketing_cost_rules WHERE brand_id = p_brand_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_cost_rule');
  END IF;

  IF NOT p_force AND NOT COALESCE(v_rule.auto_post_meta_spend, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auto_post_disabled');
  END IF;

  v_category_id := v_rule.meta_expense_account_id;
  v_payment_account_id := v_rule.meta_payment_account_id;

  -- Fallback: pick a Meta Ads expense category for the brand by name
  IF v_category_id IS NULL THEN
    SELECT id INTO v_category_id
      FROM public.erp_expense_categories
     WHERE brand_id = p_brand_id AND kind = 'expense' AND is_active
       AND name ILIKE '%meta%'
     ORDER BY name LIMIT 1;
  END IF;

  IF v_category_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_expense_category');
  END IF;

  -- Payment account fallback: first active cash/bank account for the brand
  IF v_payment_account_id IS NULL THEN
    SELECT id INTO v_payment_account_id
      FROM public.erp_accounts
     WHERE brand_id = p_brand_id AND is_active
     ORDER BY account_type, name LIMIT 1;
  END IF;

  IF v_payment_account_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_payment_account');
  END IF;

  SELECT name INTO v_brand_name FROM public.brands WHERE id = p_brand_id;

  -- Aggregate spend per ad account from level='campaign' insights
  FOR v_rec IN
    SELECT i.ad_account_id, a.account_name, a.external_account_id, a.currency,
           SUM(COALESCE(i.spend,0)) AS spend_amount
      FROM public.marketing_insights_daily i
      LEFT JOIN public.marketing_ad_accounts a ON a.id = i.ad_account_id
     WHERE i.brand_id = p_brand_id
       AND i.date = p_day
       AND i.level = 'campaign'
     GROUP BY i.ad_account_id, a.account_name, a.external_account_id, a.currency
     HAVING SUM(COALESCE(i.spend,0)) > 0
  LOOP
    -- Find existing posting
    SELECT txn_id INTO v_txn_id
      FROM public.marketing_spend_postings
     WHERE brand_id = p_brand_id
       AND ad_account_id IS NOT DISTINCT FROM v_rec.ad_account_id
       AND posting_date = p_day;

    IF v_txn_id IS NULL THEN
      -- Create new expense txn
      INSERT INTO public.erp_transactions (
        brand_id, txn_type, category_id, account_id, amount,
        transaction_date, reference_type,
        description
      ) VALUES (
        p_brand_id, 'expense', v_category_id, v_payment_account_id, v_rec.spend_amount,
        p_day, 'meta_spend',
        COALESCE(v_rec.account_name, v_rec.external_account_id, 'Meta Ads')
          || ' — ' || to_char(p_day, 'YYYY-MM-DD')
      )
      RETURNING id INTO v_txn_id;

      INSERT INTO public.marketing_spend_postings (
        brand_id, ad_account_id, posting_date, amount, currency, txn_id, status
      ) VALUES (
        p_brand_id, v_rec.ad_account_id, p_day, v_rec.spend_amount,
        COALESCE(v_rec.currency, 'BDT'), v_txn_id, 'posted'
      );

      UPDATE public.erp_transactions
         SET reference_id = (SELECT id FROM public.marketing_spend_postings
                              WHERE brand_id = p_brand_id
                                AND ad_account_id IS NOT DISTINCT FROM v_rec.ad_account_id
                                AND posting_date = p_day)
       WHERE id = v_txn_id;

      v_posted := v_posted + 1;
      v_results := v_results || jsonb_build_object(
        'action','created','ad_account_id',v_rec.ad_account_id,
        'amount',v_rec.spend_amount,'txn_id',v_txn_id
      );
    ELSE
      -- Update if amount drifted
      UPDATE public.erp_transactions
         SET amount = v_rec.spend_amount,
             description = COALESCE(v_rec.account_name, v_rec.external_account_id, 'Meta Ads')
               || ' — ' || to_char(p_day, 'YYYY-MM-DD'),
             updated_at = now()
       WHERE id = v_txn_id;

      UPDATE public.marketing_spend_postings
         SET amount = v_rec.spend_amount, status = 'posted', updated_at = now()
       WHERE brand_id = p_brand_id
         AND ad_account_id IS NOT DISTINCT FROM v_rec.ad_account_id
         AND posting_date = p_day;

      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'action','updated','ad_account_id',v_rec.ad_account_id,
        'amount',v_rec.spend_amount,'txn_id',v_txn_id
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'brand_id', p_brand_id, 'day', p_day,
    'posted', v_posted, 'updated', v_skipped, 'items', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.mkt_post_meta_spend_day(uuid, date, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mkt_post_meta_spend_day(uuid, date, boolean) TO authenticated, service_role;

-- Window helper
CREATE OR REPLACE FUNCTION public.mkt_post_meta_spend_window(
  p_brand_id uuid, p_days integer DEFAULT 7, p_force boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date;
  total_posted integer := 0;
  total_updated integer := 0;
  out jsonb := '[]'::jsonb;
  r jsonb;
BEGIN
  FOR d IN
    SELECT generate_series((now()::date - (GREATEST(p_days,1)-1) * INTERVAL '1 day')::date,
                            now()::date, INTERVAL '1 day')::date
  LOOP
    r := public.mkt_post_meta_spend_day(p_brand_id, d, p_force);
    out := out || jsonb_build_object('day', d, 'result', r);
    IF (r->>'ok')::boolean THEN
      total_posted := total_posted + COALESCE((r->>'posted')::int, 0);
      total_updated := total_updated + COALESCE((r->>'updated')::int, 0);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'posted', total_posted, 'updated', total_updated, 'days', out);
END;
$$;

REVOKE ALL ON FUNCTION public.mkt_post_meta_spend_window(uuid, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mkt_post_meta_spend_window(uuid, integer, boolean) TO authenticated, service_role;
