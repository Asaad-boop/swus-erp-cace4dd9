
-- HR payroll & attendance: additive columns for late/OT/absent calculations
ALTER TABLE public.hr_attendance
  ADD COLUMN IF NOT EXISTS deduction_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_late_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.hr_payslips
  ADD COLUMN IF NOT EXISTS total_earnings_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS total_deductions_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS absent_deduction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_deduction numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_earning numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absent_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_total_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_total_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE public.hr_settings
  ADD COLUMN IF NOT EXISTS working_days_per_month integer NOT NULL DEFAULT 26,
  ADD COLUMN IF NOT EXISTS absent_deduction_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS late_consecutive_threshold integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS late_rate_per_min numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS overtime_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS overtime_rate_per_hour numeric NOT NULL DEFAULT 100;
