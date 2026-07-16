
-- ============================================================
-- Product Combo (Bundle) System
-- ============================================================

-- 1) Mark products as combos
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_combo boolean NOT NULL DEFAULT false;

-- 2) Combo composition
CREATE TABLE IF NOT EXISTS public.product_combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  child_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  child_variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo   ON public.product_combo_items(combo_product_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_child   ON public.product_combo_items(child_product_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_variant ON public.product_combo_items(child_variant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_combo_items TO authenticated;
GRANT ALL ON public.product_combo_items TO service_role;
GRANT SELECT ON public.product_combo_items TO anon;

ALTER TABLE public.product_combo_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "combo items readable"        ON public.product_combo_items;
DROP POLICY IF EXISTS "combo items writable staff"  ON public.product_combo_items;

CREATE POLICY "combo items readable" ON public.product_combo_items
  FOR SELECT USING (true);

CREATE POLICY "combo items writable staff" ON public.product_combo_items
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_combo_items_touch ON public.product_combo_items;
CREATE TRIGGER trg_combo_items_touch
  BEFORE UPDATE ON public.product_combo_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- 3) Order item flags for combo expansion
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_combo_child boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS combo_parent_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_order_items_combo_parent ON public.order_items(combo_parent_item_id);

-- 4) Auto-expand combo children on order_item insert
CREATE OR REPLACE FUNCTION public.expand_combo_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_combo boolean;
  c RECORD;
  child_name text;
  child_image text;
BEGIN
  -- Skip if this row is itself a combo child (avoid recursion)
  IF NEW.is_combo_child THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(is_combo, false) INTO _is_combo
  FROM public.products WHERE id = NEW.product_id;

  IF NOT COALESCE(_is_combo, false) THEN
    RETURN NEW;
  END IF;

  -- Insert child rows for each combo component
  FOR c IN
    SELECT ci.child_product_id, ci.child_variant_id, ci.quantity,
           p.title AS product_title, p.image AS product_image,
           pv.color_name AS variant_label, pv.image AS variant_image
    FROM public.product_combo_items ci
    JOIN public.products p ON p.id = ci.child_product_id
    LEFT JOIN public.product_variants pv ON pv.id = ci.child_variant_id
    WHERE ci.combo_product_id = NEW.product_id
    ORDER BY ci.display_order, ci.created_at
  LOOP
    child_name  := c.product_title || CASE WHEN c.variant_label IS NOT NULL THEN ' — ' || c.variant_label ELSE '' END;
    child_image := COALESCE(c.variant_image, c.product_image);

    INSERT INTO public.order_items(
      order_id, product_id, variant_id, name, image,
      price, unit_price, quantity, line_total,
      is_combo_child, combo_parent_item_id
    ) VALUES (
      NEW.order_id, c.child_product_id, c.child_variant_id, child_name, child_image,
      0, 0, NEW.quantity * c.quantity, 0,
      true, NEW.id
    );
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_expand_combo_order_item ON public.order_items;
CREATE TRIGGER trg_expand_combo_order_item
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.expand_combo_order_item();

-- 5) Update stock reservation to skip combo parents (their children carry stock)
CREATE OR REPLACE FUNCTION public.reserve_stock(_order_id uuid, _items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r RECORD;
BEGIN
  -- Ignore the passed jsonb payload; source of truth is order_items which
  -- already contains expanded combo children.
  FOR r IN
    SELECT oi.product_id, oi.variant_id, COALESCE(oi.quantity,0) AS qty
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = _order_id
      AND COALESCE(p.is_combo, false) = false
  LOOP
    IF r.qty <= 0 THEN CONTINUE; END IF;
    IF r.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET reserved_stock = reserved_stock + r.qty, updated_at = now() WHERE id = r.variant_id;
    ELSIF r.product_id IS NOT NULL THEN
      UPDATE public.products SET reserved_stock = reserved_stock + r.qty, updated_at = now() WHERE id = r.product_id;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.release_stock_reservation(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT oi.product_id, oi.variant_id, COALESCE(oi.quantity,0) AS qty
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = _order_id
      AND COALESCE(p.is_combo, false) = false
  LOOP
    IF r.qty <= 0 THEN CONTINUE; END IF;
    IF r.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET reserved_stock = GREATEST(reserved_stock - r.qty, 0), updated_at = now()
      WHERE id = r.variant_id;
    ELSIF r.product_id IS NOT NULL THEN
      UPDATE public.products SET reserved_stock = GREATEST(reserved_stock - r.qty, 0), updated_at = now()
      WHERE id = r.product_id;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.recompute_reserved_stock(p_product_id uuid, p_variant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qty integer;
  v_is_combo boolean;
BEGIN
  IF p_variant_id IS NOT NULL THEN
    SELECT COALESCE(SUM(oi.quantity), 0)::int INTO v_qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.variant_id = p_variant_id
      AND COALESCE(p.is_combo, false) = false
      AND o.status IN ('confirmed','packaging','ready_to_pack','packed','ready_to_ship','courier_entry');
    UPDATE product_variants SET reserved_stock = v_qty WHERE id = p_variant_id;
  END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT COALESCE(is_combo, false) INTO v_is_combo FROM products WHERE id = p_product_id;
    IF COALESCE(v_is_combo, false) THEN
      -- Combo parents don't hold stock; nothing to update on products row
      RETURN;
    END IF;
    SELECT COALESCE(SUM(oi.quantity), 0)::int INTO v_qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = p_product_id
      AND oi.variant_id IS NULL
      AND o.status IN ('confirmed','packaging','ready_to_pack','packed','ready_to_ship','courier_entry');
    UPDATE products SET reserved_stock = v_qty WHERE id = p_product_id;
  END IF;
END;
$$;

-- 6) Helper view: combo cost + buildable units
CREATE OR REPLACE VIEW public.v_combo_summary AS
SELECT
  c.id AS combo_product_id,
  COUNT(ci.id) AS component_count,
  COALESCE(SUM(
    ci.quantity * COALESCE(
      NULLIF((SELECT weighted_avg_cost FROM public.product_variants WHERE id = ci.child_variant_id), 0),
      NULLIF((SELECT weighted_avg_cost FROM public.products WHERE id = ci.child_product_id), 0),
      (SELECT cost_price FROM public.products WHERE id = ci.child_product_id),
      0
    )
  ), 0)::numeric AS total_cost,
  COALESCE(MIN(
    CASE
      WHEN ci.child_variant_id IS NOT NULL THEN
        FLOOR( COALESCE((SELECT stock FROM public.product_variants WHERE id = ci.child_variant_id), 0)::numeric / NULLIF(ci.quantity,0) )
      ELSE
        FLOOR( COALESCE((SELECT stock FROM public.products WHERE id = ci.child_product_id), 0)::numeric / NULLIF(ci.quantity,0) )
    END
  ), 0)::int AS buildable_units
FROM public.products c
LEFT JOIN public.product_combo_items ci ON ci.combo_product_id = c.id
WHERE c.is_combo = true
GROUP BY c.id;

GRANT SELECT ON public.v_combo_summary TO authenticated, anon, service_role;
