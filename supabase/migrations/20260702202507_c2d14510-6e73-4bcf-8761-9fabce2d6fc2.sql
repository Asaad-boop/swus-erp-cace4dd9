
-- Auto-attribution function: matches order FB IDs / utm to synced Meta entities
CREATE OR REPLACE FUNCTION public.mkt_auto_attribute_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id uuid;
  v_adset_id    uuid;
  v_ad_id       uuid;
  v_source      text;
  v_confidence  numeric;
  v_existing    text;
BEGIN
  -- Skip if a manual attribution already exists — never overwrite user's choice
  SELECT source INTO v_existing
    FROM public.mkt_order_attributions
   WHERE order_id = NEW.id
   LIMIT 1;
  IF v_existing = 'manual' THEN
    RETURN NEW;
  END IF;

  -- 1) Match by ad external_id (highest confidence)
  IF NEW.fb_ad_id IS NOT NULL AND NEW.fb_ad_id <> '' THEN
    SELECT id, adset_id, campaign_id
      INTO v_ad_id, v_adset_id, v_campaign_id
      FROM public.mkt_ads
     WHERE external_id = NEW.fb_ad_id
       AND (NEW.brand_id IS NULL OR brand_id = NEW.brand_id)
     LIMIT 1;
    IF v_ad_id IS NOT NULL THEN
      v_source := 'auto_ad';
      v_confidence := 0.99;
    END IF;
  END IF;

  -- 2) Match by adset external_id
  IF v_campaign_id IS NULL AND NEW.fb_adset_id IS NOT NULL AND NEW.fb_adset_id <> '' THEN
    SELECT id, campaign_id
      INTO v_adset_id, v_campaign_id
      FROM public.mkt_adsets
     WHERE external_id = NEW.fb_adset_id
       AND (NEW.brand_id IS NULL OR brand_id = NEW.brand_id)
     LIMIT 1;
    IF v_adset_id IS NOT NULL THEN
      v_source := 'auto_adset';
      v_confidence := 0.9;
    END IF;
  END IF;

  -- 3) Match by campaign external_id
  IF v_campaign_id IS NULL AND NEW.fb_campaign_id IS NOT NULL AND NEW.fb_campaign_id <> '' THEN
    SELECT id INTO v_campaign_id
      FROM public.mkt_campaigns
     WHERE external_id = NEW.fb_campaign_id
       AND (NEW.brand_id IS NULL OR brand_id = NEW.brand_id)
     LIMIT 1;
    IF v_campaign_id IS NOT NULL THEN
      v_source := 'auto_campaign';
      v_confidence := 0.8;
    END IF;
  END IF;

  -- 4) Fallback: utm_campaign name match
  IF v_campaign_id IS NULL AND NEW.utm_campaign IS NOT NULL AND NEW.utm_campaign <> '' THEN
    SELECT id INTO v_campaign_id
      FROM public.mkt_campaigns
     WHERE (NEW.brand_id IS NULL OR brand_id = NEW.brand_id)
       AND (
         name ILIKE NEW.utm_campaign
         OR name ILIKE '%' || NEW.utm_campaign || '%'
         OR NEW.utm_campaign ILIKE '%' || name || '%'
       )
     ORDER BY updated_at DESC
     LIMIT 1;
    IF v_campaign_id IS NOT NULL THEN
      v_source := 'auto_utm';
      v_confidence := 0.5;
    END IF;
  END IF;

  -- Nothing matched — still record utm/fbclid so it shows up in Attribution card
  IF v_campaign_id IS NULL AND v_ad_id IS NULL THEN
    IF NEW.utm_source IS NULL AND NEW.utm_campaign IS NULL AND NEW.fbclid IS NULL THEN
      RETURN NEW;
    END IF;
    v_source := COALESCE(v_source, 'auto_unmatched');
    v_confidence := COALESCE(v_confidence, 0.1);
  END IF;

  INSERT INTO public.mkt_order_attributions (
    brand_id, order_id, campaign_id, adset_id, ad_id,
    source, confidence,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid
  ) VALUES (
    NEW.brand_id, NEW.id, v_campaign_id, v_adset_id, v_ad_id,
    v_source, v_confidence,
    NEW.utm_source, NEW.utm_medium, NEW.utm_campaign, NEW.utm_content, NEW.utm_term, NEW.fbclid
  )
  ON CONFLICT (order_id) DO UPDATE
    SET campaign_id  = COALESCE(EXCLUDED.campaign_id,  mkt_order_attributions.campaign_id),
        adset_id     = COALESCE(EXCLUDED.adset_id,     mkt_order_attributions.adset_id),
        ad_id        = COALESCE(EXCLUDED.ad_id,        mkt_order_attributions.ad_id),
        source       = EXCLUDED.source,
        confidence   = EXCLUDED.confidence,
        utm_source   = COALESCE(EXCLUDED.utm_source,   mkt_order_attributions.utm_source),
        utm_medium   = COALESCE(EXCLUDED.utm_medium,   mkt_order_attributions.utm_medium),
        utm_campaign = COALESCE(EXCLUDED.utm_campaign, mkt_order_attributions.utm_campaign),
        utm_content  = COALESCE(EXCLUDED.utm_content,  mkt_order_attributions.utm_content),
        utm_term     = COALESCE(EXCLUDED.utm_term,     mkt_order_attributions.utm_term),
        fbclid       = COALESCE(EXCLUDED.fbclid,       mkt_order_attributions.fbclid),
        updated_at   = now()
    WHERE mkt_order_attributions.source <> 'manual';

  RETURN NEW;
END;
$$;

-- Ensure order_id is unique so ON CONFLICT works
CREATE UNIQUE INDEX IF NOT EXISTS mkt_order_attributions_order_id_uniq
  ON public.mkt_order_attributions(order_id);

DROP TRIGGER IF EXISTS trg_orders_auto_attribute ON public.orders;
CREATE TRIGGER trg_orders_auto_attribute
  AFTER INSERT OR UPDATE OF fb_ad_id, fb_adset_id, fb_campaign_id, utm_campaign, utm_source, utm_medium, utm_content, utm_term, fbclid, brand_id
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.mkt_auto_attribute_order();

-- Backfill last 180 days of orders that don't have a manual attribution
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT o.*
      FROM public.orders o
      LEFT JOIN public.mkt_order_attributions a ON a.order_id = o.id
     WHERE o.created_at >= now() - interval '180 days'
       AND (a.source IS NULL OR a.source <> 'manual')
       AND (
         o.fb_ad_id IS NOT NULL OR o.fb_adset_id IS NOT NULL OR o.fb_campaign_id IS NOT NULL
         OR o.utm_campaign IS NOT NULL OR o.utm_source IS NOT NULL OR o.fbclid IS NOT NULL
       )
  LOOP
    PERFORM public.mkt_auto_attribute_order_backfill(r);
  END LOOP;
EXCEPTION WHEN undefined_function THEN
  -- Backfill inline if helper doesn't exist
  NULL;
END $$;

-- Simple inline backfill re-using the trigger logic by touching rows
UPDATE public.orders o
   SET updated_at = updated_at
 WHERE o.created_at >= now() - interval '180 days'
   AND (o.fb_ad_id IS NOT NULL OR o.fb_adset_id IS NOT NULL OR o.fb_campaign_id IS NOT NULL
        OR o.utm_campaign IS NOT NULL OR o.utm_source IS NOT NULL OR o.fbclid IS NOT NULL)
   AND NOT EXISTS (
     SELECT 1 FROM public.mkt_order_attributions a
      WHERE a.order_id = o.id AND a.source = 'manual'
   );
