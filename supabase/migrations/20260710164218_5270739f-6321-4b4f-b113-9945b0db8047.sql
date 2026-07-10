-- Phase 5a: Owner-draw category scaffold (no data recategorization here)

ALTER TABLE public.erp_expense_categories
  ADD COLUMN IF NOT EXISTS excluded_from_pnl boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.erp_expense_categories.excluded_from_pnl IS
  'When true, transactions in this category are excluded from business P&L (e.g. owner personal draws, inter-account FX buys).';

-- Seed "Personal / Owner Draw" per brand
INSERT INTO public.erp_expense_categories (brand_id, name, kind, is_active, excluded_from_pnl)
SELECT b.id, 'Personal / Owner Draw', 'expense', true, true
FROM public.brands b
WHERE NOT EXISTS (
  SELECT 1 FROM public.erp_expense_categories c
  WHERE c.brand_id = b.id AND c.name = 'Personal / Owner Draw'
);

-- Rollback:
-- DELETE FROM public.erp_expense_categories WHERE name = 'Personal / Owner Draw';
-- ALTER TABLE public.erp_expense_categories DROP COLUMN excluded_from_pnl;