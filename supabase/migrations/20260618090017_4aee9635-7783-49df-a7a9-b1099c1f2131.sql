-- Phase 7: Returns-to-stock automation
-- Add restock tracking column to prevent double-restock
ALTER TABLE public.erp_return_cases
  ADD COLUMN IF NOT EXISTS stock_restored BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_restored_at TIMESTAMPTZ;

-- Trigger function: when a sellable return is recorded, push qty back into stock (fail-soft)
CREATE OR REPLACE FUNCTION public.handle_return_restock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty INT;
BEGIN
  -- Only sellable items get restocked, and only once
  IF NEW.item_condition <> 'sellable' THEN
    RETURN NEW;
  END IF;
  IF NEW.stock_restored THEN
    RETURN NEW;
  END IF;

  v_qty := COALESCE(NEW.qty, 0)::INT;
  IF v_qty <= 0 THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.adjust_stock_v2(
      _product_id := NEW.product_id,
      _variant_id := NEW.variant_id,
      _delta := v_qty,
      _reason := 'return',
      _unit_cost := NULL,
      _source := 'return',
      _reference_type := 'erp_return_case',
      _reference_id := NEW.id,
      _idempotency_key := 'return_restock:' || NEW.id::text
    );

    -- Mark as restored
    UPDATE public.erp_return_cases
    SET stock_restored = true,
        stock_restored_at = now()
    WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    -- Fail-soft: log but don't block return case creation
    RAISE WARNING 'Return restock failed for case %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_return_restock ON public.erp_return_cases;
CREATE TRIGGER trg_return_restock
  AFTER INSERT ON public.erp_return_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_return_restock();

-- Also handle UPDATE when item_condition changes to sellable later
CREATE OR REPLACE FUNCTION public.handle_return_restock_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty INT;
BEGIN
  IF NEW.stock_restored THEN
    RETURN NEW;
  END IF;
  IF NEW.item_condition <> 'sellable' THEN
    RETURN NEW;
  END IF;
  -- Only act if condition transitioned to sellable, or was already sellable but qty changed
  IF OLD.item_condition = 'sellable' AND OLD.qty = NEW.qty THEN
    RETURN NEW;
  END IF;

  v_qty := COALESCE(NEW.qty, 0)::INT;
  IF v_qty <= 0 THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.adjust_stock_v2(
      _product_id := NEW.product_id,
      _variant_id := NEW.variant_id,
      _delta := v_qty,
      _reason := 'return',
      _unit_cost := NULL,
      _source := 'return',
      _reference_type := 'erp_return_case',
      _reference_id := NEW.id,
      _idempotency_key := 'return_restock:' || NEW.id::text
    );

    UPDATE public.erp_return_cases
    SET stock_restored = true,
        stock_restored_at = now()
    WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Return restock (update) failed for case %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_return_restock_update ON public.erp_return_cases;
CREATE TRIGGER trg_return_restock_update
  AFTER UPDATE OF item_condition, qty ON public.erp_return_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_return_restock_update();