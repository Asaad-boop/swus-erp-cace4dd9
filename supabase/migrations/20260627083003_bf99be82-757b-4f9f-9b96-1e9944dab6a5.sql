CREATE OR REPLACE FUNCTION public.mkt_insights_validate_conversion_source()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.conversion_source IS NOT NULL
     AND NEW.conversion_source NOT IN ('fifo','fx_fallback','manual') THEN
    RAISE EXCEPTION 'conversion_source must be fifo|fx_fallback|manual';
  END IF;
  RETURN NEW;
END $$;