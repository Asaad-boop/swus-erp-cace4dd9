-- Drop dangerous legacy stock functions that collide by name / bypass logging.
-- Keep: reserve_stock(_order_id uuid, _items jsonb) — trigger-called, correct.
-- Keep: release_stock_reservation(_order_id uuid) — trigger-called, correct.
DROP FUNCTION IF EXISTS public.reserve_stock(uuid);
DROP FUNCTION IF EXISTS public.release_stock(uuid);