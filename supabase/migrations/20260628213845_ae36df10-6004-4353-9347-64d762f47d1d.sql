ALTER TABLE public.erp_transactions DROP CONSTRAINT IF EXISTS erp_transactions_amount_check;
ALTER TABLE public.erp_transactions ADD CONSTRAINT erp_transactions_amount_check
  CHECK (
    CASE WHEN txn_type = 'adjustment' THEN amount <> 0
    ELSE amount >= 0 END
  );