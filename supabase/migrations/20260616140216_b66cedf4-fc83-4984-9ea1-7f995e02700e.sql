
-- =========================================================================
-- PHASE 1 — Marketing Intelligence: Database Foundation
-- Safe rebuild: rename old tables → backup tokens → create new → restore
-- =========================================================================

-- ---------- 1. PERMANENT BACKUP of ad account tokens ----------
CREATE TABLE IF NOT EXISTS public.marketing_ad_accounts_legacy_backup AS
SELECT
  id,
  brand_id,
  platform_id,
  external_account_id,
  account_name,
  currency,
  timezone_name,
  token_secret_ref,
  token_expires_at,
  is_active,
  last_synced_at,
  metadata,
  created_by,
  created_at,
  updated_at,
  now() AS backed_up_at
FROM public.marketing_ad_accounts;

GRANT SELECT ON public.marketing_ad_accounts_legacy_backup TO authenticated;
GRANT ALL ON public.marketing_ad_accounts_legacy_backup TO service_role;
ALTER TABLE public.marketing_ad_accounts_legacy_backup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin read legacy backup" ON public.marketing_ad_accounts_legacy_backup
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------- 2. RENAME old tables to *_legacy (no drops) ----------
ALTER TABLE public.marketing_ad_accounts          RENAME TO marketing_ad_accounts_legacy;
ALTER TABLE public.marketing_campaigns            RENAME TO marketing_campaigns_legacy;
ALTER TABLE public.marketing_adsets               RENAME TO marketing_adsets_legacy;
ALTER TABLE public.marketing_ads                  RENAME TO marketing_ads_legacy;
ALTER TABLE public.marketing_campaign_insights    RENAME TO marketing_campaign_insights_legacy;
ALTER TABLE public.marketing_campaign_products    RENAME TO marketing_campaign_products_legacy;
ALTER TABLE public.marketing_expense_links        RENAME TO marketing_expense_links_legacy;
ALTER TABLE public.marketing_settings             RENAME TO marketing_settings_legacy;
ALTER TABLE public.marketing_platforms            RENAME TO marketing_platforms_legacy;
ALTER TABLE public.erp_ad_product_links           RENAME TO erp_ad_product_links_legacy;

-- ---------- 3. NEW TABLE: marketing_platforms ----------
CREATE TABLE public.marketing_platforms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.marketing_platforms TO authenticated;
GRANT ALL    ON public.marketing_platforms TO service_role;
ALTER TABLE public.marketing_platforms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read platforms" ON public.marketing_platforms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage platforms" ON public.marketing_platforms FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_marketing_platforms_updated BEFORE UPDATE ON public.marketing_platforms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.marketing_platforms (code, name, is_active) VALUES
  ('meta',   'Meta Ads',   true),
  ('google', 'Google Ads', false),
  ('tiktok', 'TikTok Ads', false);

-- ---------- 4. NEW TABLE: marketing_ad_accounts ----------
CREATE TABLE public.marketing_ad_accounts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                 uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  platform_id              uuid NOT NULL REFERENCES public.marketing_platforms(id),
  external_account_id      text NOT NULL,
  account_name             text,
  currency                 text NOT NULL DEFAULT 'BDT',
  timezone_name            text,
  access_token_secret_ref  text,
  token_expires_at         timestamptz,
  is_active                boolean NOT NULL DEFAULT true,
  last_synced_at           timestamptz,
  last_sync_error          text,
  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, platform_id, external_account_id)
);
CREATE INDEX idx_mad_accounts_brand   ON public.marketing_ad_accounts(brand_id);
CREATE INDEX idx_mad_accounts_active  ON public.marketing_ad_accounts(brand_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_ad_accounts TO authenticated;
GRANT ALL ON public.marketing_ad_accounts TO service_role;
ALTER TABLE public.marketing_ad_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read ad accounts" ON public.marketing_ad_accounts FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'operations'::app_role) OR
  public.has_role(auth.uid(), 'customer_service'::app_role)
);
CREATE POLICY "Admin manage ad accounts" ON public.marketing_ad_accounts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_mad_accounts_updated BEFORE UPDATE ON public.marketing_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 5. NEW TABLE: marketing_campaigns ----------
CREATE TABLE public.marketing_campaigns (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  ad_account_id         uuid NOT NULL REFERENCES public.marketing_ad_accounts(id) ON DELETE CASCADE,
  external_campaign_id  text NOT NULL,
  name                  text NOT NULL,
  objective             text,
  status                text,
  effective_status      text,
  daily_budget          numeric NOT NULL DEFAULT 0,
  lifetime_budget       numeric NOT NULL DEFAULT 0,
  start_time            timestamptz,
  stop_time             timestamptz,
  raw_json              jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, external_campaign_id)
);
CREATE INDEX idx_mc_brand    ON public.marketing_campaigns(brand_id);
CREATE INDEX idx_mc_ext      ON public.marketing_campaigns(external_campaign_id);
CREATE INDEX idx_mc_status   ON public.marketing_campaigns(brand_id, effective_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read campaigns" ON public.marketing_campaigns FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'operations'::app_role) OR
  public.has_role(auth.uid(), 'customer_service'::app_role)
);
CREATE POLICY "Admin manage campaigns" ON public.marketing_campaigns FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_mc_updated BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 6. NEW TABLE: marketing_adsets ----------
CREATE TABLE public.marketing_adsets (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id               uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  ad_account_id          uuid NOT NULL REFERENCES public.marketing_ad_accounts(id) ON DELETE CASCADE,
  campaign_id            uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  external_adset_id      text NOT NULL,
  external_campaign_id   text,
  name                   text NOT NULL,
  status                 text,
  effective_status       text,
  optimization_goal      text,
  billing_event          text,
  bid_strategy           text,
  daily_budget           numeric NOT NULL DEFAULT 0,
  lifetime_budget        numeric NOT NULL DEFAULT 0,
  targeting_raw          jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_json               jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at         timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, external_adset_id)
);
CREATE INDEX idx_mas_brand    ON public.marketing_adsets(brand_id);
CREATE INDEX idx_mas_campaign ON public.marketing_adsets(campaign_id);
CREATE INDEX idx_mas_ext      ON public.marketing_adsets(external_adset_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_adsets TO authenticated;
GRANT ALL ON public.marketing_adsets TO service_role;
ALTER TABLE public.marketing_adsets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read adsets" ON public.marketing_adsets FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'operations'::app_role) OR
  public.has_role(auth.uid(), 'customer_service'::app_role)
);
CREATE POLICY "Admin manage adsets" ON public.marketing_adsets FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_mas_updated BEFORE UPDATE ON public.marketing_adsets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 7. NEW TABLE: marketing_ads ----------
CREATE TABLE public.marketing_ads (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id               uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  ad_account_id          uuid NOT NULL REFERENCES public.marketing_ad_accounts(id) ON DELETE CASCADE,
  campaign_id            uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  adset_id               uuid REFERENCES public.marketing_adsets(id) ON DELETE SET NULL,
  external_ad_id         text NOT NULL,
  external_campaign_id   text,
  external_adset_id      text,
  name                   text NOT NULL,
  status                 text,
  effective_status       text,
  creative_id            text,
  creative_name          text,
  preview_url            text,
  thumbnail_url          text,
  raw_json               jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at         timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, external_ad_id)
);
CREATE INDEX idx_mads_brand    ON public.marketing_ads(brand_id);
CREATE INDEX idx_mads_campaign ON public.marketing_ads(campaign_id);
CREATE INDEX idx_mads_adset    ON public.marketing_ads(adset_id);
CREATE INDEX idx_mads_ext      ON public.marketing_ads(external_ad_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_ads TO authenticated;
GRANT ALL ON public.marketing_ads TO service_role;
ALTER TABLE public.marketing_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read ads" ON public.marketing_ads FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'operations'::app_role) OR
  public.has_role(auth.uid(), 'customer_service'::app_role)
);
CREATE POLICY "Admin manage ads" ON public.marketing_ads FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_mads_updated BEFORE UPDATE ON public.marketing_ads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 8. NEW TABLE: marketing_insights_daily ----------
CREATE TABLE public.marketing_insights_daily (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  ad_account_id           uuid NOT NULL REFERENCES public.marketing_ad_accounts(id) ON DELETE CASCADE,
  date                    date NOT NULL,
  level                   text NOT NULL CHECK (level IN ('campaign','adset','ad')),
  campaign_id             uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  adset_id                uuid REFERENCES public.marketing_adsets(id) ON DELETE SET NULL,
  ad_id                   uuid REFERENCES public.marketing_ads(id) ON DELETE SET NULL,
  external_campaign_id    text,
  external_adset_id       text,
  external_ad_id          text,
  spend                   numeric NOT NULL DEFAULT 0,
  impressions             integer NOT NULL DEFAULT 0,
  reach                   integer NOT NULL DEFAULT 0,
  clicks                  integer NOT NULL DEFAULT 0,
  link_clicks             integer NOT NULL DEFAULT 0,
  landing_page_views      integer NOT NULL DEFAULT 0,
  ctr                     numeric NOT NULL DEFAULT 0,
  cpc                     numeric NOT NULL DEFAULT 0,
  cpm                     numeric NOT NULL DEFAULT 0,
  meta_purchases          integer NOT NULL DEFAULT 0,
  meta_purchase_value     numeric NOT NULL DEFAULT 0,
  meta_roas               numeric NOT NULL DEFAULT 0,
  raw_json                jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at               timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_insights_grain ON public.marketing_insights_daily(
  ad_account_id, date, level,
  COALESCE(external_campaign_id,''),
  COALESCE(external_adset_id,''),
  COALESCE(external_ad_id,'')
);
CREATE INDEX idx_insights_brand_date ON public.marketing_insights_daily(brand_id, date);
CREATE INDEX idx_insights_campaign   ON public.marketing_insights_daily(campaign_id, date);
CREATE INDEX idx_insights_adset      ON public.marketing_insights_daily(adset_id, date);
CREATE INDEX idx_insights_ad         ON public.marketing_insights_daily(ad_id, date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_insights_daily TO authenticated;
GRANT ALL ON public.marketing_insights_daily TO service_role;
ALTER TABLE public.marketing_insights_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read insights" ON public.marketing_insights_daily FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'operations'::app_role) OR
  public.has_role(auth.uid(), 'customer_service'::app_role)
);
CREATE POLICY "Admin manage insights" ON public.marketing_insights_daily FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_insights_updated BEFORE UPDATE ON public.marketing_insights_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 9. NEW TABLE: marketing_sessions ----------
CREATE TABLE public.marketing_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  session_id           text NOT NULL,
  customer_id          uuid,
  mobile_normalized    text,
  utm_source           text,
  utm_medium           text,
  utm_campaign         text,
  utm_id               text,
  utm_content          text,
  utm_term             text,
  meta_campaign_id     text,
  meta_adset_id        text,
  meta_ad_id           text,
  meta_campaign_name   text,
  meta_adset_name      text,
  meta_ad_name         text,
  meta_placement       text,
  fbclid               text,
  fbc                  text,
  fbp                  text,
  landing_page         text,
  referrer             text,
  device_type          text,
  ip_hash              text,
  user_agent_hash      text,
  first_seen_at        timestamptz NOT NULL DEFAULT now(),
  last_seen_at         timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_msessions_brand    ON public.marketing_sessions(brand_id);
CREATE INDEX idx_msessions_sid      ON public.marketing_sessions(session_id);
CREATE INDEX idx_msessions_mobile   ON public.marketing_sessions(mobile_normalized);
CREATE INDEX idx_msessions_meta_c   ON public.marketing_sessions(meta_campaign_id);
CREATE INDEX idx_msessions_meta_as  ON public.marketing_sessions(meta_adset_id);
CREATE INDEX idx_msessions_meta_a   ON public.marketing_sessions(meta_ad_id);
CREATE INDEX idx_msessions_fbclid   ON public.marketing_sessions(fbclid);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_sessions TO authenticated;
GRANT INSERT, UPDATE ON public.marketing_sessions TO anon; -- public site can record sessions
GRANT ALL ON public.marketing_sessions TO service_role;
ALTER TABLE public.marketing_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read sessions" ON public.marketing_sessions FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'operations'::app_role) OR
  public.has_role(auth.uid(), 'customer_service'::app_role)
);
CREATE POLICY "Anyone write sessions" ON public.marketing_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone update own session" ON public.marketing_sessions FOR UPDATE USING (true);
CREATE POLICY "Admin manage sessions" ON public.marketing_sessions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_msessions_updated BEFORE UPDATE ON public.marketing_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 10. NEW TABLE: marketing_events ----------
CREATE TABLE public.marketing_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  session_id          text,
  event_id            text UNIQUE,
  event_name          text NOT NULL,
  customer_id         uuid,
  mobile_normalized   text,
  product_id          uuid,
  variant_id          uuid,
  order_id            uuid,
  value               numeric NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'BDT',
  source              text NOT NULL DEFAULT 'browser' CHECK (source IN ('browser','server','manual')),
  event_time          timestamptz NOT NULL DEFAULT now(),
  raw_json            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mevents_brand   ON public.marketing_events(brand_id);
CREATE INDEX idx_mevents_session ON public.marketing_events(session_id);
CREATE INDEX idx_mevents_name    ON public.marketing_events(event_name);
CREATE INDEX idx_mevents_order   ON public.marketing_events(order_id);
CREATE INDEX idx_mevents_mobile  ON public.marketing_events(mobile_normalized);
GRANT SELECT, INSERT ON public.marketing_events TO authenticated;
GRANT INSERT ON public.marketing_events TO anon;
GRANT ALL ON public.marketing_events TO service_role;
ALTER TABLE public.marketing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read events" ON public.marketing_events FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'operations'::app_role) OR
  public.has_role(auth.uid(), 'customer_service'::app_role)
);
CREATE POLICY "Anyone write events" ON public.marketing_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin manage events" ON public.marketing_events FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------- 11. NEW TABLE: marketing_order_attributions ----------
CREATE TABLE public.marketing_order_attributions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                 uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  order_id                 uuid NOT NULL,
  customer_id              uuid,
  mobile_normalized        text,
  platform                 text NOT NULL DEFAULT 'meta',
  source                   text,
  medium                   text,
  campaign_id              uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  adset_id                 uuid REFERENCES public.marketing_adsets(id) ON DELETE SET NULL,
  ad_id                    uuid REFERENCES public.marketing_ads(id) ON DELETE SET NULL,
  external_campaign_id     text,
  external_adset_id        text,
  external_ad_id           text,
  campaign_name_snapshot   text,
  adset_name_snapshot      text,
  ad_name_snapshot         text,
  placement                text,
  session_id               text,
  fbclid                   text,
  fbc                      text,
  fbp                      text,
  landing_page             text,
  attribution_type         text NOT NULL DEFAULT 'unknown'
    CHECK (attribution_type IN ('exact_utm','session_match','customer_match','manual','unknown')),
  attribution_model        text NOT NULL DEFAULT 'last_click'
    CHECK (attribution_model IN ('last_click','first_click','linear')),
  confidence_score         integer NOT NULL DEFAULT 0,
  click_time               timestamptz,
  order_time               timestamptz,
  is_primary               boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_attribution_primary
  ON public.marketing_order_attributions(order_id) WHERE is_primary;
CREATE INDEX idx_attr_brand        ON public.marketing_order_attributions(brand_id);
CREATE INDEX idx_attr_order        ON public.marketing_order_attributions(order_id);
CREATE INDEX idx_attr_ext_campaign ON public.marketing_order_attributions(external_campaign_id);
CREATE INDEX idx_attr_ext_adset    ON public.marketing_order_attributions(external_adset_id);
CREATE INDEX idx_attr_ext_ad       ON public.marketing_order_attributions(external_ad_id);
CREATE INDEX idx_attr_type         ON public.marketing_order_attributions(attribution_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_order_attributions TO authenticated;
GRANT ALL ON public.marketing_order_attributions TO service_role;
ALTER TABLE public.marketing_order_attributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read attributions" ON public.marketing_order_attributions FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'operations'::app_role) OR
  public.has_role(auth.uid(), 'customer_service'::app_role)
);
CREATE POLICY "Staff manage attributions" ON public.marketing_order_attributions FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'operations'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'operations'::app_role)
  );
CREATE TRIGGER trg_attr_updated BEFORE UPDATE ON public.marketing_order_attributions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 12. NEW TABLE: marketing_order_profit_snapshots ----------
CREATE TABLE public.marketing_order_profit_snapshots (
  id                                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                            uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  order_id                            uuid NOT NULL UNIQUE,
  attribution_id                      uuid REFERENCES public.marketing_order_attributions(id) ON DELETE SET NULL,
  campaign_id                         uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  adset_id                            uuid REFERENCES public.marketing_adsets(id) ON DELETE SET NULL,
  ad_id                               uuid REFERENCES public.marketing_ads(id) ON DELETE SET NULL,
  external_campaign_id                text,
  external_adset_id                   text,
  external_ad_id                      text,
  gross_sales                         numeric NOT NULL DEFAULT 0,
  discount_amount                     numeric NOT NULL DEFAULT 0,
  delivery_charge_collected           numeric NOT NULL DEFAULT 0,
  net_sales                           numeric NOT NULL DEFAULT 0,
  collected_amount                    numeric NOT NULL DEFAULT 0,
  product_cost                        numeric NOT NULL DEFAULT 0,
  courier_cost                        numeric NOT NULL DEFAULT 0,
  packaging_cost                      numeric NOT NULL DEFAULT 0,
  cod_charge                          numeric NOT NULL DEFAULT 0,
  payment_gateway_fee                 numeric NOT NULL DEFAULT 0,
  refund_amount                       numeric NOT NULL DEFAULT 0,
  return_cost                         numeric NOT NULL DEFAULT 0,
  allocated_ad_spend                  numeric NOT NULL DEFAULT 0,
  gross_profit                        numeric NOT NULL DEFAULT 0,
  contribution_profit_before_ads      numeric NOT NULL DEFAULT 0,
  net_profit_after_ads                numeric NOT NULL DEFAULT 0,
  order_status                        text,
  payment_status                      text,
  courier_status                      text,
  is_confirmed                        boolean NOT NULL DEFAULT false,
  is_delivered                        boolean NOT NULL DEFAULT false,
  is_returned                         boolean NOT NULL DEFAULT false,
  is_refunded                         boolean NOT NULL DEFAULT false,
  is_cancelled                        boolean NOT NULL DEFAULT false,
  order_created_at                    timestamptz,
  confirmed_at                        timestamptz,
  shipped_at                          timestamptz,
  delivered_at                        timestamptz,
  returned_at                         timestamptz,
  snapshot_at                         timestamptz NOT NULL DEFAULT now(),
  created_at                          timestamptz NOT NULL DEFAULT now(),
  updated_at                          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mops_brand_date      ON public.marketing_order_profit_snapshots(brand_id, order_created_at);
CREATE INDEX idx_mops_campaign        ON public.marketing_order_profit_snapshots(campaign_id);
CREATE INDEX idx_mops_adset           ON public.marketing_order_profit_snapshots(adset_id);
CREATE INDEX idx_mops_ad              ON public.marketing_order_profit_snapshots(ad_id);
CREATE INDEX idx_mops_ext_campaign    ON public.marketing_order_profit_snapshots(external_campaign_id);
CREATE INDEX idx_mops_delivered       ON public.marketing_order_profit_snapshots(brand_id, is_delivered);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_order_profit_snapshots TO authenticated;
GRANT ALL ON public.marketing_order_profit_snapshots TO service_role;
ALTER TABLE public.marketing_order_profit_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read snapshots" ON public.marketing_order_profit_snapshots FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'operations'::app_role) OR
  public.has_role(auth.uid(), 'customer_service'::app_role)
);
CREATE POLICY "Admin manage snapshots" ON public.marketing_order_profit_snapshots FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_mops_updated BEFORE UPDATE ON public.marketing_order_profit_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 13. NEW TABLE: marketing_cost_rules ----------
CREATE TABLE public.marketing_cost_rules (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                      uuid NOT NULL UNIQUE REFERENCES public.brands(id) ON DELETE CASCADE,
  packaging_cost_default        numeric NOT NULL DEFAULT 0,
  cod_fee_type                  text NOT NULL DEFAULT 'fixed' CHECK (cod_fee_type IN ('fixed','percentage')),
  cod_fee_value                 numeric NOT NULL DEFAULT 0,
  payment_gateway_fee_type      text NOT NULL DEFAULT 'percentage' CHECK (payment_gateway_fee_type IN ('fixed','percentage')),
  payment_gateway_fee_value     numeric NOT NULL DEFAULT 0,
  return_cost_default           numeric NOT NULL DEFAULT 0,
  attribution_window_days       integer NOT NULL DEFAULT 7,
  use_first_click               boolean NOT NULL DEFAULT false,
  use_last_click                boolean NOT NULL DEFAULT true,
  auto_post_meta_spend          boolean NOT NULL DEFAULT false,
  meta_expense_account_id       uuid,
  meta_payment_account_id       uuid,
  high_return_rate_threshold    numeric NOT NULL DEFAULT 0.30,
  low_delivery_rate_threshold   numeric NOT NULL DEFAULT 0.50,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_cost_rules TO authenticated;
GRANT ALL ON public.marketing_cost_rules TO service_role;
ALTER TABLE public.marketing_cost_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read cost rules" ON public.marketing_cost_rules FOR SELECT USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'operations'::app_role) OR
  public.has_role(auth.uid(), 'customer_service'::app_role)
);
CREATE POLICY "Admin manage cost rules" ON public.marketing_cost_rules FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_mcr_updated BEFORE UPDATE ON public.marketing_cost_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 14. RESTORE ad account data from backup ----------
INSERT INTO public.marketing_ad_accounts (
  id, brand_id, platform_id, external_account_id, account_name,
  currency, timezone_name, access_token_secret_ref, token_expires_at,
  is_active, last_synced_at, metadata, created_by, created_at, updated_at
)
SELECT
  b.id,
  b.brand_id,
  (SELECT id FROM public.marketing_platforms WHERE code='meta'),
  b.external_account_id,
  b.account_name,
  COALESCE(b.currency, 'BDT'),
  b.timezone_name,
  b.token_secret_ref,
  b.token_expires_at,
  COALESCE(b.is_active, true),
  b.last_synced_at,
  COALESCE(b.metadata, '{}'::jsonb),
  b.created_by,
  b.created_at,
  b.updated_at
FROM public.marketing_ad_accounts_legacy_backup b
ON CONFLICT (brand_id, platform_id, external_account_id) DO NOTHING;
