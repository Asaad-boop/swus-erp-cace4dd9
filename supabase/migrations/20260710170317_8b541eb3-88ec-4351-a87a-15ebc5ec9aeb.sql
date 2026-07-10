
-- ============================================================
-- Finance Step 3: Bulk categorize + RPC patch
-- Reversible via _backup_step3_categorize
-- ============================================================

-- 1) Backup snapshot
CREATE TABLE IF NOT EXISTS public._backup_step3_categorize AS
SELECT id, brand_id, category_id, txn_type, amount, description, transaction_date, now() AS snapshot_at
FROM public.erp_transactions
WHERE id IN (
  'a0c2280a-dd1c-443c-b148-4230afdd3a73','11baafeb-9580-45ec-84f7-4fe375dbe1c3',
  'ddd62f25-7129-4dae-a436-bdee5c9288f0','768d6fba-ce07-4f99-b2e7-3025fb348efe',
  'e3ad1894-eefb-4f70-94c8-2c267d3ff728','34db6e70-3e35-4b9e-a6f6-46bf43392e37',
  'c343d246-9b6a-4848-a120-6f5b99e5c828','4a575754-f995-48e1-89ad-1ee0686c5f71',
  'e028a0e5-9348-434c-812b-e74dbdc1dec3','e4e213b3-2955-4b70-9ab1-e2f256a7948a',
  '1c4f4b4a-cad7-45e1-94ec-3f4a85c112a4','7d26a202-00c5-4e0e-8d2d-e5c6769feab0',
  'b796c9f1-2213-4b73-9dd5-9cb6f7a18d65','a575bee2-6272-4e93-a3c3-d0c0e48d0b54',
  'a180a4e1-69b4-4107-9dfb-a7cb42e0c464','5da86b86-f0bb-44c5-b191-5ea6d8498db3',
  '6fd186c5-9028-4652-b4cd-b866b2ed8cef','9243c70a-3124-439d-ae30-ba8b2f285d9f',
  'aa137a87-6d90-40b3-86fd-516c55fba045','723c973c-7512-4f64-acac-a10a2f32d5ca',
  '6279b18b-7618-468a-b03b-5a6391b80dcd','a905b5f2-fe8d-4932-92c3-2552f112848c',
  'db6a0524-3a66-46f0-8cc8-40536d65de3e','4ea59fb5-f08d-4aa7-bafe-079e59458f89',
  'e3f9e3b3-b6af-408c-91ce-29cef0b6bb7f'
);

-- 2) Create new categories per brand (idempotent via ON CONFLICT-style guards)
WITH brands_cte AS (
  SELECT unnest(ARRAY[
    '1f1f366d-ad85-4513-85ab-2dbb6b23c513'::uuid,
    '40abf6fa-404e-4c3f-b0df-f35c1535e95d'::uuid
  ]) AS brand_id
),
new_cats AS (
  SELECT * FROM (VALUES
    ('Ad Wallet Funding',       'expense', true),
    ('COGS — Product Sourcing', 'expense', false),
    ('Salary / Payroll',        'expense', false),
    ('Marketing — Direct',      'expense', false),
    ('Office / Equipment',      'expense', false)
  ) AS t(name, kind, excluded_from_pnl)
)
INSERT INTO public.erp_expense_categories (brand_id, name, kind, excluded_from_pnl, is_active)
SELECT b.brand_id, n.name, n.kind, n.excluded_from_pnl, true
FROM brands_cte b
CROSS JOIN new_cats n
WHERE NOT EXISTS (
  SELECT 1 FROM public.erp_expense_categories c
  WHERE c.brand_id = b.brand_id AND c.name = n.name
);

-- 3) Bulk categorize the 25 rows
DO $$
DECLARE
  hs uuid := '1f1f366d-ad85-4513-85ab-2dbb6b23c513';
  ty uuid := '40abf6fa-404e-4c3f-b0df-f35c1535e95d';
  hs_draw uuid; ty_draw uuid;
  hs_wallet uuid; ty_wallet uuid;
  hs_cogs uuid;
  hs_salary uuid;
  hs_mkt uuid;
  hs_office uuid;
BEGIN
  SELECT id INTO hs_draw   FROM erp_expense_categories WHERE brand_id=hs AND name='Personal / Owner Draw';
  SELECT id INTO ty_draw   FROM erp_expense_categories WHERE brand_id=ty AND name='Personal / Owner Draw';
  SELECT id INTO hs_wallet FROM erp_expense_categories WHERE brand_id=hs AND name='Ad Wallet Funding';
  SELECT id INTO ty_wallet FROM erp_expense_categories WHERE brand_id=ty AND name='Ad Wallet Funding';
  SELECT id INTO hs_cogs   FROM erp_expense_categories WHERE brand_id=hs AND name='COGS — Product Sourcing';
  SELECT id INTO hs_salary FROM erp_expense_categories WHERE brand_id=hs AND name='Salary / Payroll';
  SELECT id INTO hs_mkt    FROM erp_expense_categories WHERE brand_id=hs AND name='Marketing — Direct';
  SELECT id INTO hs_office FROM erp_expense_categories WHERE brand_id=hs AND name='Office / Equipment';

  -- Personal / Owner Draw (HS, 7 rows)
  UPDATE erp_transactions SET category_id = hs_draw WHERE id IN (
    'a0c2280a-dd1c-443c-b148-4230afdd3a73',
    '11baafeb-9580-45ec-84f7-4fe375dbe1c3',
    'ddd62f25-7129-4dae-a436-bdee5c9288f0',
    '768d6fba-ce07-4f99-b2e7-3025fb348efe',
    'e3ad1894-eefb-4f70-94c8-2c267d3ff728',
    '34db6e70-3e35-4b9e-a6f6-46bf43392e37',
    'c343d246-9b6a-4848-a120-6f5b99e5c828'
  );

  -- Ad Wallet Funding — HS (8 rows)
  UPDATE erp_transactions SET category_id = hs_wallet WHERE id IN (
    '4a575754-f995-48e1-89ad-1ee0686c5f71',
    'e028a0e5-9348-434c-812b-e74dbdc1dec3',
    '1c4f4b4a-cad7-45e1-94ec-3f4a85c112a4',
    '7d26a202-00c5-4e0e-8d2d-e5c6769feab0',
    'b796c9f1-2213-4b73-9dd5-9cb6f7a18d65',
    'a575bee2-6272-4e93-a3c3-d0c0e48d0b54',
    'a180a4e1-69b4-4107-9dfb-a7cb42e0c464',
    '6fd186c5-9028-4652-b4cd-b866b2ed8cef'
  );

  -- Ad Wallet Funding — TY (2 rows)
  UPDATE erp_transactions SET category_id = ty_wallet WHERE id IN (
    'e4e213b3-2955-4b70-9ab1-e2f256a7948a',
    '5da86b86-f0bb-44c5-b191-5ea6d8498db3'
  );

  -- COGS (HS, 1)
  UPDATE erp_transactions SET category_id = hs_cogs WHERE id = '9243c70a-3124-439d-ae30-ba8b2f285d9f';

  -- Salary (HS, 3)
  UPDATE erp_transactions SET category_id = hs_salary WHERE id IN (
    'aa137a87-6d90-40b3-86fd-516c55fba045',
    '723c973c-7512-4f64-acac-a10a2f32d5ca',
    '6279b18b-7618-468a-b03b-5a6391b80dcd'
  );

  -- Marketing — Direct (HS, 2)
  UPDATE erp_transactions SET category_id = hs_mkt WHERE id IN (
    'a905b5f2-fe8d-4932-92c3-2552f112848c',
    'db6a0524-3a66-46f0-8cc8-40536d65de3e'
  );

  -- Office / Equipment (HS, 2)
  UPDATE erp_transactions SET category_id = hs_office WHERE id IN (
    '4ea59fb5-f08d-4aa7-bafe-079e59458f89',
    'e3f9e3b3-b6af-408c-91ce-29cef0b6bb7f'
  );
END $$;

-- 4) Patch erp_profit_loss to respect excluded_from_pnl
CREATE OR REPLACE FUNCTION public.erp_profit_loss(_brand_id uuid, _from date, _to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user uuid := auth.uid();
  _revenue numeric := 0;
  _delivered_count integer := 0;
  _expense numeric := 0;
  _income_other numeric := 0;
  _expense_by jsonb;
BEGIN
  IF NOT (
    public.has_role(_user, 'admin'::public.app_role)
    OR public.has_role(_user, 'operations'::public.app_role)
    OR public.has_role(_user, 'customer_service'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(SUM(total), 0), COUNT(*) INTO _revenue, _delivered_count
  FROM public.orders
  WHERE brand_id = _brand_id
    AND status IN ('delivered'::public.order_status, 'partial_delivered'::public.order_status)
    AND created_at::date BETWEEN _from AND _to;

  -- Expense total: exclude categories flagged excluded_from_pnl
  SELECT COALESCE(SUM(t.amount), 0) INTO _expense
  FROM public.erp_transactions t
  LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
  WHERE t.brand_id = _brand_id
    AND t.txn_type = 'expense'
    AND t.transaction_date BETWEEN _from AND _to
    AND COALESCE(c.excluded_from_pnl, false) = false;

  SELECT COALESCE(SUM(amount), 0) INTO _income_other
  FROM public.erp_transactions
  WHERE brand_id = _brand_id
    AND txn_type = 'income'
    AND transaction_date BETWEEN _from AND _to;

  -- Breakdown: also exclude flagged categories
  SELECT COALESCE(jsonb_object_agg(name, total), '{}'::jsonb) INTO _expense_by
  FROM (
    SELECT COALESCE(c.name, 'Uncategorized') AS name, SUM(t.amount) AS total
    FROM public.erp_transactions t
    LEFT JOIN public.erp_expense_categories c ON c.id = t.category_id
    WHERE t.brand_id = _brand_id
      AND t.txn_type = 'expense'
      AND t.transaction_date BETWEEN _from AND _to
      AND COALESCE(c.excluded_from_pnl, false) = false
    GROUP BY 1
  ) s;

  RETURN jsonb_build_object(
    'revenue', _revenue,
    'delivered_orders', _delivered_count,
    'other_income', _income_other,
    'expense_total', _expense,
    'expense_by_category', _expense_by,
    'profit', (_revenue + _income_other - _expense)
  );
END;
$function$;

-- ============================================================
-- Rollback (manual):
--   UPDATE erp_transactions t SET category_id = b.category_id
--   FROM _backup_step3_categorize b WHERE t.id = b.id;
--   -- optionally drop new categories if unused
-- ============================================================
