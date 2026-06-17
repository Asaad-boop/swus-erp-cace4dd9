
-- =========================================================
-- HRM Rebuild — Phase 0: schema extensions + new tables
-- =========================================================

-- 1) hr_attendance: punch-in/out, GPS, selfie
ALTER TABLE public.hr_attendance
  ADD COLUMN IF NOT EXISTS check_in_time  timestamptz,
  ADD COLUMN IF NOT EXISTS check_out_time timestamptz,
  ADD COLUMN IF NOT EXISTS break_start    timestamptz,
  ADD COLUMN IF NOT EXISTS break_end      timestamptz,
  ADD COLUMN IF NOT EXISTS check_in_lat   numeric,
  ADD COLUMN IF NOT EXISTS check_in_lng   numeric,
  ADD COLUMN IF NOT EXISTS check_out_lat  numeric,
  ADD COLUMN IF NOT EXISTS check_out_lng  numeric,
  ADD COLUMN IF NOT EXISTS selfie_url     text,
  ADD COLUMN IF NOT EXISTS total_hours    numeric;

-- 2) hr_documents: file metadata
ALTER TABLE public.hr_documents
  ADD COLUMN IF NOT EXISTS file_name   text,
  ADD COLUMN IF NOT EXISTS mime_type   text,
  ADD COLUMN IF NOT EXISTS file_size   bigint,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid;

-- 3) hr_employees: structured salary breakdown
ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS salary_structure jsonb NOT NULL DEFAULT '{"basic":0,"allowances":{"house":0,"transport":0,"medical":0,"other":0},"deductions":{"pf":0,"tax":0,"loan":0,"other":0}}'::jsonb;

-- 4) hr_payroll_runs
CREATE TABLE IF NOT EXISTS public.hr_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  year  int NOT NULL CHECK (year  BETWEEN 2000 AND 2100),
  brand_id uuid NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized','cancelled')),
  total_gross numeric NOT NULL DEFAULT 0,
  total_net   numeric NOT NULL DEFAULT 0,
  total_employees int NOT NULL DEFAULT 0,
  notes text,
  finalized_at timestamptz,
  finalized_by uuid,
  created_by   uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hr_payroll_runs_unique
  ON public.hr_payroll_runs (year, month, COALESCE(brand_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_runs TO authenticated;
GRANT ALL ON public.hr_payroll_runs TO service_role;
ALTER TABLE public.hr_payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_payroll_runs_select" ON public.hr_payroll_runs
  FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()));

CREATE POLICY "hr_payroll_runs_modify" ON public.hr_payroll_runs
  FOR ALL TO authenticated
  USING (public.has_hr_admin(auth.uid()))
  WITH CHECK (public.has_hr_admin(auth.uid()));

-- 5) hr_payslips
CREATE TABLE IF NOT EXISTS public.hr_payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  basic numeric NOT NULL DEFAULT 0,
  allowances jsonb NOT NULL DEFAULT '{}'::jsonb,
  deductions jsonb NOT NULL DEFAULT '{}'::jsonb,
  gross numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','partial','cancelled')),
  payment_method text,
  payment_ref text,
  paid_at timestamptz,
  paid_by uuid,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, employee_id)
);
CREATE INDEX IF NOT EXISTS hr_payslips_run_idx      ON public.hr_payslips(run_id);
CREATE INDEX IF NOT EXISTS hr_payslips_employee_idx ON public.hr_payslips(employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payslips TO authenticated;
GRANT ALL ON public.hr_payslips TO service_role;
ALTER TABLE public.hr_payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_payslips_select" ON public.hr_payslips
  FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()));

CREATE POLICY "hr_payslips_modify" ON public.hr_payslips
  FOR ALL TO authenticated
  USING (public.has_hr_admin(auth.uid()))
  WITH CHECK (public.has_hr_admin(auth.uid()));

-- 6) updated_at triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_hr_payroll_runs_updated_at') THEN
    CREATE TRIGGER trg_hr_payroll_runs_updated_at BEFORE UPDATE ON public.hr_payroll_runs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_hr_payslips_updated_at') THEN
    CREATE TRIGGER trg_hr_payslips_updated_at BEFORE UPDATE ON public.hr_payslips
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 7) Storage RLS policies for hr buckets (buckets created separately via storage tool)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='hr_buckets_read') THEN
    CREATE POLICY "hr_buckets_read" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id IN ('hr-documents','hr-attendance-selfies') AND public.has_hr_access(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='hr_buckets_write') THEN
    CREATE POLICY "hr_buckets_write" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id IN ('hr-documents','hr-attendance-selfies') AND public.has_hr_access(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='hr_buckets_update') THEN
    CREATE POLICY "hr_buckets_update" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id IN ('hr-documents','hr-attendance-selfies') AND public.has_hr_access(auth.uid()))
      WITH CHECK (bucket_id IN ('hr-documents','hr-attendance-selfies') AND public.has_hr_access(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='hr_buckets_delete') THEN
    CREATE POLICY "hr_buckets_delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id IN ('hr-documents','hr-attendance-selfies') AND public.has_hr_admin(auth.uid()));
  END IF;
END $$;
