-- Step 2: Marketing Sync Integration with FIFO spend consumption
-- Add columns to mkt_insights_daily for storing BDT cost from FIFO consumption.

ALTER TABLE public.mkt_insights_daily
  ADD COLUMN IF NOT EXISTS spend_bdt_fifo numeric,
  ADD COLUMN IF NOT EXISTS conversion_source text,
  ADD COLUMN IF NOT EXISTS estimated_bdt_cost boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fifo_consumption_ref text,
  ADD COLUMN IF NOT EXISTS fifo_consumed_at timestamptz;

-- Validation trigger (replaces CHECK so we stay flexible)
CREATE OR REPLACE FUNCTION public.mkt_insights_validate_conversion_source()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.conversion_source IS NOT NULL
     AND NEW.conversion_source NOT IN ('fifo','fx_fallback','manual') THEN
    RAISE EXCEPTION 'conversion_source must be fifo|fx_fallback|manual';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mkt_insights_validate_conv ON public.mkt_insights_daily;
CREATE TRIGGER trg_mkt_insights_validate_conv
BEFORE INSERT OR UPDATE ON public.mkt_insights_daily
FOR EACH ROW EXECUTE FUNCTION public.mkt_insights_validate_conversion_source();

CREATE INDEX IF NOT EXISTS idx_mkt_insights_fifo_ref
  ON public.mkt_insights_daily(fifo_consumption_ref);