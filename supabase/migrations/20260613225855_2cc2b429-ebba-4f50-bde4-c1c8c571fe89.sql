CREATE OR REPLACE FUNCTION public.reapply_invoice_prefix(_brand_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefix text;
  _pad int;
  _count int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(NULLIF(invoice_prefix,''),'INV-'), COALESCE(invoice_pad,7)
    INTO _prefix, _pad
    FROM public.erp_settings WHERE brand_id = _brand_id;

  IF _prefix IS NULL THEN
    RAISE EXCEPTION 'Settings not found for brand';
  END IF;

  -- Strip any existing prefix (everything up to and including last '-' or all leading non-digits)
  -- then re-apply new prefix, keeping the numeric sequence padded.
  UPDATE public.orders o
  SET invoice_no = _prefix || lpad(
        regexp_replace(o.invoice_no, '^.*?(\d+)$', '\1'),
        _pad, '0')
  WHERE o.brand_id = _brand_id
    AND o.invoice_no IS NOT NULL
    AND o.invoice_no ~ '\d+$'
    AND o.invoice_no NOT LIKE _prefix || '%';

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reapply_invoice_prefix(uuid) TO authenticated;