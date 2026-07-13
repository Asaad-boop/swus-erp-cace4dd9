-- Backfill the single remaining courier-driven status mismatch.
-- Fresh re-count (post trigger-fix) shows only HS-0000043 still diverges:
-- orders.status='returned' but last history to_status='paid_return'.
INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason, note, created_at)
SELECT
  o.id,
  NULL,
  o.status,
  NULL,
  'courier_sync_backfill',
  'backfill: provider=' || COALESCE(cs.provider::text,'?') || ' raw=' || COALESCE(cs.status::text,'?'),
  COALESCE(cs.updated_at, cs.created_at, now())
FROM orders o
JOIN courier_shipments cs ON cs.order_id = o.id
JOIN LATERAL (
  SELECT to_status::text AS to_status
  FROM order_status_history h
  WHERE h.order_id = o.id
  ORDER BY h.created_at DESC
  LIMIT 1
) l ON TRUE
WHERE l.to_status IS DISTINCT FROM o.status::text;