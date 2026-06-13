-- Per-brand invoice number generation
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_no text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_brand_invoice_no_unique
  ON public.orders(brand_id, invoice_no) WHERE invoice_no IS NOT NULL;

ALTER TABLE public.erp_settings ADD COLUMN IF NOT EXISTS invoice_seq bigint NOT NULL DEFAULT 0;
ALTER TABLE public.erp_settings ADD COLUMN IF NOT EXISTS invoice_pad integer NOT NULL DEFAULT 7;

-- Validate invoice_prefix format (English letters/underscores/digits, optional trailing hyphen)
CREATE OR REPLACE FUNCTION public.validate_invoice_prefix()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_prefix IS NOT NULL AND NEW.invoice_prefix <> '' AND
     NEW.invoice_prefix !~ '^[A-Za-z0-9_]+-?$' THEN
    RAISE EXCEPTION 'Invalid invoice slug: use English letters, digits or underscores, optional trailing hyphen';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_erp_settings_validate_prefix ON public.erp_settings;
CREATE TRIGGER trg_erp_settings_validate_prefix
  BEFORE INSERT OR UPDATE OF invoice_prefix ON public.erp_settings
  FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_prefix();

-- Atomic next-invoice generator (per brand)
CREATE OR REPLACE FUNCTION public.next_invoice_no(_brand_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefix text;
  _pad int;
  _seq bigint;
BEGIN
  INSERT INTO public.erp_settings (brand_id, invoice_prefix)
    VALUES (_brand_id, 'INV-')
    ON CONFLICT (brand_id) DO NOTHING;

  UPDATE public.erp_settings
    SET invoice_seq = COALESCE(invoice_seq, 0) + 1,
        updated_at = now()
    WHERE brand_id = _brand_id
    RETURNING COALESCE(NULLIF(invoice_prefix, ''), 'INV-'),
              COALESCE(invoice_pad, 7),
              invoice_seq
    INTO _prefix, _pad, _seq;

  RETURN _prefix || lpad(_seq::text, _pad, '0');
END;
$$;

-- Trigger to auto-assign invoice_no on order insert
CREATE OR REPLACE FUNCTION public.assign_order_invoice_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_no IS NULL AND NEW.brand_id IS NOT NULL THEN
    NEW.invoice_no := public.next_invoice_no(NEW.brand_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_orders_assign_invoice_no ON public.orders;
CREATE TRIGGER trg_orders_assign_invoice_no
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_invoice_no();

-- Backfill existing orders missing invoice_no, oldest first per brand
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id, brand_id FROM public.orders
    WHERE invoice_no IS NULL AND brand_id IS NOT NULL
    ORDER BY created_at ASC, id ASC
  LOOP
    UPDATE public.orders
      SET invoice_no = public.next_invoice_no(r.brand_id)
      WHERE id = r.id;
  END LOOP;
END $$;