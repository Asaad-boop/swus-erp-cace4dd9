UPDATE public.orders
SET
  actual_shipping_cost = round((
    COALESCE((actual_shipping_breakdown->>'delivery')::numeric, 0)
    + COALESCE((actual_shipping_breakdown->>'discount')::numeric, 0)
    + COALESCE((actual_shipping_breakdown->>'cod')::numeric, 0)
    + COALESCE((actual_shipping_breakdown->>'additional')::numeric, 0)
    + COALESCE((actual_shipping_breakdown->>'compensation')::numeric, 0)
    - COALESCE((actual_shipping_breakdown->>'discount')::numeric, 0)
  )::numeric, 2),
  actual_shipping_breakdown = jsonb_set(
    jsonb_set(
      actual_shipping_breakdown,
      '{delivery}',
      to_jsonb(round((
        COALESCE((actual_shipping_breakdown->>'delivery')::numeric, 0)
        + COALESCE((actual_shipping_breakdown->>'discount')::numeric, 0)
      )::numeric, 2))
    ),
    '{total}',
    to_jsonb(round((
      COALESCE((actual_shipping_breakdown->>'delivery')::numeric, 0)
      + COALESCE((actual_shipping_breakdown->>'discount')::numeric, 0)
      + COALESCE((actual_shipping_breakdown->>'cod')::numeric, 0)
      + COALESCE((actual_shipping_breakdown->>'additional')::numeric, 0)
      + COALESCE((actual_shipping_breakdown->>'compensation')::numeric, 0)
      - COALESCE((actual_shipping_breakdown->>'discount')::numeric, 0)
    )::numeric, 2))
  ),
  actual_shipping_recorded_at = now()
WHERE courier_name ILIKE '%pathao%'
  AND actual_shipping_source = 'auto'
  AND actual_shipping_breakdown IS NOT NULL
  AND invoice_no IN ('HS-0000015', 'HS-0000004');