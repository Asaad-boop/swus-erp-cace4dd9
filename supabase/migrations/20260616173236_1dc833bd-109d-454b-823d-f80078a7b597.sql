WITH ranked AS (
  SELECT
    d.id,
    COALESCE((
      SELECT (a->>'value')::numeric
      FROM jsonb_array_elements(d.raw->'actions') a
      WHERE a->>'action_type' = ANY(ARRAY['omni_purchase','offsite_conversion.fb_pixel_purchase','onsite_web_purchase','purchase'])
      ORDER BY array_position(ARRAY['omni_purchase','offsite_conversion.fb_pixel_purchase','onsite_web_purchase','purchase'], a->>'action_type')
      LIMIT 1
    ), 0) AS new_purchases,
    COALESCE((
      SELECT (a->>'value')::numeric
      FROM jsonb_array_elements(d.raw->'action_values') a
      WHERE a->>'action_type' = ANY(ARRAY['omni_purchase','offsite_conversion.fb_pixel_purchase','onsite_web_purchase','purchase'])
      ORDER BY array_position(ARRAY['omni_purchase','offsite_conversion.fb_pixel_purchase','onsite_web_purchase','purchase'], a->>'action_type')
      LIMIT 1
    ), 0) AS new_value
  FROM public.mkt_insights_daily d
  WHERE d.raw IS NOT NULL
)
UPDATE public.mkt_insights_daily d
SET meta_purchases = r.new_purchases,
    meta_purchase_value = r.new_value
FROM ranked r
WHERE d.id = r.id;