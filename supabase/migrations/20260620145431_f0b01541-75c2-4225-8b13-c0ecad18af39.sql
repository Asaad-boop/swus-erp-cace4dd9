-- Fix double-restock: drop DB triggers, keep app-side completeQC as single restock path
DROP TRIGGER IF EXISTS trg_return_restock ON public.erp_return_cases;
DROP TRIGGER IF EXISTS trg_return_restock_update ON public.erp_return_cases;
DROP FUNCTION IF EXISTS public.handle_return_restock();
DROP FUNCTION IF EXISTS public.handle_return_restock_update();