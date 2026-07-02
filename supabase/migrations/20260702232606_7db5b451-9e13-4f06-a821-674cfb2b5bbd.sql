REVOKE ALL ON public.brands FROM anon, authenticated, service_role;
REVOKE ALL ON public.orders FROM anon, authenticated, service_role;
REVOKE ALL ON public.low_stock_alerts FROM anon, authenticated, service_role;
REVOKE ALL ON public.profiles FROM anon, authenticated, service_role;
REVOKE ALL ON public.user_roles FROM anon, authenticated, service_role;
REVOKE ALL ON public.hr_attendance FROM anon, authenticated, service_role;
REVOKE ALL ON public.hr_employees FROM anon, authenticated, service_role;
REVOKE ALL ON public.hr_shifts FROM anon, authenticated, service_role;
REVOKE ALL ON public.hr_employee_shifts FROM anon, authenticated, service_role;

GRANT SELECT ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;

GRANT INSERT ON public.orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.low_stock_alerts TO authenticated;
GRANT ALL ON public.low_stock_alerts TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.hr_attendance TO authenticated;
GRANT ALL ON public.hr_attendance TO service_role;

GRANT SELECT ON public.hr_employees TO authenticated;
GRANT ALL ON public.hr_employees TO service_role;

GRANT SELECT ON public.hr_shifts TO authenticated;
GRANT ALL ON public.hr_shifts TO service_role;

GRANT SELECT ON public.hr_employee_shifts TO authenticated;
GRANT ALL ON public.hr_employee_shifts TO service_role;