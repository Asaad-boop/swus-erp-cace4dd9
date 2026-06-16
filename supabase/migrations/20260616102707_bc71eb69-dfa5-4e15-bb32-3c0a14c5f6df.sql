
-- ============ 1. CHART OF ACCOUNTS ============
CREATE TABLE public.erp_chart_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  parent_id uuid NULL REFERENCES public.erp_chart_accounts(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'BDT',
  opening_balance numeric NOT NULL DEFAULT 0,
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  is_active boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  description text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, code)
);
CREATE INDEX idx_coa_brand_type ON public.erp_chart_accounts(brand_id, account_type);
CREATE INDEX idx_coa_parent ON public.erp_chart_accounts(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_chart_accounts TO authenticated;
GRANT ALL ON public.erp_chart_accounts TO service_role;
ALTER TABLE public.erp_chart_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read COA"
  ON public.erp_chart_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/ops manage COA"
  ON public.erp_chart_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operations'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operations'::public.app_role));

CREATE TRIGGER set_updated_at_coa BEFORE UPDATE ON public.erp_chart_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 2. PERIOD LOCKS ============
CREATE TABLE public.erp_period_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  locked_until date NOT NULL,
  locked_by uuid NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_period_locks TO authenticated;
GRANT ALL ON public.erp_period_locks TO service_role;
ALTER TABLE public.erp_period_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read locks" ON public.erp_period_locks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage locks" ON public.erp_period_locks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============ 3. JOURNAL ENTRIES ============
CREATE TABLE public.erp_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  entry_no text NOT NULL,
  entry_date date NOT NULL,
  description text NULL,
  source_type text NULL,
  source_id uuid NULL,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','void')),
  is_locked boolean NOT NULL DEFAULT false,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (brand_id, entry_no)
);
CREATE INDEX idx_je_brand_date ON public.erp_journal_entries(brand_id, entry_date DESC);
CREATE INDEX idx_je_status ON public.erp_journal_entries(status);
CREATE INDEX idx_je_source ON public.erp_journal_entries(source_type, source_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_journal_entries TO authenticated;
GRANT ALL ON public.erp_journal_entries TO service_role;
ALTER TABLE public.erp_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read entries" ON public.erp_journal_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/ops manage entries" ON public.erp_journal_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operations'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operations'::public.app_role));

CREATE TRIGGER set_updated_at_je BEFORE UPDATE ON public.erp_journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 4. JOURNAL LINES ============
CREATE TABLE public.erp_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  journal_entry_id uuid NOT NULL REFERENCES public.erp_journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.erp_chart_accounts(id),
  debit numeric NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description text NULL,
  line_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT (debit > 0 AND credit > 0))
);
CREATE INDEX idx_jl_entry ON public.erp_journal_lines(journal_entry_id);
CREATE INDEX idx_jl_account ON public.erp_journal_lines(account_id);
CREATE INDEX idx_jl_brand ON public.erp_journal_lines(brand_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_journal_lines TO authenticated;
GRANT ALL ON public.erp_journal_lines TO service_role;
ALTER TABLE public.erp_journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read lines" ON public.erp_journal_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/ops manage lines" ON public.erp_journal_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operations'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operations'::public.app_role));

-- ============ 5. ATTACHMENTS ============
CREATE TABLE public.erp_finance_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  journal_entry_id uuid NULL REFERENCES public.erp_journal_entries(id) ON DELETE CASCADE,
  transaction_id uuid NULL,
  file_name text NULL,
  storage_path text NOT NULL,
  mime_type text NULL,
  size_bytes bigint NULL,
  uploaded_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_att_entry ON public.erp_finance_attachments(journal_entry_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_finance_attachments TO authenticated;
GRANT ALL ON public.erp_finance_attachments TO service_role;
ALTER TABLE public.erp_finance_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read att" ON public.erp_finance_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/ops manage att" ON public.erp_finance_attachments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operations'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operations'::public.app_role));

-- ============ 6. SEED DEFAULT COA ============
CREATE OR REPLACE FUNCTION public.seed_default_coa(_brand_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _count int := 0;
  _id_assets uuid; _id_cash uuid; _id_bank uuid; _id_ar uuid; _id_inv uuid;
  _id_liab uuid; _id_ap uuid;
  _id_eq uuid;
  _id_inc uuid;
  _id_exp uuid;
BEGIN
  IF NOT public.has_role(_user, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- ASSETS
  INSERT INTO erp_chart_accounts(brand_id, code, name, account_type, normal_balance, created_by)
    VALUES (_brand_id,'1000','Assets','asset','debit',_user) ON CONFLICT (brand_id,code) DO NOTHING RETURNING id INTO _id_assets;
  IF _id_assets IS NULL THEN SELECT id INTO _id_assets FROM erp_chart_accounts WHERE brand_id=_brand_id AND code='1000'; END IF;

  INSERT INTO erp_chart_accounts(brand_id, code, name, account_type, parent_id, normal_balance, created_by) VALUES
    (_brand_id,'1100','Cash','asset',_id_assets,'debit',_user),
    (_brand_id,'1110','Office Cash','asset',_id_assets,'debit',_user),
    (_brand_id,'1120','Bank','asset',_id_assets,'debit',_user),
    (_brand_id,'1130','bKash','asset',_id_assets,'debit',_user),
    (_brand_id,'1140','Nagad','asset',_id_assets,'debit',_user),
    (_brand_id,'1200','Accounts Receivable','asset',_id_assets,'debit',_user),
    (_brand_id,'1210','Courier COD Receivable','asset',_id_assets,'debit',_user),
    (_brand_id,'1300','Inventory','asset',_id_assets,'debit',_user)
  ON CONFLICT (brand_id,code) DO NOTHING;

  -- LIABILITIES
  INSERT INTO erp_chart_accounts(brand_id, code, name, account_type, normal_balance, created_by)
    VALUES (_brand_id,'2000','Liabilities','liability','credit',_user) ON CONFLICT (brand_id,code) DO NOTHING RETURNING id INTO _id_liab;
  IF _id_liab IS NULL THEN SELECT id INTO _id_liab FROM erp_chart_accounts WHERE brand_id=_brand_id AND code='2000'; END IF;

  INSERT INTO erp_chart_accounts(brand_id, code, name, account_type, parent_id, normal_balance, created_by) VALUES
    (_brand_id,'2100','Accounts Payable','liability',_id_liab,'credit',_user),
    (_brand_id,'2110','Supplier Payable','liability',_id_liab,'credit',_user),
    (_brand_id,'2200','Loan Payable','liability',_id_liab,'credit',_user)
  ON CONFLICT (brand_id,code) DO NOTHING;

  -- EQUITY
  INSERT INTO erp_chart_accounts(brand_id, code, name, account_type, normal_balance, created_by)
    VALUES (_brand_id,'3000','Equity','equity','credit',_user) ON CONFLICT (brand_id,code) DO NOTHING RETURNING id INTO _id_eq;
  IF _id_eq IS NULL THEN SELECT id INTO _id_eq FROM erp_chart_accounts WHERE brand_id=_brand_id AND code='3000'; END IF;

  INSERT INTO erp_chart_accounts(brand_id, code, name, account_type, parent_id, normal_balance, created_by) VALUES
    (_brand_id,'3100','Owner Capital','equity',_id_eq,'credit',_user),
    (_brand_id,'3200','Owner Drawings','equity',_id_eq,'debit',_user),
    (_brand_id,'3300','Retained Earnings','equity',_id_eq,'credit',_user)
  ON CONFLICT (brand_id,code) DO NOTHING;

  -- INCOME
  INSERT INTO erp_chart_accounts(brand_id, code, name, account_type, normal_balance, created_by)
    VALUES (_brand_id,'4000','Income','income','credit',_user) ON CONFLICT (brand_id,code) DO NOTHING RETURNING id INTO _id_inc;
  IF _id_inc IS NULL THEN SELECT id INTO _id_inc FROM erp_chart_accounts WHERE brand_id=_brand_id AND code='4000'; END IF;

  INSERT INTO erp_chart_accounts(brand_id, code, name, account_type, parent_id, normal_balance, created_by) VALUES
    (_brand_id,'4100','Sales Revenue','income',_id_inc,'credit',_user),
    (_brand_id,'4200','Delivery Charge Income','income',_id_inc,'credit',_user),
    (_brand_id,'4300','Other Income','income',_id_inc,'credit',_user)
  ON CONFLICT (brand_id,code) DO NOTHING;

  -- EXPENSE
  INSERT INTO erp_chart_accounts(brand_id, code, name, account_type, normal_balance, created_by)
    VALUES (_brand_id,'5000','Expenses','expense','debit',_user) ON CONFLICT (brand_id,code) DO NOTHING RETURNING id INTO _id_exp;
  IF _id_exp IS NULL THEN SELECT id INTO _id_exp FROM erp_chart_accounts WHERE brand_id=_brand_id AND code='5000'; END IF;

  INSERT INTO erp_chart_accounts(brand_id, code, name, account_type, parent_id, normal_balance, created_by) VALUES
    (_brand_id,'5100','Product Cost / COGS','expense',_id_exp,'debit',_user),
    (_brand_id,'5200','Meta Ads Expense','expense',_id_exp,'debit',_user),
    (_brand_id,'5300','Courier Expense','expense',_id_exp,'debit',_user),
    (_brand_id,'5400','Packaging Expense','expense',_id_exp,'debit',_user),
    (_brand_id,'5500','Salary Expense','expense',_id_exp,'debit',_user),
    (_brand_id,'5600','Office Expense','expense',_id_exp,'debit',_user),
    (_brand_id,'5700','Refund & Return Loss','expense',_id_exp,'debit',_user),
    (_brand_id,'5800','Import / Shipping Expense','expense',_id_exp,'debit',_user)
  ON CONFLICT (brand_id,code) DO NOTHING;

  SELECT COUNT(*) INTO _count FROM erp_chart_accounts WHERE brand_id=_brand_id;
  RETURN _count;
END;
$$;

-- ============ 7. CREATE JOURNAL ENTRY (balanced) ============
CREATE OR REPLACE FUNCTION public.create_journal_entry(
  _brand_id uuid,
  _entry_date date,
  _description text,
  _lines jsonb,
  _source_type text DEFAULT NULL,
  _source_id uuid DEFAULT NULL,
  _status text DEFAULT 'posted'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _entry_id uuid;
  _entry_no text;
  _line jsonb;
  _total_debit numeric := 0;
  _total_credit numeric := 0;
  _line_count int := 0;
  _locked_until date;
  _seq bigint;
  _acc_brand uuid;
BEGIN
  IF NOT (public.has_role(_user,'admin'::public.app_role) OR public.has_role(_user,'operations'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- period lock check
  SELECT locked_until INTO _locked_until FROM erp_period_locks WHERE brand_id=_brand_id;
  IF _locked_until IS NOT NULL AND _entry_date <= _locked_until THEN
    RAISE EXCEPTION 'Period is locked until %', _locked_until;
  END IF;

  -- validate lines
  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'At least 2 lines required';
  END IF;

  FOR _line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    _line_count := _line_count + 1;
    _total_debit  := _total_debit  + COALESCE((_line->>'debit')::numeric, 0);
    _total_credit := _total_credit + COALESCE((_line->>'credit')::numeric, 0);

    -- validate account belongs to same brand
    SELECT brand_id INTO _acc_brand FROM erp_chart_accounts WHERE id = (_line->>'account_id')::uuid;
    IF _acc_brand IS NULL OR _acc_brand <> _brand_id THEN
      RAISE EXCEPTION 'Account does not belong to brand';
    END IF;
  END LOOP;

  IF round(_total_debit, 2) <> round(_total_credit, 2) THEN
    RAISE EXCEPTION 'Entry not balanced: debit=% credit=%', _total_debit, _total_credit;
  END IF;
  IF _total_debit = 0 THEN
    RAISE EXCEPTION 'Entry total cannot be zero';
  END IF;

  -- generate entry_no: JE-YYYYMM-#####
  SELECT COUNT(*) + 1 INTO _seq FROM erp_journal_entries
    WHERE brand_id=_brand_id AND to_char(entry_date,'YYYYMM') = to_char(_entry_date,'YYYYMM');
  _entry_no := 'JE-' || to_char(_entry_date,'YYYYMM') || '-' || lpad(_seq::text, 5, '0');

  INSERT INTO erp_journal_entries (brand_id, entry_no, entry_date, description, source_type, source_id, status, created_by)
  VALUES (_brand_id, _entry_no, _entry_date, _description, _source_type, _source_id, _status, _user)
  RETURNING id INTO _entry_id;

  INSERT INTO erp_journal_lines (brand_id, journal_entry_id, account_id, debit, credit, description, line_order)
  SELECT _brand_id, _entry_id, (l->>'account_id')::uuid,
         COALESCE((l->>'debit')::numeric, 0),
         COALESCE((l->>'credit')::numeric, 0),
         l->>'description',
         (row_number() OVER ())::int
  FROM jsonb_array_elements(_lines) l;

  RETURN _entry_id;
END;
$$;

-- ============ 8. VOID JOURNAL ENTRY ============
CREATE OR REPLACE FUNCTION public.void_journal_entry(_entry_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _brand uuid; _date date; _locked date;
BEGIN
  IF NOT public.has_role(_user,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admin can void';
  END IF;
  SELECT brand_id, entry_date INTO _brand, _date FROM erp_journal_entries WHERE id=_entry_id;
  IF _brand IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
  SELECT locked_until INTO _locked FROM erp_period_locks WHERE brand_id=_brand;
  IF _locked IS NOT NULL AND _date <= _locked THEN RAISE EXCEPTION 'Period locked'; END IF;

  UPDATE erp_journal_entries
    SET status='void', description = COALESCE(description,'') || E'\n[VOID] ' || COALESCE(_reason,''), updated_at=now()
  WHERE id=_entry_id;
END;
$$;

-- ============ 9. REPORTS ============
CREATE OR REPLACE FUNCTION public.get_trial_balance(_brand_id uuid, _as_of date)
RETURNS TABLE(account_id uuid, code text, name text, account_type text, normal_balance text, total_debit numeric, total_credit numeric, balance numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.code, a.name, a.account_type, a.normal_balance,
         COALESCE(SUM(l.debit),0) + CASE WHEN a.normal_balance='debit' THEN a.opening_balance ELSE 0 END AS total_debit,
         COALESCE(SUM(l.credit),0) + CASE WHEN a.normal_balance='credit' THEN a.opening_balance ELSE 0 END AS total_credit,
         CASE WHEN a.normal_balance='debit'
              THEN (COALESCE(SUM(l.debit),0) - COALESCE(SUM(l.credit),0)) + a.opening_balance
              ELSE (COALESCE(SUM(l.credit),0) - COALESCE(SUM(l.debit),0)) + a.opening_balance
         END AS balance
  FROM erp_chart_accounts a
  LEFT JOIN erp_journal_lines l ON l.account_id=a.id AND l.brand_id=_brand_id
  LEFT JOIN erp_journal_entries e ON e.id=l.journal_entry_id AND e.status='posted' AND e.entry_date <= _as_of AND e.deleted_at IS NULL
  WHERE a.brand_id=_brand_id AND a.is_archived=false
  GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance, a.opening_balance
  ORDER BY a.code;
$$;

CREATE OR REPLACE FUNCTION public.get_pl_v2(_brand_id uuid, _from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _income jsonb; _expense jsonb;
  _total_income numeric := 0; _total_expense numeric := 0;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',amount) ORDER BY code), '[]'::jsonb), COALESCE(SUM(amount),0)
    INTO _income, _total_income
  FROM (
    SELECT a.code, a.name, COALESCE(SUM(l.credit - l.debit),0) AS amount
    FROM erp_chart_accounts a
    LEFT JOIN erp_journal_lines l ON l.account_id=a.id
    LEFT JOIN erp_journal_entries e ON e.id=l.journal_entry_id AND e.status='posted' AND e.entry_date BETWEEN _from AND _to AND e.deleted_at IS NULL
    WHERE a.brand_id=_brand_id AND a.account_type='income' AND a.is_archived=false
    GROUP BY a.id, a.code, a.name HAVING COALESCE(SUM(l.credit - l.debit),0) <> 0
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',amount) ORDER BY code), '[]'::jsonb), COALESCE(SUM(amount),0)
    INTO _expense, _total_expense
  FROM (
    SELECT a.code, a.name, COALESCE(SUM(l.debit - l.credit),0) AS amount
    FROM erp_chart_accounts a
    LEFT JOIN erp_journal_lines l ON l.account_id=a.id
    LEFT JOIN erp_journal_entries e ON e.id=l.journal_entry_id AND e.status='posted' AND e.entry_date BETWEEN _from AND _to AND e.deleted_at IS NULL
    WHERE a.brand_id=_brand_id AND a.account_type='expense' AND a.is_archived=false
    GROUP BY a.id, a.code, a.name HAVING COALESCE(SUM(l.debit - l.credit),0) <> 0
  ) s;

  RETURN jsonb_build_object(
    'income_accounts', _income,
    'expense_accounts', _expense,
    'total_income', _total_income,
    'total_expense', _total_expense,
    'net_profit', _total_income - _total_expense
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_balance_sheet(_brand_id uuid, _as_of date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _assets jsonb; _liab jsonb; _equity jsonb;
  _ta numeric:=0; _tl numeric:=0; _te numeric:=0;
  _retained numeric:=0;
BEGIN
  -- assets (normal debit)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',amount) ORDER BY code),'[]'::jsonb), COALESCE(SUM(amount),0)
  INTO _assets, _ta
  FROM (
    SELECT a.code, a.name,
      COALESCE(SUM(l.debit - l.credit),0) + a.opening_balance AS amount
    FROM erp_chart_accounts a
    LEFT JOIN erp_journal_lines l ON l.account_id=a.id
    LEFT JOIN erp_journal_entries e ON e.id=l.journal_entry_id AND e.status='posted' AND e.entry_date <= _as_of AND e.deleted_at IS NULL
    WHERE a.brand_id=_brand_id AND a.account_type='asset' AND a.is_archived=false
    GROUP BY a.id, a.code, a.name, a.opening_balance
    HAVING COALESCE(SUM(l.debit - l.credit),0) + a.opening_balance <> 0
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',amount) ORDER BY code),'[]'::jsonb), COALESCE(SUM(amount),0)
  INTO _liab, _tl
  FROM (
    SELECT a.code, a.name,
      COALESCE(SUM(l.credit - l.debit),0) + a.opening_balance AS amount
    FROM erp_chart_accounts a
    LEFT JOIN erp_journal_lines l ON l.account_id=a.id
    LEFT JOIN erp_journal_entries e ON e.id=l.journal_entry_id AND e.status='posted' AND e.entry_date <= _as_of AND e.deleted_at IS NULL
    WHERE a.brand_id=_brand_id AND a.account_type='liability' AND a.is_archived=false
    GROUP BY a.id, a.code, a.name, a.opening_balance
    HAVING COALESCE(SUM(l.credit - l.debit),0) + a.opening_balance <> 0
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('code',code,'name',name,'amount',amount) ORDER BY code),'[]'::jsonb), COALESCE(SUM(amount),0)
  INTO _equity, _te
  FROM (
    SELECT a.code, a.name,
      COALESCE(SUM(CASE WHEN a.normal_balance='credit' THEN l.credit - l.debit ELSE l.debit - l.credit END),0) + a.opening_balance AS amount
    FROM erp_chart_accounts a
    LEFT JOIN erp_journal_lines l ON l.account_id=a.id
    LEFT JOIN erp_journal_entries e ON e.id=l.journal_entry_id AND e.status='posted' AND e.entry_date <= _as_of AND e.deleted_at IS NULL
    WHERE a.brand_id=_brand_id AND a.account_type='equity' AND a.is_archived=false
    GROUP BY a.id, a.code, a.name, a.opening_balance, a.normal_balance
    HAVING COALESCE(SUM(CASE WHEN a.normal_balance='credit' THEN l.credit - l.debit ELSE l.debit - l.credit END),0) + a.opening_balance <> 0
  ) s;

  -- retained earnings = income - expense up to as_of
  SELECT
    COALESCE(SUM(CASE WHEN a.account_type='income' THEN l.credit - l.debit ELSE 0 END),0) -
    COALESCE(SUM(CASE WHEN a.account_type='expense' THEN l.debit - l.credit ELSE 0 END),0)
  INTO _retained
  FROM erp_chart_accounts a
  JOIN erp_journal_lines l ON l.account_id=a.id
  JOIN erp_journal_entries e ON e.id=l.journal_entry_id AND e.status='posted' AND e.entry_date <= _as_of AND e.deleted_at IS NULL
  WHERE a.brand_id=_brand_id AND a.account_type IN ('income','expense');

  _te := _te + _retained;

  RETURN jsonb_build_object(
    'assets', _assets,
    'liabilities', _liab,
    'equity', _equity,
    'total_assets', _ta,
    'total_liabilities', _tl,
    'total_equity', _te,
    'retained_earnings', _retained,
    'balanced', round(_ta,2) = round(_tl + _te, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_general_ledger(_brand_id uuid, _account_id uuid, _from date, _to date)
RETURNS TABLE(entry_date date, entry_no text, description text, debit numeric, credit numeric, running_balance numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _normal text; _opening numeric;
BEGIN
  SELECT normal_balance, opening_balance INTO _normal, _opening FROM erp_chart_accounts WHERE id=_account_id AND brand_id=_brand_id;
  IF _normal IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;

  RETURN QUERY
  WITH ordered AS (
    SELECT e.entry_date, e.entry_no, COALESCE(l.description, e.description) AS description, l.debit, l.credit,
           ROW_NUMBER() OVER (ORDER BY e.entry_date, e.created_at, l.line_order) AS rn
    FROM erp_journal_lines l
    JOIN erp_journal_entries e ON e.id=l.journal_entry_id
    WHERE l.account_id=_account_id AND e.status='posted' AND e.deleted_at IS NULL
      AND e.entry_date BETWEEN _from AND _to
  )
  SELECT o.entry_date, o.entry_no, o.description, o.debit, o.credit,
    _opening + SUM(CASE WHEN _normal='debit' THEN o.debit - o.credit ELSE o.credit - o.debit END) OVER (ORDER BY o.rn) AS running_balance
  FROM ordered o;
END;
$$;
