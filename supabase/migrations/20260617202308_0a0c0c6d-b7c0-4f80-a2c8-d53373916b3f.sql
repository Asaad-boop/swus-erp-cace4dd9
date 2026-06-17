
-- =====================================================================
-- TIER 1 SECURITY HARDENING
-- =====================================================================

-- 1. user_brand_access mapping table
CREATE TABLE IF NOT EXISTS public.user_brand_access (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (user_id, brand_id)
);
CREATE INDEX IF NOT EXISTS idx_user_brand_access_user ON public.user_brand_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_brand_access_brand ON public.user_brand_access(brand_id);
GRANT SELECT ON public.user_brand_access TO authenticated;
GRANT ALL ON public.user_brand_access TO service_role;
ALTER TABLE public.user_brand_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own brand access" ON public.user_brand_access;
CREATE POLICY "Users read own brand access" ON public.user_brand_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins manage brand access" ON public.user_brand_access;
CREATE POLICY "Admins manage brand access" ON public.user_brand_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Safe rollout: every existing user → every brand
INSERT INTO public.user_brand_access (user_id, brand_id)
SELECT u.id, b.id FROM auth.users u CROSS JOIN public.brands b
ON CONFLICT DO NOTHING;

-- 2. Helper functions
CREATE OR REPLACE FUNCTION public.get_user_brand_ids(_user_id uuid DEFAULT auth.uid())
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(brand_id), ARRAY[]::uuid[])
  FROM public.user_brand_access WHERE user_id = _user_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_brand_ids(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_brand_access(_brand_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _brand_id IS NULL
    OR public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_brand_access
               WHERE user_id = _user_id AND brand_id = _brand_id);
$$;

-- 3. Reconciliation runs (has brand_id) and rows (brand via parent run)
DROP POLICY IF EXISTS "Authenticated can manage reconciliation runs" ON public.erp_reconciliation_runs;
DROP POLICY IF EXISTS "Authenticated can manage reconciliation rows" ON public.erp_reconciliation_rows;

CREATE POLICY "Finance staff manage reconciliation runs" ON public.erp_reconciliation_runs
  FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()) AND public.has_brand_access(brand_id))
  WITH CHECK (public.is_finance_staff(auth.uid()) AND public.has_brand_access(brand_id));

CREATE POLICY "Finance staff manage reconciliation rows" ON public.erp_reconciliation_rows
  FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.erp_reconciliation_runs r
    WHERE r.id = erp_reconciliation_rows.run_id AND public.has_brand_access(r.brand_id)
  ))
  WITH CHECK (public.is_finance_staff(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.erp_reconciliation_runs r
    WHERE r.id = erp_reconciliation_rows.run_id AND public.has_brand_access(r.brand_id)
  ));

-- 4. Finance audit insert tightened
DROP POLICY IF EXISTS audit_insert ON public.erp_finance_audit;
CREATE POLICY audit_insert ON public.erp_finance_audit
  FOR INSERT TO authenticated
  WITH CHECK (public.is_finance_staff(auth.uid()) AND public.has_brand_access(brand_id));

-- 5. Brand-scope existing finance policies
DROP POLICY IF EXISTS "Finance staff manage ar payments" ON public.erp_ar_payments;
CREATE POLICY "Finance staff manage ar payments" ON public.erp_ar_payments
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id));

DROP POLICY IF EXISTS "Finance staff manage bill payments" ON public.erp_bill_payments;
CREATE POLICY "Finance staff manage bill payments" ON public.erp_bill_payments
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id));

DROP POLICY IF EXISTS "Finance staff manage bills" ON public.erp_bills;
CREATE POLICY "Finance staff manage bills" ON public.erp_bills
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id));

DROP POLICY IF EXISTS "Finance staff manage budgets" ON public.erp_budgets;
CREATE POLICY "Finance staff manage budgets" ON public.erp_budgets
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id));

DROP POLICY IF EXISTS exchange_cases_staff_all ON public.erp_exchange_cases;
CREATE POLICY exchange_cases_staff_all ON public.erp_exchange_cases
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id));

DROP POLICY IF EXISTS fx_rates_all ON public.erp_fx_rates;
CREATE POLICY fx_rates_all ON public.erp_fx_rates
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id));

DROP POLICY IF EXISTS "Admins manage locks" ON public.erp_period_locks;
DROP POLICY IF EXISTS "Finance staff read locks" ON public.erp_period_locks;
CREATE POLICY "Admins manage locks" ON public.erp_period_locks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) AND public.has_brand_access(brand_id))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) AND public.has_brand_access(brand_id));
CREATE POLICY "Finance staff read locks" ON public.erp_period_locks
  FOR SELECT TO authenticated
  USING (public.is_finance_staff(auth.uid()) AND public.has_brand_access(brand_id));

DROP POLICY IF EXISTS product_expense_alloc_staff_all ON public.erp_product_expense_allocations;
CREATE POLICY product_expense_alloc_staff_all ON public.erp_product_expense_allocations
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id));

DROP POLICY IF EXISTS "Finance staff manage recurring rules" ON public.erp_recurring_rules;
CREATE POLICY "Finance staff manage recurring rules" ON public.erp_recurring_rules
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id));

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='erp_recurring_runs' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.erp_recurring_runs', r.policyname);
  END LOOP;
END $$;
CREATE POLICY "Finance staff view recurring runs" ON public.erp_recurring_runs
  FOR SELECT TO authenticated
  USING (public.is_finance_staff(auth.uid()) AND public.has_brand_access(brand_id));

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='erp_return_cases' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.erp_return_cases', r.policyname);
  END LOOP;
END $$;
CREATE POLICY return_cases_staff_all ON public.erp_return_cases
  FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id));

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('erp_statement_imports','erp_statement_lines','erp_tax_entries','erp_tax_rates') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;
CREATE POLICY statement_imports_staff_all ON public.erp_statement_imports
  FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()) AND public.has_brand_access(brand_id))
  WITH CHECK (public.is_finance_staff(auth.uid()) AND public.has_brand_access(brand_id));
CREATE POLICY statement_lines_staff_all ON public.erp_statement_lines
  FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()) AND public.has_brand_access(brand_id))
  WITH CHECK (public.is_finance_staff(auth.uid()) AND public.has_brand_access(brand_id));
CREATE POLICY tax_entries_staff_all ON public.erp_tax_entries
  FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()) AND public.has_brand_access(brand_id))
  WITH CHECK (public.is_finance_staff(auth.uid()) AND public.has_brand_access(brand_id));
CREATE POLICY tax_rates_staff_all ON public.erp_tax_rates
  FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()) AND public.has_brand_access(brand_id))
  WITH CHECK (public.is_finance_staff(auth.uid()) AND public.has_brand_access(brand_id));

-- Marketing tables
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND tablename IN
           ('mkt_campaigns','mkt_adsets','mkt_ads','mkt_insights_daily','mkt_campaign_products',
            'mkt_order_attributions','mkt_sync_log','mkt_manual_expenses') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;
CREATE POLICY mkt_campaigns_select ON public.mkt_campaigns FOR SELECT TO authenticated
  USING (public.is_marketing_staff(auth.uid()) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_campaigns_mod ON public.mkt_campaigns FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_adsets_select ON public.mkt_adsets FOR SELECT TO authenticated
  USING (public.is_marketing_staff(auth.uid()) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_adsets_mod ON public.mkt_adsets FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_ads_select ON public.mkt_ads FOR SELECT TO authenticated
  USING (public.is_marketing_staff(auth.uid()) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_ads_mod ON public.mkt_ads FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_insights_select ON public.mkt_insights_daily FOR SELECT TO authenticated
  USING (public.is_marketing_staff(auth.uid()) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_insights_mod ON public.mkt_insights_daily FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_campaign_products_select ON public.mkt_campaign_products FOR SELECT TO authenticated
  USING (public.is_marketing_staff(auth.uid()) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_campaign_products_mod ON public.mkt_campaign_products FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_order_attr_select ON public.mkt_order_attributions FOR SELECT TO authenticated
  USING (public.is_marketing_staff(auth.uid()) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_order_attr_mod ON public.mkt_order_attributions FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_sync_log_select ON public.mkt_sync_log FOR SELECT TO authenticated
  USING (public.is_marketing_staff(auth.uid()) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_sync_log_mod ON public.mkt_sync_log FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_manual_expenses_select ON public.mkt_manual_expenses FOR SELECT TO authenticated
  USING (public.is_marketing_staff(auth.uid()) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_manual_expenses_mod ON public.mkt_manual_expenses FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role) OR public.has_role(auth.uid(),'accountant'::app_role)) AND public.has_brand_access(brand_id));

-- 6. mkt_tracking_events: remove anon insert (no rate-limiting available)
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='mkt_tracking_events' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.mkt_tracking_events', r.policyname);
  END LOOP;
END $$;
CREATE POLICY mkt_track_insert_auth ON public.mkt_tracking_events FOR INSERT TO authenticated
  WITH CHECK (brand_id IS NOT NULL AND public.has_brand_access(brand_id));
CREATE POLICY mkt_track_select ON public.mkt_tracking_events FOR SELECT TO authenticated
  USING (public.is_marketing_staff(auth.uid()) AND public.has_brand_access(brand_id));
CREATE POLICY mkt_track_mod ON public.mkt_tracking_events FOR ALL TO authenticated
  USING ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role)) AND public.has_brand_access(brand_id));

-- 7. Credential tables: admin-only access
DROP POLICY IF EXISTS "Admin manages courier settings" ON public.erp_courier_settings;
CREATE POLICY "Admin manages courier settings" ON public.erp_courier_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) AND public.has_brand_access(brand_id))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) AND public.has_brand_access(brand_id));

DROP POLICY IF EXISTS "admins manage courier credentials" ON public.courier_credentials;
DROP POLICY IF EXISTS "ops read courier credentials" ON public.courier_credentials;
CREATE POLICY "Admins only manage courier credentials" ON public.courier_credentials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS mkt_ad_accounts_select ON public.mkt_ad_accounts;
DROP POLICY IF EXISTS mkt_ad_accounts_mod ON public.mkt_ad_accounts;
CREATE POLICY mkt_ad_accounts_admin_all ON public.mkt_ad_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) AND public.has_brand_access(brand_id))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) AND public.has_brand_access(brand_id));
