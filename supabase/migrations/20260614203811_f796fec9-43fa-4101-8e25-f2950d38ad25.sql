UPDATE public.orders
SET
  actual_shipping_cost = CASE invoice_no
    WHEN 'HS-0000015' THEN 122.19
    WHEN 'HS-0000004' THEN 108.50
    ELSE actual_shipping_cost
  END,
  actual_shipping_breakdown = CASE invoice_no
    WHEN 'HS-0000015' THEN jsonb_build_object('delivery', 120, 'cod', 12.19, 'discount', 10, 'promo_discount', 0, 'additional', 0, 'compensation', 0, 'extra', 0, 'total', 122.19)
    WHEN 'HS-0000004' THEN jsonb_build_object('delivery', 110, 'cod', 13.50, 'discount', 15, 'promo_discount', 0, 'additional', 0, 'compensation', 0, 'extra', 0, 'total', 108.50)
    ELSE actual_shipping_breakdown
  END,
  actual_shipping_recorded_at = now()
WHERE invoice_no IN ('HS-0000015', 'HS-0000004');