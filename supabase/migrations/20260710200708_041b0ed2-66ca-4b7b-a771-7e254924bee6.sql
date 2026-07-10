-- Prevent duplicate courier settlement lines: unique on (consignment_id, invoice_type, created_date).
-- Partial index so rows without consignment_id (rare, unmatched raw) don't collide on NULLs.
-- Table is currently empty (verified) — safe to create without cleanup.

CREATE UNIQUE INDEX IF NOT EXISTS uq_csl_consignment_invoice_date
  ON public.erp_courier_settlement_lines (consignment_id, invoice_type, created_date)
  WHERE consignment_id IS NOT NULL;

COMMENT ON INDEX public.uq_csl_consignment_invoice_date IS
  'Blocks duplicate settlement CSV re-uploads: same consignment+invoice_type+date cannot be inserted twice. Upload UI does a pre-check to skip and warn.';

-- Rollback: DROP INDEX IF EXISTS public.uq_csl_consignment_invoice_date;