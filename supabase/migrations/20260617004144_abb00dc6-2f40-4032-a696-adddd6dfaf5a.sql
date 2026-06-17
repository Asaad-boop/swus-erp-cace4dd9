
-- =======================
-- Helper role checks
-- =======================

-- Finance staff predicate
CREATE OR REPLACE FUNCTION public.is_finance_staff(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'admin'::app_role)
      OR public.has_role(_uid, 'operations'::app_role)
      OR public.has_role(_uid, 'accountant'::app_role);
$$;

-- Marketing staff predicate
CREATE OR REPLACE FUNCTION public.is_marketing_staff(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid, 'admin'::app_role)
      OR public.has_role(_uid, 'operations'::app_role)
      OR public.has_role(_uid, 'marketing_manager'::app_role);
$$;

REVOKE EXECUTE ON FUNCTION public.is_finance_staff(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_marketing_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_finance_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_marketing_staff(uuid) TO authenticated;

-- =======================
-- Finance tables
-- =======================
DROP POLICY IF EXISTS "Authenticated read entries" ON public.erp_journal_entries;
CREATE POLICY "Finance staff read entries" ON public.erp_journal_entries
  FOR SELECT TO authenticated USING (public.is_finance_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read lines" ON public.erp_journal_lines;
CREATE POLICY "Finance staff read lines" ON public.erp_journal_lines
  FOR SELECT TO authenticated USING (public.is_finance_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read COA" ON public.erp_chart_accounts;
CREATE POLICY "Finance staff read COA" ON public.erp_chart_accounts
  FOR SELECT TO authenticated USING (public.is_finance_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read att" ON public.erp_finance_attachments;
CREATE POLICY "Finance staff read attachments" ON public.erp_finance_attachments
  FOR SELECT TO authenticated USING (public.is_finance_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated read locks" ON public.erp_period_locks;
CREATE POLICY "Finance staff read locks" ON public.erp_period_locks
  FOR SELECT TO authenticated USING (public.is_finance_staff(auth.uid()));

-- =======================
-- Marketing tables
-- =======================
DROP POLICY IF EXISTS "mkt_ad_accounts_select" ON public.mkt_ad_accounts;
CREATE POLICY "mkt_ad_accounts_select" ON public.mkt_ad_accounts
  FOR SELECT TO authenticated USING (public.is_marketing_staff(auth.uid()));

DROP POLICY IF EXISTS "mkt_ads_select" ON public.mkt_ads;
CREATE POLICY "mkt_ads_select" ON public.mkt_ads
  FOR SELECT TO authenticated USING (public.is_marketing_staff(auth.uid()));

DROP POLICY IF EXISTS "mkt_adsets_select" ON public.mkt_adsets;
CREATE POLICY "mkt_adsets_select" ON public.mkt_adsets
  FOR SELECT TO authenticated USING (public.is_marketing_staff(auth.uid()));

DROP POLICY IF EXISTS "mkt_campaigns_select" ON public.mkt_campaigns;
CREATE POLICY "mkt_campaigns_select" ON public.mkt_campaigns
  FOR SELECT TO authenticated USING (public.is_marketing_staff(auth.uid()));

DROP POLICY IF EXISTS "mkt_camp_prod_select" ON public.mkt_campaign_products;
CREATE POLICY "mkt_camp_prod_select" ON public.mkt_campaign_products
  FOR SELECT TO authenticated USING (public.is_marketing_staff(auth.uid()));

DROP POLICY IF EXISTS "mkt_insights_select" ON public.mkt_insights_daily;
CREATE POLICY "mkt_insights_select" ON public.mkt_insights_daily
  FOR SELECT TO authenticated USING (public.is_marketing_staff(auth.uid()));

DROP POLICY IF EXISTS "mkt_exp_select" ON public.mkt_manual_expenses;
CREATE POLICY "mkt_exp_select" ON public.mkt_manual_expenses
  FOR SELECT TO authenticated USING (public.is_marketing_staff(auth.uid()));

DROP POLICY IF EXISTS "mkt_attr_select" ON public.mkt_order_attributions;
CREATE POLICY "mkt_attr_select" ON public.mkt_order_attributions
  FOR SELECT TO authenticated USING (public.is_marketing_staff(auth.uid()));

DROP POLICY IF EXISTS "mkt_sync_select" ON public.mkt_sync_log;
CREATE POLICY "mkt_sync_select" ON public.mkt_sync_log
  FOR SELECT TO authenticated USING (public.is_marketing_staff(auth.uid()));

DROP POLICY IF EXISTS "mkt_track_select" ON public.mkt_tracking_events;
CREATE POLICY "mkt_track_select" ON public.mkt_tracking_events
  FOR SELECT TO authenticated USING (public.is_marketing_staff(auth.uid()));

-- Tighten permissive INSERTs on tracking events (require brand_id)
DROP POLICY IF EXISTS "mkt_track_insert_anon" ON public.mkt_tracking_events;
CREATE POLICY "mkt_track_insert_anon" ON public.mkt_tracking_events
  FOR INSERT TO anon WITH CHECK (brand_id IS NOT NULL);

DROP POLICY IF EXISTS "mkt_track_insert_auth" ON public.mkt_tracking_events;
CREATE POLICY "mkt_track_insert_auth" ON public.mkt_tracking_events
  FOR INSERT TO authenticated WITH CHECK (brand_id IS NOT NULL);

-- =======================
-- Storage: brand-assets bucket (only admin/operations can write)
-- =======================
DROP POLICY IF EXISTS "brand-assets authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "brand-assets authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "brand-assets authenticated delete" ON storage.objects;

CREATE POLICY "brand-assets staff upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'operations'::app_role))
  );

CREATE POLICY "brand-assets staff update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'operations'::app_role))
  );

CREATE POLICY "brand-assets staff delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'operations'::app_role))
  );

-- =======================
-- SECURITY DEFINER function hardening
-- Revoke EXECUTE from anon on every SECURITY DEFINER function in public.
-- Revoke EXECUTE from authenticated on admin-only RPCs.
-- =======================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon', r.nspname, r.proname, r.args);
  END LOOP;
END$$;

-- Revoke from authenticated for admin/finance/marketing-only RPCs
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'hard_delete_order(uuid)',
    'create_journal_entry(uuid,date,text,jsonb,text,uuid,text)',
    'create_bill(uuid,uuid,text,date,date,numeric,uuid,uuid,text)',
    'adjust_account_balance(uuid,numeric,text)',
    'adjust_product_stock(uuid,integer,text,text)',
    'admin_rls_audit()',
    'backfill_order_profit_snapshots(uuid)',
    'erp_profit_loss(uuid,date,date)',
    'get_balance_sheet(uuid,date)',
    'get_finance_dashboard(uuid,date,date)',
    'get_general_ledger(uuid,uuid,date,date)',
    'get_pl_v2(uuid,date,date)',
    'get_trial_balance(uuid,date)',
    'get_vat_summary(uuid,date,date)',
    'get_brand_profitability_rollup(uuid,date,date,text)',
    'get_product_profitability_report(uuid,uuid,uuid,date,date,text,text[],text[])',
    'get_actual_roas_daily(uuid,date,date)',
    'get_ad_report(uuid,date,date)',
    'get_adset_report(uuid,date,date)',
    'get_campaign_report(uuid,date,date)',
    'get_courier_campaign_report(uuid,date,date)',
    'get_marketing_overview(uuid,date,date)',
    'get_product_campaign_report(uuid,date,date)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      -- skip if signature differs
      NULL;
    END;
  END LOOP;
END$$;
