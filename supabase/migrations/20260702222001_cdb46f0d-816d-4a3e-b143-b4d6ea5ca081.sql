
-- Employee self-read their own payslips
CREATE POLICY "self read own payslips"
ON public.hr_payslips FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = hr_payslips.employee_id AND e.user_id = auth.uid()));

-- Any linked employee can read payroll run metadata (for month/year/status join)
CREATE POLICY "employee read payroll runs"
ON public.hr_payroll_runs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.user_id = auth.uid()));

-- Employee self-read own shift assignment
CREATE POLICY "self read own emp shifts"
ON public.hr_employee_shifts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = hr_employee_shifts.employee_id AND e.user_id = auth.uid()));

-- Any linked employee can read shift catalog
CREATE POLICY "employee read shifts"
ON public.hr_shifts FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.user_id = auth.uid()));

-- Any linked employee can read holidays / departments / designations for their dashboard
CREATE POLICY "employee read holidays"
ON public.hr_holidays FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.user_id = auth.uid()));

CREATE POLICY "employee read departments"
ON public.hr_departments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.user_id = auth.uid()));

CREATE POLICY "employee read designations"
ON public.hr_designations FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.user_id = auth.uid()));
