
-- ============ 1. PLATFORMS ============
CREATE TABLE public.marketing_platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.marketing_platforms TO authenticated;
GRANT ALL ON public.marketing_platforms TO service_role;
ALTER TABLE public.marketing_platforms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read platforms" ON public.marketing_platforms
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage platforms" ON public.marketing_platforms
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));

INSERT INTO public.marketing_platforms (code, name, is_active) VALUES
  ('meta','Meta (Facebook/Instagram) Ads', true),
  ('google','Google Ads', false),
  ('tiktok','TikTok Ads', false);

-- ============ 2. SETTINGS ============
CREATE TABLE public.marketing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL UNIQUE REFERENCES public.brands(id) ON DELETE CASCADE,
  default_expense_account_id uuid REFERENCES public.erp_accounts(id) ON DELETE SET NULL,
  default_expense_category_id uuid REFERENCES public.erp_expense_categories(id) ON DELETE SET NULL,
  attribution_mode text NOT NULL DEFAULT 'weighted'
    CHECK (attribution_mode IN ('weighted','equal_split','revenue_proportional')),
  auto_create_expenses boolean NOT NULL DEFAULT true,
  auto_sync_enabled boolean NOT NULL DEFAULT true,
  sync_interval_minutes integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_settings TO authenticated;
GRANT ALL ON public.marketing_settings TO service_role;
ALTER TABLE public.marketing_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read marketing settings" ON public.marketing_settings
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
    OR public.has_role(auth.uid(),'customer_service'::public.app_role)
  );
CREATE POLICY "Admin manage marketing settings" ON public.marketing_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_marketing_settings_updated BEFORE UPDATE ON public.marketing_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 3. AD ACCOUNTS ============
CREATE TABLE public.marketing_ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES public.marketing_platforms(id) ON DELETE RESTRICT,
  external_account_id text NOT NULL,
  account_name text,
  currency text,
  timezone_name text,
  token_secret_ref text,
  token_expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform_id, external_account_id)
);
CREATE INDEX idx_mkt_ad_accounts_brand ON public.marketing_ad_accounts(brand_id);
CREATE INDEX idx_mkt_ad_accounts_platform ON public.marketing_ad_accounts(platform_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_ad_accounts TO authenticated;
GRANT ALL ON public.marketing_ad_accounts TO service_role;
ALTER TABLE public.marketing_ad_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read ad accounts" ON public.marketing_ad_accounts
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
    OR public.has_role(auth.uid(),'customer_service'::public.app_role)
  );
CREATE POLICY "Admin manage ad accounts" ON public.marketing_ad_accounts
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE TRIGGER trg_mkt_ad_accounts_updated BEFORE UPDATE ON public.marketing_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 4. CAMPAIGNS ============
CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  ad_account_id uuid NOT NULL REFERENCES public.marketing_ad_accounts(id) ON DELETE CASCADE,
  external_campaign_id text NOT NULL,
  name text NOT NULL,
  objective text,
  status text,
  buying_type text,
  daily_budget numeric(14,2),
  lifetime_budget numeric(14,2),
  start_time timestamptz,
  stop_time timestamptz,
  last_insight_sync_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, external_campaign_id)
);
CREATE INDEX idx_mkt_campaigns_brand ON public.marketing_campaigns(brand_id);
CREATE INDEX idx_mkt_campaigns_account ON public.marketing_campaigns(ad_account_id);
CREATE INDEX idx_mkt_campaigns_status ON public.marketing_campaigns(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read campaigns" ON public.marketing_campaigns
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
    OR public.has_role(auth.uid(),'customer_service'::public.app_role)
  );
CREATE POLICY "Admin/ops manage campaigns" ON public.marketing_campaigns
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
  );
CREATE TRIGGER trg_mkt_campaigns_updated BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 5. ADSETS ============
CREATE TABLE public.marketing_adsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  external_adset_id text NOT NULL,
  name text,
  status text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, external_adset_id)
);
CREATE INDEX idx_mkt_adsets_campaign ON public.marketing_adsets(campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_adsets TO authenticated;
GRANT ALL ON public.marketing_adsets TO service_role;
ALTER TABLE public.marketing_adsets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read adsets" ON public.marketing_adsets
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
    OR public.has_role(auth.uid(),'customer_service'::public.app_role)
  );
CREATE POLICY "Admin/ops manage adsets" ON public.marketing_adsets
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
  );
CREATE TRIGGER trg_mkt_adsets_updated BEFORE UPDATE ON public.marketing_adsets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 6. ADS ============
CREATE TABLE public.marketing_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adset_id uuid NOT NULL REFERENCES public.marketing_adsets(id) ON DELETE CASCADE,
  external_ad_id text NOT NULL,
  name text,
  status text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (adset_id, external_ad_id)
);
CREATE INDEX idx_mkt_ads_adset ON public.marketing_ads(adset_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_ads TO authenticated;
GRANT ALL ON public.marketing_ads TO service_role;
ALTER TABLE public.marketing_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read ads" ON public.marketing_ads
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
    OR public.has_role(auth.uid(),'customer_service'::public.app_role)
  );
CREATE POLICY "Admin/ops manage ads" ON public.marketing_ads
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
  );
CREATE TRIGGER trg_mkt_ads_updated BEFORE UPDATE ON public.marketing_ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 7. CAMPAIGN INSIGHTS ============
CREATE TABLE public.marketing_campaign_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  date date NOT NULL,
  spend numeric(14,2) NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  reach bigint NOT NULL DEFAULT 0,
  ctr numeric(8,4),
  cpc numeric(14,4),
  cpm numeric(14,4),
  purchases integer NOT NULL DEFAULT 0,
  purchase_value numeric(14,2) NOT NULL DEFAULT 0,
  purchase_roas numeric(10,4),
  outbound_clicks bigint NOT NULL DEFAULT 0,
  landing_page_views bigint NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, date)
);
CREATE INDEX idx_mkt_insights_campaign_date ON public.marketing_campaign_insights(campaign_id, date DESC);
CREATE INDEX idx_mkt_insights_date ON public.marketing_campaign_insights(date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaign_insights TO authenticated;
GRANT ALL ON public.marketing_campaign_insights TO service_role;
ALTER TABLE public.marketing_campaign_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read insights" ON public.marketing_campaign_insights
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
    OR public.has_role(auth.uid(),'customer_service'::public.app_role)
  );
CREATE POLICY "Admin/ops manage insights" ON public.marketing_campaign_insights
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
  );

-- ============ 8. CAMPAIGN PRODUCTS MAPPING ============
CREATE TABLE public.marketing_campaign_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  weight numeric(6,2) NOT NULL DEFAULT 1,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, product_id)
);
CREATE INDEX idx_mkt_cp_campaign ON public.marketing_campaign_products(campaign_id);
CREATE INDEX idx_mkt_cp_product ON public.marketing_campaign_products(product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaign_products TO authenticated;
GRANT ALL ON public.marketing_campaign_products TO service_role;
ALTER TABLE public.marketing_campaign_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read campaign products" ON public.marketing_campaign_products
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
    OR public.has_role(auth.uid(),'customer_service'::public.app_role)
  );
CREATE POLICY "Admin/ops manage campaign products" ON public.marketing_campaign_products
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
  );

-- ============ 9. EXPENSE LINKS ============
CREATE TABLE public.marketing_expense_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  insight_date date NOT NULL,
  transaction_id uuid REFERENCES public.erp_transactions(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  account_id uuid REFERENCES public.erp_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, insight_date)
);
CREATE INDEX idx_mkt_expense_links_campaign ON public.marketing_expense_links(campaign_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_expense_links TO authenticated;
GRANT ALL ON public.marketing_expense_links TO service_role;
ALTER TABLE public.marketing_expense_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read expense links" ON public.marketing_expense_links
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
    OR public.has_role(auth.uid(),'customer_service'::public.app_role)
  );
CREATE POLICY "Admin/ops manage expense links" ON public.marketing_expense_links
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
  );
