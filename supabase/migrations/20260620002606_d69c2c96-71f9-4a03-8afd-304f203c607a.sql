-- Add 3 new expense subtypes to the marketing expense category enum.
-- Existing values (influencer/content/photoshoot/agency/boost/other) remain.
ALTER TYPE public.mkt_expense_category ADD VALUE IF NOT EXISTS 'print_design';
ALTER TYPE public.mkt_expense_category ADD VALUE IF NOT EXISTS 'event';
ALTER TYPE public.mkt_expense_category ADD VALUE IF NOT EXISTS 'sms_email';