-- The erp_transactions_balance_trg trigger already re-shifted balances when
-- the account_id was updated in the previous backfill. The explicit
-- balance UPDATEs in that migration double-applied the movement. Reverse.
DO $$
DECLARE
  r RECORD;
  v_cod_wallet uuid;
BEGIN
  FOR r IN
    SELECT a.brand_id, a.id AS advance_id, SUM(t.amount) AS moved
    FROM public.erp_transactions t
    JOIN public.erp_accounts a ON a.id = t.account_id
    WHERE t.reference_type = 'order_delivery'
      AND (a.name ILIKE '%advance%' OR COALESCE(a.notes,'') ILIKE '%advance%')
    GROUP BY a.brand_id, a.id
  LOOP
    -- no-op branch (kept for symmetry) — no rows here anymore because the
    -- backfill already moved them.
    NULL;
  END LOOP;

  -- Add back to Advance wallets what was double-subtracted.
  UPDATE public.erp_accounts a
  SET current_balance = current_balance + x.moved
  FROM (
    SELECT '245974c5-0235-4c14-8ddc-1b50f346fd1b'::uuid AS id, 121074.43::numeric AS moved
    UNION ALL SELECT '6a50ae44-0c18-4ed7-9c61-e7398413c7b4'::uuid, 13312.89::numeric
  ) x
  WHERE a.id = x.id;

  -- Subtract from COD Cash wallets what was double-added.
  UPDATE public.erp_accounts a
  SET current_balance = current_balance - x.moved
  FROM (
    SELECT brand_id, moved FROM (VALUES
      ('1f1f366d-ad85-4513-85ab-2dbb6b23c513'::uuid, 121074.43::numeric),
      ('40abf6fa-404e-4c3f-b0df-f35c1535e95d'::uuid, 13312.89::numeric)
    ) v(brand_id, moved)
  ) x
  WHERE a.brand_id = x.brand_id AND a.name = 'COD Cash';
END $$;