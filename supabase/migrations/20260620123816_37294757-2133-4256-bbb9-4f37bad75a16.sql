-- PHASE 0: Returns & Exchanges module — additive schema

-- 1) Extend erp_return_cases
ALTER TABLE public.erp_return_cases
  ADD COLUMN IF NOT EXISTS return_status text NOT NULL DEFAULT 'initiated',
  ADD COLUMN IF NOT EXISTS courier_tracking_id text,
  ADD COLUMN IF NOT EXISTS courier_name text,
  ADD COLUMN IF NOT EXISTS qc_condition text,
  ADD COLUMN IF NOT EXISTS qc_notes text,
  ADD COLUMN IF NOT EXISTS qc_done_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS qc_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_updated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS case_number text;

-- 2) Extend erp_exchange_cases
ALTER TABLE public.erp_exchange_cases
  ADD COLUMN IF NOT EXISTS exchange_status text NOT NULL DEFAULT 'initiated',
  ADD COLUMN IF NOT EXISTS new_order_id uuid REFERENCES public.orders(id),
  ADD COLUMN IF NOT EXISTS courier_tracking_id text,
  ADD COLUMN IF NOT EXISTS exchange_type_detail text,
  ADD COLUMN IF NOT EXISTS case_number text;

CREATE UNIQUE INDEX IF NOT EXISTS erp_return_cases_case_number_uidx
  ON public.erp_return_cases(case_number) WHERE case_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS erp_exchange_cases_case_number_uidx
  ON public.erp_exchange_cases(case_number) WHERE case_number IS NOT NULL;

-- 3) New table: erp_return_timeline
CREATE TABLE IF NOT EXISTS public.erp_return_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  case_type text NOT NULL CHECK (case_type IN ('return','exchange')),
  status text NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_return_timeline TO authenticated;
GRANT ALL ON public.erp_return_timeline TO service_role;

ALTER TABLE public.erp_return_timeline ENABLE ROW LEVEL SECURITY;

-- Policy: any authenticated user with access to the parent case's brand can read/write timeline
CREATE POLICY "Authenticated can read timeline"
  ON public.erp_return_timeline FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert timeline"
  ON public.erp_return_timeline FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS erp_return_timeline_case_idx
  ON public.erp_return_timeline(case_id, case_type, created_at DESC);

-- 4) Case number generator
CREATE OR REPLACE FUNCTION public.generate_case_number(_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefix text;
  _ym text;
  _count int;
  _num text;
BEGIN
  _prefix := CASE WHEN _type = 'exchange' THEN 'EXC' ELSE 'RET' END;
  _ym := to_char(now(), 'YYYYMM');
  IF _type = 'exchange' THEN
    SELECT COUNT(*) + 1 INTO _count FROM public.erp_exchange_cases
      WHERE case_number LIKE _prefix || '-' || _ym || '-%';
  ELSE
    SELECT COUNT(*) + 1 INTO _count FROM public.erp_return_cases
      WHERE case_number LIKE _prefix || '-' || _ym || '-%';
  END IF;
  _num := lpad(_count::text, 4, '0');
  RETURN _prefix || '-' || _ym || '-' || _num;
END;
$$;

-- 5) Auto-assign case_number on insert
CREATE OR REPLACE FUNCTION public.assign_return_case_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.case_number IS NULL THEN
    NEW.case_number := public.generate_case_number('return');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_exchange_case_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.case_number IS NULL THEN
    NEW.case_number := public.generate_case_number('exchange');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_return_case_number ON public.erp_return_cases;
CREATE TRIGGER trg_return_case_number
  BEFORE INSERT ON public.erp_return_cases
  FOR EACH ROW EXECUTE FUNCTION public.assign_return_case_number();

DROP TRIGGER IF EXISTS trg_exchange_case_number ON public.erp_exchange_cases;
CREATE TRIGGER trg_exchange_case_number
  BEFORE INSERT ON public.erp_exchange_cases
  FOR EACH ROW EXECUTE FUNCTION public.assign_exchange_case_number();

-- 6) Auto-add timeline entry on insert/status change
CREATE OR REPLACE FUNCTION public.log_return_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.erp_return_timeline(case_id, case_type, status, note, created_by)
    VALUES (NEW.id, 'return', NEW.return_status, 'Case created', NEW.created_by);
  ELSIF TG_OP = 'UPDATE' AND NEW.return_status IS DISTINCT FROM OLD.return_status THEN
    INSERT INTO public.erp_return_timeline(case_id, case_type, status, note, created_by)
    VALUES (NEW.id, 'return', NEW.return_status, NULL, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_exchange_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.erp_return_timeline(case_id, case_type, status, note, created_by)
    VALUES (NEW.id, 'exchange', NEW.exchange_status, 'Case created', NEW.created_by);
  ELSIF TG_OP = 'UPDATE' AND NEW.exchange_status IS DISTINCT FROM OLD.exchange_status THEN
    INSERT INTO public.erp_return_timeline(case_id, case_type, status, note, created_by)
    VALUES (NEW.id, 'exchange', NEW.exchange_status, NULL, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_return_timeline ON public.erp_return_cases;
CREATE TRIGGER trg_log_return_timeline
  AFTER INSERT OR UPDATE ON public.erp_return_cases
  FOR EACH ROW EXECUTE FUNCTION public.log_return_timeline();

DROP TRIGGER IF EXISTS trg_log_exchange_timeline ON public.erp_exchange_cases;
CREATE TRIGGER trg_log_exchange_timeline
  AFTER INSERT OR UPDATE ON public.erp_exchange_cases
  FOR EACH ROW EXECUTE FUNCTION public.log_exchange_timeline();