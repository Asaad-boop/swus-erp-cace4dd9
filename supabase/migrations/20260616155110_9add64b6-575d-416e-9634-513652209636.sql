
-- =========================================================
-- Marketing Intelligence Module — Phase 1
-- =========================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.mkt_account_status AS ENUM ('active','paused','error','disconnected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.mkt_attribution_source AS ENUM ('utm','pixel','manual','product_link','phone_match');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.mkt_expense_category AS ENUM ('influencer','content','photoshoot','agency','boost','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.mkt_sync_kind AS ENUM ('structure','insights','attribution','finance_post');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.mkt_sync_status AS ENUM ('running','success','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- helper trigger fn (reuse if exists)
CREATE OR REPLACE FUNCTION public.mkt_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- =========================================================
-- 1) mkt_ad_accounts
-- =========================================================
CREATE TABLE public.mkt_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  external_id text NOT NULL, -- 'act_xxx'
  name text NOT NULL,
  currency text,
  timezone text,
  status public.mkt_account_status NOT NULL DEFAULT 'active',
  access_token text, -- optional per-account override; falls back to META_SYSTEM_USER_TOKEN
  business_id text,
  last_structure_sync_at timestamptz,
  last_insights_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_ad_accounts TO authenticated;
GRANT ALL ON public.mkt_ad_accounts TO service_role;
ALTER TABLE public.mkt_ad_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_ad_accounts_select" ON public.mkt_ad_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt_ad_accounts_mod" ON public.mkt_ad_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role));
CREATE TRIGGER trg_mkt_ad_accounts_updated BEFORE UPDATE ON public.mkt_ad_accounts FOR EACH ROW EXECUTE FUNCTION public.mkt_set_updated_at();
CREATE INDEX idx_mkt_ad_accounts_brand ON public.mkt_ad_accounts(brand_id);

-- =========================================================
-- 2) mkt_campaigns
-- =========================================================
CREATE TABLE public.mkt_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.mkt_ad_accounts(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  objective text,
  status text,
  effective_status text,
  daily_budget numeric(14,2),
  lifetime_budget numeric(14,2),
  start_time timestamptz,
  stop_time timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_campaigns TO authenticated;
GRANT ALL ON public.mkt_campaigns TO service_role;
ALTER TABLE public.mkt_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_campaigns_select" ON public.mkt_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt_campaigns_mod" ON public.mkt_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role));
CREATE TRIGGER trg_mkt_campaigns_updated BEFORE UPDATE ON public.mkt_campaigns FOR EACH ROW EXECUTE FUNCTION public.mkt_set_updated_at();
CREATE INDEX idx_mkt_campaigns_brand ON public.mkt_campaigns(brand_id);
CREATE INDEX idx_mkt_campaigns_account ON public.mkt_campaigns(account_id);

-- =========================================================
-- 3) mkt_adsets
-- =========================================================
CREATE TABLE public.mkt_adsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.mkt_ad_accounts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.mkt_campaigns(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  status text,
  effective_status text,
  daily_budget numeric(14,2),
  lifetime_budget numeric(14,2),
  targeting_summary text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_adsets TO authenticated;
GRANT ALL ON public.mkt_adsets TO service_role;
ALTER TABLE public.mkt_adsets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_adsets_select" ON public.mkt_adsets FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt_adsets_mod" ON public.mkt_adsets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role));
CREATE TRIGGER trg_mkt_adsets_updated BEFORE UPDATE ON public.mkt_adsets FOR EACH ROW EXECUTE FUNCTION public.mkt_set_updated_at();
CREATE INDEX idx_mkt_adsets_campaign ON public.mkt_adsets(campaign_id);
CREATE INDEX idx_mkt_adsets_brand ON public.mkt_adsets(brand_id);

-- =========================================================
-- 4) mkt_ads
-- =========================================================
CREATE TABLE public.mkt_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.mkt_ad_accounts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.mkt_campaigns(id) ON DELETE CASCADE,
  adset_id uuid NOT NULL REFERENCES public.mkt_adsets(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  status text,
  effective_status text,
  creative_thumbnail text,
  creative_body text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_ads TO authenticated;
GRANT ALL ON public.mkt_ads TO service_role;
ALTER TABLE public.mkt_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_ads_select" ON public.mkt_ads FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt_ads_mod" ON public.mkt_ads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role));
CREATE TRIGGER trg_mkt_ads_updated BEFORE UPDATE ON public.mkt_ads FOR EACH ROW EXECUTE FUNCTION public.mkt_set_updated_at();
CREATE INDEX idx_mkt_ads_adset ON public.mkt_ads(adset_id);
CREATE INDEX idx_mkt_ads_campaign ON public.mkt_ads(campaign_id);

-- =========================================================
-- 5) mkt_insights_daily
-- =========================================================
CREATE TABLE public.mkt_insights_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.mkt_ad_accounts(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.mkt_campaigns(id) ON DELETE CASCADE,
  adset_id uuid REFERENCES public.mkt_adsets(id) ON DELETE CASCADE,
  ad_id uuid REFERENCES public.mkt_ads(id) ON DELETE CASCADE,
  date date NOT NULL,
  spend numeric(14,2) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  reach bigint NOT NULL DEFAULT 0,
  cpm numeric(14,4),
  cpc numeric(14,4),
  ctr numeric(14,4),
  meta_purchases integer NOT NULL DEFAULT 0,
  meta_purchase_value numeric(14,2) NOT NULL DEFAULT 0,
  meta_leads integer NOT NULL DEFAULT 0,
  meta_add_to_cart integer NOT NULL DEFAULT 0,
  meta_initiate_checkout integer NOT NULL DEFAULT 0,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ad_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_insights_daily TO authenticated;
GRANT ALL ON public.mkt_insights_daily TO service_role;
ALTER TABLE public.mkt_insights_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_insights_select" ON public.mkt_insights_daily FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt_insights_mod" ON public.mkt_insights_daily FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role));
CREATE TRIGGER trg_mkt_insights_updated BEFORE UPDATE ON public.mkt_insights_daily FOR EACH ROW EXECUTE FUNCTION public.mkt_set_updated_at();
CREATE INDEX idx_mkt_insights_brand_date ON public.mkt_insights_daily(brand_id, date);
CREATE INDEX idx_mkt_insights_campaign_date ON public.mkt_insights_daily(campaign_id, date);
CREATE INDEX idx_mkt_insights_account_date ON public.mkt_insights_daily(account_id, date);

-- =========================================================
-- 6) mkt_campaign_products
-- =========================================================
CREATE TABLE public.mkt_campaign_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.mkt_campaigns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  weight numeric(6,3) NOT NULL DEFAULT 1,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_campaign_products TO authenticated;
GRANT ALL ON public.mkt_campaign_products TO service_role;
ALTER TABLE public.mkt_campaign_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_camp_prod_select" ON public.mkt_campaign_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt_camp_prod_mod" ON public.mkt_campaign_products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role));
CREATE TRIGGER trg_mkt_camp_prod_updated BEFORE UPDATE ON public.mkt_campaign_products FOR EACH ROW EXECUTE FUNCTION public.mkt_set_updated_at();
CREATE INDEX idx_mkt_camp_prod_campaign ON public.mkt_campaign_products(campaign_id);
CREATE INDEX idx_mkt_camp_prod_product ON public.mkt_campaign_products(product_id);

-- =========================================================
-- 7) mkt_order_attributions
-- =========================================================
CREATE TABLE public.mkt_order_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.mkt_campaigns(id) ON DELETE SET NULL,
  adset_id uuid REFERENCES public.mkt_adsets(id) ON DELETE SET NULL,
  ad_id uuid REFERENCES public.mkt_ads(id) ON DELETE SET NULL,
  source public.mkt_attribution_source NOT NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 0.5,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_order_attributions TO authenticated;
GRANT ALL ON public.mkt_order_attributions TO service_role;
ALTER TABLE public.mkt_order_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_attr_select" ON public.mkt_order_attributions FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt_attr_mod" ON public.mkt_order_attributions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role));
CREATE TRIGGER trg_mkt_attr_updated BEFORE UPDATE ON public.mkt_order_attributions FOR EACH ROW EXECUTE FUNCTION public.mkt_set_updated_at();
CREATE INDEX idx_mkt_attr_brand ON public.mkt_order_attributions(brand_id);
CREATE INDEX idx_mkt_attr_campaign ON public.mkt_order_attributions(campaign_id);

-- =========================================================
-- 8) mkt_manual_expenses
-- =========================================================
CREATE TABLE public.mkt_manual_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BDT',
  vendor text,
  category public.mkt_expense_category NOT NULL DEFAULT 'other',
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.mkt_campaigns(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.erp_accounts(id) ON DELETE SET NULL,
  note text,
  attachment_url text,
  transaction_id uuid REFERENCES public.erp_transactions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_manual_expenses TO authenticated;
GRANT ALL ON public.mkt_manual_expenses TO service_role;
ALTER TABLE public.mkt_manual_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_exp_select" ON public.mkt_manual_expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt_exp_mod" ON public.mkt_manual_expenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role));
CREATE TRIGGER trg_mkt_exp_updated BEFORE UPDATE ON public.mkt_manual_expenses FOR EACH ROW EXECUTE FUNCTION public.mkt_set_updated_at();
CREATE INDEX idx_mkt_exp_brand_date ON public.mkt_manual_expenses(brand_id, date);
CREATE INDEX idx_mkt_exp_product ON public.mkt_manual_expenses(product_id);
CREATE INDEX idx_mkt_exp_campaign ON public.mkt_manual_expenses(campaign_id);

-- =========================================================
-- 9) mkt_tracking_events
-- =========================================================
CREATE TABLE public.mkt_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  session_id text,
  visitor_id text,
  event_type text NOT NULL, -- page_view, add_to_cart, initiate_checkout, purchase
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  phone text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  referrer text,
  url text,
  user_agent text,
  ip_hash text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_tracking_events TO authenticated;
GRANT INSERT ON public.mkt_tracking_events TO anon; -- public pixel ingest
GRANT ALL ON public.mkt_tracking_events TO service_role;
ALTER TABLE public.mkt_tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_track_select" ON public.mkt_tracking_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt_track_insert_anon" ON public.mkt_tracking_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "mkt_track_insert_auth" ON public.mkt_tracking_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mkt_track_mod" ON public.mkt_tracking_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role));
CREATE INDEX idx_mkt_track_brand_created ON public.mkt_tracking_events(brand_id, created_at DESC);
CREATE INDEX idx_mkt_track_phone ON public.mkt_tracking_events(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_mkt_track_session ON public.mkt_tracking_events(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_mkt_track_order ON public.mkt_tracking_events(order_id) WHERE order_id IS NOT NULL;

-- =========================================================
-- 10) mkt_sync_log
-- =========================================================
CREATE TABLE public.mkt_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.mkt_ad_accounts(id) ON DELETE CASCADE,
  kind public.mkt_sync_kind NOT NULL,
  status public.mkt_sync_status NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  rows_processed integer NOT NULL DEFAULT 0,
  error text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mkt_sync_log TO authenticated;
GRANT ALL ON public.mkt_sync_log TO service_role;
ALTER TABLE public.mkt_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mkt_sync_select" ON public.mkt_sync_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "mkt_sync_mod" ON public.mkt_sync_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'operations'::app_role));
CREATE INDEX idx_mkt_sync_account_started ON public.mkt_sync_log(account_id, started_at DESC);
CREATE INDEX idx_mkt_sync_brand_started ON public.mkt_sync_log(brand_id, started_at DESC);
