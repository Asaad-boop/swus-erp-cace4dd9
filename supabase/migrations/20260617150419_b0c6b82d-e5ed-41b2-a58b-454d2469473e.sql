
-- ============ SHIFTS ============
CREATE TABLE public.hr_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NULL REFERENCES public.brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT NULL,
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  break_minutes INT NOT NULL DEFAULT 60,
  grace_minutes INT NOT NULL DEFAULT 10,
  half_day_after_min INT NOT NULL DEFAULT 240,
  is_night BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_shifts TO authenticated;
GRANT ALL ON public.hr_shifts TO service_role;
ALTER TABLE public.hr_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr access read shifts" ON public.hr_shifts FOR SELECT TO authenticated USING (public.has_hr_access(auth.uid()));
CREATE POLICY "hr admin write shifts" ON public.hr_shifts FOR ALL TO authenticated USING (public.has_hr_admin(auth.uid())) WITH CHECK (public.has_hr_admin(auth.uid()));
CREATE TRIGGER trg_hr_shifts_updated BEFORE UPDATE ON public.hr_shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ EMPLOYEE SHIFT ASSIGNMENTS ============
CREATE TABLE public.hr_employee_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.hr_shifts(id) ON DELETE RESTRICT,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_emp_shifts_emp ON public.hr_employee_shifts(employee_id, effective_from DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_employee_shifts TO authenticated;
GRANT ALL ON public.hr_employee_shifts TO service_role;
ALTER TABLE public.hr_employee_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read emp shifts" ON public.hr_employee_shifts FOR SELECT TO authenticated USING (public.has_hr_access(auth.uid()));
CREATE POLICY "hr admin write emp shifts" ON public.hr_employee_shifts FOR ALL TO authenticated USING (public.has_hr_admin(auth.uid())) WITH CHECK (public.has_hr_admin(auth.uid()));
CREATE TRIGGER trg_emp_shifts_updated BEFORE UPDATE ON public.hr_employee_shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ HOLIDAYS ============
CREATE TABLE public.hr_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NULL REFERENCES public.brands(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'public',
  is_optional BOOLEAN NOT NULL DEFAULT false,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hr_holidays_date ON public.hr_holidays(date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_holidays TO authenticated;
GRANT ALL ON public.hr_holidays TO service_role;
ALTER TABLE public.hr_holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read holidays" ON public.hr_holidays FOR SELECT TO authenticated USING (public.has_hr_access(auth.uid()));
CREATE POLICY "hr admin write holidays" ON public.hr_holidays FOR ALL TO authenticated USING (public.has_hr_admin(auth.uid())) WITH CHECK (public.has_hr_admin(auth.uid()));
CREATE TRIGGER trg_hr_holidays_updated BEFORE UPDATE ON public.hr_holidays FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ATTENDANCE ============
CREATE TABLE public.hr_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  in_time TIMESTAMPTZ NULL,
  out_time TIMESTAMPTZ NULL,
  shift_id UUID NULL REFERENCES public.hr_shifts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'present',
  source TEXT NOT NULL DEFAULT 'manual',
  late_min INT NOT NULL DEFAULT 0,
  early_leave_min INT NOT NULL DEFAULT 0,
  ot_min INT NOT NULL DEFAULT 0,
  work_min INT NOT NULL DEFAULT 0,
  note TEXT NULL,
  marked_by UUID NULL,
  ip_address TEXT NULL,
  location JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);
CREATE INDEX idx_hr_attendance_date ON public.hr_attendance(date);
CREATE INDEX idx_hr_attendance_emp_date ON public.hr_attendance(employee_id, date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_attendance TO authenticated;
GRANT ALL ON public.hr_attendance TO service_role;
ALTER TABLE public.hr_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read attendance" ON public.hr_attendance FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = hr_attendance.employee_id AND e.user_id = auth.uid()));
CREATE POLICY "hr admin write attendance" ON public.hr_attendance FOR ALL TO authenticated USING (public.has_hr_admin(auth.uid())) WITH CHECK (public.has_hr_admin(auth.uid()));
CREATE TRIGGER trg_hr_attendance_updated BEFORE UPDATE ON public.hr_attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ LEAVE TYPES ============
CREATE TABLE public.hr_leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NULL REFERENCES public.brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  is_paid BOOLEAN NOT NULL DEFAULT true,
  default_days_per_year NUMERIC(6,2) NOT NULL DEFAULT 0,
  max_carry_forward NUMERIC(6,2) NOT NULL DEFAULT 0,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  min_notice_days INT NOT NULL DEFAULT 0,
  applies_to_gender TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_leave_types TO authenticated;
GRANT ALL ON public.hr_leave_types TO service_role;
ALTER TABLE public.hr_leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read leave types" ON public.hr_leave_types FOR SELECT TO authenticated USING (public.has_hr_access(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.user_id = auth.uid()));
CREATE POLICY "hr admin write leave types" ON public.hr_leave_types FOR ALL TO authenticated USING (public.has_hr_admin(auth.uid())) WITH CHECK (public.has_hr_admin(auth.uid()));
CREATE TRIGGER trg_hr_leave_types_updated BEFORE UPDATE ON public.hr_leave_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ LEAVE BALANCES ============
CREATE TABLE public.hr_leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE CASCADE,
  year INT NOT NULL,
  allocated NUMERIC(6,2) NOT NULL DEFAULT 0,
  used NUMERIC(6,2) NOT NULL DEFAULT 0,
  carried NUMERIC(6,2) NOT NULL DEFAULT 0,
  encashed NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, leave_type_id, year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_leave_balances TO authenticated;
GRANT ALL ON public.hr_leave_balances TO service_role;
ALTER TABLE public.hr_leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read leave balances" ON public.hr_leave_balances FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = hr_leave_balances.employee_id AND e.user_id = auth.uid()));
CREATE POLICY "hr admin write leave balances" ON public.hr_leave_balances FOR ALL TO authenticated USING (public.has_hr_admin(auth.uid())) WITH CHECK (public.has_hr_admin(auth.uid()));
CREATE TRIGGER trg_hr_leave_balances_updated BEFORE UPDATE ON public.hr_leave_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ LEAVE REQUESTS ============
CREATE TABLE public.hr_leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES public.hr_leave_types(id) ON DELETE RESTRICT,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  days NUMERIC(6,2) NOT NULL,
  is_half_day BOOLEAN NOT NULL DEFAULT false,
  half_day_part TEXT NULL,
  reason TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  approver_id UUID NULL,
  decided_at TIMESTAMPTZ NULL,
  decision_note TEXT NULL,
  attachment_url TEXT NULL,
  contact_during_leave TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hr_leave_req_emp ON public.hr_leave_requests(employee_id, from_date DESC);
CREATE INDEX idx_hr_leave_req_status ON public.hr_leave_requests(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_leave_requests TO authenticated;
GRANT ALL ON public.hr_leave_requests TO service_role;
ALTER TABLE public.hr_leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read leave requests" ON public.hr_leave_requests FOR SELECT TO authenticated
  USING (public.has_hr_access(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = hr_leave_requests.employee_id AND e.user_id = auth.uid()));
CREATE POLICY "employee create own leave" ON public.hr_leave_requests FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = hr_leave_requests.employee_id AND e.user_id = auth.uid()) OR public.has_hr_admin(auth.uid()));
CREATE POLICY "employee cancel own pending" ON public.hr_leave_requests FOR UPDATE TO authenticated
  USING (status = 'pending' AND EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = hr_leave_requests.employee_id AND e.user_id = auth.uid()))
  WITH CHECK (status IN ('pending','cancelled'));
CREATE POLICY "hr admin manage leave requests" ON public.hr_leave_requests FOR ALL TO authenticated
  USING (public.has_hr_admin(auth.uid())) WITH CHECK (public.has_hr_admin(auth.uid()));
CREATE TRIGGER trg_hr_leave_req_updated BEFORE UPDATE ON public.hr_leave_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ HELPER: working days calculator ============
CREATE OR REPLACE FUNCTION public.hr_count_working_days(_from DATE, _to DATE, _weekly_off INT[] DEFAULT ARRAY[5])
RETURNS NUMERIC LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  d DATE := _from;
  cnt NUMERIC := 0;
BEGIN
  WHILE d <= _to LOOP
    IF NOT (EXTRACT(DOW FROM d)::INT = ANY(_weekly_off)) AND NOT EXISTS (SELECT 1 FROM public.hr_holidays h WHERE h.date = d) THEN
      cnt := cnt + 1;
    END IF;
    d := d + 1;
  END LOOP;
  RETURN cnt;
END; $$;

-- ============ SEED default leave types ============
INSERT INTO public.hr_leave_types (name, code, color, is_paid, default_days_per_year, requires_approval) VALUES
  ('Casual Leave', 'CL', '#10b981', true, 10, true),
  ('Sick Leave', 'SL', '#f59e0b', true, 14, true),
  ('Earned Leave', 'EL', '#3b82f6', true, 15, true),
  ('Maternity Leave', 'ML', '#ec4899', true, 112, true),
  ('Unpaid Leave', 'LWP', '#6b7280', false, 0, true)
ON CONFLICT (code) DO NOTHING;
