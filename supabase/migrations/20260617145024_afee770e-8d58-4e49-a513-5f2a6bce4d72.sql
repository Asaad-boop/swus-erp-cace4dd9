
-- HR Module Phase 1: Tables + RLS + Helpers

CREATE OR REPLACE FUNCTION public.has_hr_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'hr_admin')
      OR public.has_role(_user_id, 'hr_manager');
$$;

CREATE OR REPLACE FUNCTION public.has_hr_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR public.has_role(_user_id, 'hr_admin');
$$;

CREATE OR REPLACE FUNCTION public.hr_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- hr_departments
CREATE TABLE public.hr_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  parent_id uuid REFERENCES public.hr_departments(id) ON DELETE SET NULL,
  head_employee_id uuid,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_departments TO authenticated;
GRANT ALL ON public.hr_departments TO service_role;
ALTER TABLE public.hr_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read departments" ON public.hr_departments FOR SELECT TO authenticated USING (public.has_hr_access(auth.uid()));
CREATE POLICY "hr admin manage departments" ON public.hr_departments FOR ALL TO authenticated USING (public.has_hr_admin(auth.uid())) WITH CHECK (public.has_hr_admin(auth.uid()));
CREATE TRIGGER hr_departments_updated BEFORE UPDATE ON public.hr_departments FOR EACH ROW EXECUTE FUNCTION public.hr_set_updated_at();

-- hr_designations
CREATE TABLE public.hr_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  department_id uuid REFERENCES public.hr_departments(id) ON DELETE SET NULL,
  level int,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_designations TO authenticated;
GRANT ALL ON public.hr_designations TO service_role;
ALTER TABLE public.hr_designations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read designations" ON public.hr_designations FOR SELECT TO authenticated USING (public.has_hr_access(auth.uid()));
CREATE POLICY "hr admin manage designations" ON public.hr_designations FOR ALL TO authenticated USING (public.has_hr_admin(auth.uid())) WITH CHECK (public.has_hr_admin(auth.uid()));
CREATE TRIGGER hr_designations_updated BEFORE UPDATE ON public.hr_designations FOR EACH ROW EXECUTE FUNCTION public.hr_set_updated_at();

-- hr_employees
CREATE TABLE public.hr_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text UNIQUE NOT NULL,
  user_id uuid,
  full_name text NOT NULL,
  display_name text,
  email text,
  phone text,
  alt_phone text,
  gender text CHECK (gender IN ('male','female','other')),
  date_of_birth date,
  marital_status text,
  blood_group text,
  nationality text DEFAULT 'Bangladeshi',
  nid text,
  passport text,
  tin text,
  photo_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','probation','on_leave','suspended','terminated','resigned','retired')),
  employment_type text DEFAULT 'full_time' CHECK (employment_type IN ('full_time','part_time','contract','intern','consultant')),
  joining_date date NOT NULL DEFAULT CURRENT_DATE,
  confirmation_date date,
  probation_months int DEFAULT 6,
  exit_date date,
  exit_reason text,
  department_id uuid REFERENCES public.hr_departments(id) ON DELETE SET NULL,
  designation_id uuid REFERENCES public.hr_designations(id) ON DELETE SET NULL,
  manager_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  brand_ids uuid[] NOT NULL DEFAULT '{}',
  work_location text,
  work_email text,
  bank_name text,
  bank_branch text,
  bank_account_no text,
  bank_routing text,
  mfs_provider text,
  mfs_number text,
  gross_salary numeric(14,2),
  currency text NOT NULL DEFAULT 'BDT',
  present_address text,
  permanent_address text,
  emergency_name text,
  emergency_relation text,
  emergency_phone text,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_employees_status_idx ON public.hr_employees(status);
CREATE INDEX hr_employees_dept_idx ON public.hr_employees(department_id);
CREATE INDEX hr_employees_manager_idx ON public.hr_employees(manager_id);
CREATE INDEX hr_employees_user_idx ON public.hr_employees(user_id);
CREATE INDEX hr_employees_brands_idx ON public.hr_employees USING GIN(brand_ids);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_employees TO authenticated;
GRANT ALL ON public.hr_employees TO service_role;
ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read employees" ON public.hr_employees FOR SELECT TO authenticated USING (public.has_hr_access(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "hr admin manage employees" ON public.hr_employees FOR ALL TO authenticated USING (public.has_hr_admin(auth.uid())) WITH CHECK (public.has_hr_admin(auth.uid()));
CREATE TRIGGER hr_employees_updated BEFORE UPDATE ON public.hr_employees FOR EACH ROW EXECUTE FUNCTION public.hr_set_updated_at();

ALTER TABLE public.hr_departments
  ADD CONSTRAINT hr_departments_head_fk
  FOREIGN KEY (head_employee_id) REFERENCES public.hr_employees(id) ON DELETE SET NULL;

-- hr_employment_history
CREATE TABLE public.hr_employment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('joined','promotion','transfer','salary_change','confirmation','suspension','reinstatement','exit','role_change','department_change','designation_change')),
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  from_value jsonb,
  to_value jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_history_emp_idx ON public.hr_employment_history(employee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_employment_history TO authenticated;
GRANT ALL ON public.hr_employment_history TO service_role;
ALTER TABLE public.hr_employment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read history" ON public.hr_employment_history FOR SELECT TO authenticated USING (public.has_hr_access(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
CREATE POLICY "hr admin manage history" ON public.hr_employment_history FOR ALL TO authenticated USING (public.has_hr_admin(auth.uid())) WITH CHECK (public.has_hr_admin(auth.uid()));
CREATE TRIGGER hr_history_updated BEFORE UPDATE ON public.hr_employment_history FOR EACH ROW EXECUTE FUNCTION public.hr_set_updated_at();

-- hr_documents
CREATE TABLE public.hr_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  title text,
  file_url text,
  issue_date date,
  expiry_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_docs_emp_idx ON public.hr_documents(employee_id);
CREATE INDEX hr_docs_expiry_idx ON public.hr_documents(expiry_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_documents TO authenticated;
GRANT ALL ON public.hr_documents TO service_role;
ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read docs" ON public.hr_documents FOR SELECT TO authenticated USING (public.has_hr_access(auth.uid()) OR EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = employee_id AND e.user_id = auth.uid()));
CREATE POLICY "hr admin manage docs" ON public.hr_documents FOR ALL TO authenticated USING (public.has_hr_admin(auth.uid())) WITH CHECK (public.has_hr_admin(auth.uid()));
CREATE TRIGGER hr_docs_updated BEFORE UPDATE ON public.hr_documents FOR EACH ROW EXECUTE FUNCTION public.hr_set_updated_at();

-- hr_settings
CREATE TABLE public.hr_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid UNIQUE,
  default_currency text NOT NULL DEFAULT 'BDT',
  weekly_off_days int[] NOT NULL DEFAULT '{5,6}',
  work_hours_per_day numeric(4,2) NOT NULL DEFAULT 8.00,
  probation_months int NOT NULL DEFAULT 6,
  employee_code_prefix text NOT NULL DEFAULT 'EMP',
  employee_code_padding int NOT NULL DEFAULT 4,
  next_employee_seq int NOT NULL DEFAULT 1,
  fiscal_year_start_month int NOT NULL DEFAULT 7,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_settings TO authenticated;
GRANT ALL ON public.hr_settings TO service_role;
ALTER TABLE public.hr_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr read settings" ON public.hr_settings FOR SELECT TO authenticated USING (public.has_hr_access(auth.uid()));
CREATE POLICY "hr admin manage settings" ON public.hr_settings FOR ALL TO authenticated USING (public.has_hr_admin(auth.uid())) WITH CHECK (public.has_hr_admin(auth.uid()));
CREATE TRIGGER hr_settings_updated BEFORE UPDATE ON public.hr_settings FOR EACH ROW EXECUTE FUNCTION public.hr_set_updated_at();

INSERT INTO public.hr_settings (brand_id) VALUES (NULL);

-- Employee code sequence
CREATE OR REPLACE FUNCTION public.hr_next_employee_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; code text;
BEGIN
  SELECT * INTO s FROM public.hr_settings WHERE brand_id IS NULL LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.hr_settings (brand_id) VALUES (NULL) RETURNING * INTO s;
  END IF;
  code := s.employee_code_prefix || lpad(s.next_employee_seq::text, s.employee_code_padding, '0');
  UPDATE public.hr_settings SET next_employee_seq = s.next_employee_seq + 1 WHERE id = s.id;
  RETURN code;
END; $$;
