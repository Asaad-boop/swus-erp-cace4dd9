CREATE POLICY "self punch insert attendance" ON public.hr_attendance
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = hr_attendance.employee_id AND e.user_id = auth.uid()));

CREATE POLICY "self punch update attendance" ON public.hr_attendance
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = hr_attendance.employee_id AND e.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.hr_employees e WHERE e.id = hr_attendance.employee_id AND e.user_id = auth.uid()));