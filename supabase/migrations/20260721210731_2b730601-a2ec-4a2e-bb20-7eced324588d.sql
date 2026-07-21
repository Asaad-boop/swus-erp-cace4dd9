-- Drop HR-related storage policies (they reference has_hr_* helpers)
DROP POLICY IF EXISTS hr_buckets_delete ON storage.objects;
DROP POLICY IF EXISTS hr_buckets_read ON storage.objects;
DROP POLICY IF EXISTS hr_buckets_update ON storage.objects;

-- Drop all HR tables (CASCADE to remove FKs, indexes, triggers, policies)
DROP TABLE IF EXISTS public.hr_payslips CASCADE;
DROP TABLE IF EXISTS public.hr_payroll_runs CASCADE;
DROP TABLE IF EXISTS public.hr_attendance CASCADE;
DROP TABLE IF EXISTS public.hr_leave_balances CASCADE;
DROP TABLE IF EXISTS public.hr_leave_requests CASCADE;
DROP TABLE IF EXISTS public.hr_leave_types CASCADE;
DROP TABLE IF EXISTS public.hr_holidays CASCADE;
DROP TABLE IF EXISTS public.hr_documents CASCADE;
DROP TABLE IF EXISTS public.hr_employee_shifts CASCADE;
DROP TABLE IF EXISTS public.hr_shifts CASCADE;
DROP TABLE IF EXISTS public.hr_employment_history CASCADE;
DROP TABLE IF EXISTS public.hr_employees CASCADE;
DROP TABLE IF EXISTS public.hr_designations CASCADE;
DROP TABLE IF EXISTS public.hr_departments CASCADE;
DROP TABLE IF EXISTS public.hr_settings CASCADE;

-- Drop HR-only helper functions
DROP FUNCTION IF EXISTS public.has_hr_access(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_hr_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.hr_count_working_days(date, date) CASCADE;
DROP FUNCTION IF EXISTS public.hr_next_employee_code() CASCADE;
DROP FUNCTION IF EXISTS public.hr_set_updated_at() CASCADE;

-- Remove HR-only roles from user_roles (roles enum stays; can be pruned later)
DELETE FROM public.user_roles WHERE role IN ('hr_admin','hr_manager','employee');