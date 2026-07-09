
-- Phase 0: Race-safe attribution upsert RPC + advisory lock helper
-- Guard priority:
--   1. Existing row.source = 'manual' → reject overwrite (allow no-op)
--   2. Existing row.confidence > new confidence → reject overwrite
--   3. Otherwise → update (COALESCE-preserving auxiliary fields)
--
-- Also exposes an advisory-lock helper so the JS resolver can serialize
-- concurrent bulk + single writes on the same order_id.

CREATE OR REPLACE FUNCTION public.mkt_lock_order_attribution(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Transaction-scoped advisory lock keyed by order_id hash.
  -- Serializes concurrent resolveOne() calls on the same order.
  PERFORM pg_advisory_xact_lock(hashtext(_order_id::text));
END;
$$;

CREATE OR REPLACE FUNCTION public.mkt_upsert_order_attribution(
  _order_id     uuid,
  _brand_id     uuid,
  _campaign_id  uuid DEFAULT NULL,
  _adset_id     uuid DEFAULT NULL,
  _ad_id        uuid DEFAULT NULL,
  _source       text DEFAULT NULL,
  _confidence   numeric DEFAULT NULL,
  _utm_source   text DEFAULT NULL,
  _utm_medium   text DEFAULT NULL,
  _utm_campaign text DEFAULT NULL,
  _utm_content  text DEFAULT NULL,
  _utm_term     text DEFAULT NULL,
  _fbclid       text DEFAULT NULL,
  _note         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_source     text;
  v_existing_confidence numeric;
BEGIN
  -- Lock this order_id for the transaction to serialize concurrent writers.
  PERFORM pg_advisory_xact_lock(hashtext(_order_id::text));

  SELECT source, confidence
    INTO v_existing_source, v_existing_confidence
    FROM public.mkt_order_attributions
   WHERE order_id = _order_id
   LIMIT 1;

  -- Guard 1: manual entries are sacred (unless caller is also manual).
  IF v_existing_source = 'manual' AND COALESCE(_source, '') <> 'manual' THEN
    RETURN jsonb_build_object('written', false, 'reason', 'manual_protected');
  END IF;

  -- Guard 2: don't downgrade confidence (manual->manual and equal source updates still allowed).
  IF v_existing_source IS NOT NULL
     AND v_existing_confidence IS NOT NULL
     AND _confidence IS NOT NULL
     AND _confidence < v_existing_confidence
     AND COALESCE(_source, '') <> 'manual'
     AND v_existing_source <> _source THEN
    RETURN jsonb_build_object('written', false, 'reason', 'lower_confidence');
  END IF;

  INSERT INTO public.mkt_order_attributions (
    brand_id, order_id, campaign_id, adset_id, ad_id,
    source, confidence, note,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid
  ) VALUES (
    _brand_id, _order_id, _campaign_id, _adset_id, _ad_id,
    _source, _confidence, _note,
    _utm_source, _utm_medium, _utm_campaign, _utm_content, _utm_term, _fbclid
  )
  ON CONFLICT (order_id) DO UPDATE
    SET campaign_id  = COALESCE(EXCLUDED.campaign_id,  mkt_order_attributions.campaign_id),
        adset_id     = COALESCE(EXCLUDED.adset_id,     mkt_order_attributions.adset_id),
        ad_id        = COALESCE(EXCLUDED.ad_id,        mkt_order_attributions.ad_id),
        source       = COALESCE(EXCLUDED.source,       mkt_order_attributions.source),
        confidence   = COALESCE(EXCLUDED.confidence,   mkt_order_attributions.confidence),
        note         = COALESCE(EXCLUDED.note,         mkt_order_attributions.note),
        utm_source   = COALESCE(EXCLUDED.utm_source,   mkt_order_attributions.utm_source),
        utm_medium   = COALESCE(EXCLUDED.utm_medium,   mkt_order_attributions.utm_medium),
        utm_campaign = COALESCE(EXCLUDED.utm_campaign, mkt_order_attributions.utm_campaign),
        utm_content  = COALESCE(EXCLUDED.utm_content,  mkt_order_attributions.utm_content),
        utm_term     = COALESCE(EXCLUDED.utm_term,     mkt_order_attributions.utm_term),
        fbclid       = COALESCE(EXCLUDED.fbclid,       mkt_order_attributions.fbclid),
        updated_at   = now()
    -- Re-apply guards in the WHERE (belt & suspenders for concurrent inserts).
    WHERE mkt_order_attributions.source <> 'manual'
      AND (
        EXCLUDED.confidence IS NULL
        OR mkt_order_attributions.confidence IS NULL
        OR EXCLUDED.confidence >= mkt_order_attributions.confidence
        OR EXCLUDED.source = mkt_order_attributions.source
      );

  RETURN jsonb_build_object('written', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mkt_upsert_order_attribution(
  uuid, uuid, uuid, uuid, uuid, text, numeric, text, text, text, text, text, text, text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.mkt_lock_order_attribution(uuid)
  TO authenticated, service_role;

-- Diagnostic view: attributions where updated_at differs from created_at.
-- Not proof of manual overwrite, but a starting list for you to manually re-check.
CREATE OR REPLACE VIEW public.v_mkt_attribution_possibly_overwritten AS
SELECT a.order_id,
       a.brand_id,
       a.source,
       a.confidence,
       a.campaign_id,
       a.created_at,
       a.updated_at,
       (a.updated_at - a.created_at) AS age_delta
  FROM public.mkt_order_attributions a
 WHERE a.updated_at > a.created_at + interval '1 second'
   AND a.source <> 'manual'
 ORDER BY a.updated_at DESC;

GRANT SELECT ON public.v_mkt_attribution_possibly_overwritten TO authenticated, service_role;
