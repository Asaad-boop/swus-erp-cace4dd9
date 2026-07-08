
-- 1) Trigger function: auto-link products of an attributed order to its campaign
CREATE OR REPLACE FUNCTION public.auto_link_attribution_products()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.mkt_campaign_products (campaign_id, product_id, brand_id, weight, note)
  SELECT NEW.campaign_id, oi.product_id, NEW.brand_id, 1, 'auto:attribution'
  FROM public.order_items oi
  WHERE oi.order_id = NEW.order_id
    AND oi.product_id IS NOT NULL
  ON CONFLICT (campaign_id, product_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 2) Trigger: fire on insert OR when campaign_id changes to non-null
DROP TRIGGER IF EXISTS trg_attr_auto_link_products ON public.mkt_order_attributions;
CREATE TRIGGER trg_attr_auto_link_products
  AFTER INSERT OR UPDATE OF campaign_id
  ON public.mkt_order_attributions
  FOR EACH ROW
  WHEN (NEW.campaign_id IS NOT NULL)
  EXECUTE FUNCTION public.auto_link_attribution_products();

-- 3) Backfill: link all currently attributed orders
INSERT INTO public.mkt_campaign_products (campaign_id, product_id, brand_id, weight, note)
SELECT DISTINCT a.campaign_id, oi.product_id, a.brand_id, 1, 'auto:backfill'
FROM public.mkt_order_attributions a
JOIN public.order_items oi ON oi.order_id = a.order_id
WHERE a.campaign_id IS NOT NULL
  AND oi.product_id IS NOT NULL
ON CONFLICT (campaign_id, product_id) DO NOTHING;
