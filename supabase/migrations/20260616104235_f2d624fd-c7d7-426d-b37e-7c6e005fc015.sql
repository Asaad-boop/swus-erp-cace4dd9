
-- ============ Recurring rules ============
CREATE TABLE public.erp_recurring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly')),
  interval_n int NOT NULL DEFAULT 1 CHECK (interval_n > 0),
  start_date date NOT NULL,
  next_run_date date NOT NULL,
  end_date date,
  amount numeric NOT NULL CHECK (amount > 0),
  lines jsonb NOT NULL,
  auto_post boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_recurring_rules_brand_next ON public.erp_recurring_rules(brand_id, next_run_date) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_recurring_rules TO authenticated;
GRANT ALL ON public.erp_recurring_rules TO service_role;
ALTER TABLE public.erp_recurring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance staff manage recurring rules" ON public.erp_recurring_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));

CREATE TRIGGER trg_recurring_rules_updated BEFORE UPDATE ON public.erp_recurring_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.erp_recurring_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.erp_recurring_rules(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL,
  run_date date NOT NULL,
  journal_entry_id uuid REFERENCES public.erp_journal_entries(id),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','failed','skipped')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_recurring_runs_rule ON public.erp_recurring_runs(rule_id, run_date);

GRANT SELECT, INSERT ON public.erp_recurring_runs TO authenticated;
GRANT ALL ON public.erp_recurring_runs TO service_role;
ALTER TABLE public.erp_recurring_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance staff view recurring runs" ON public.erp_recurring_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));

-- ============ Budgets ============
CREATE TABLE public.erp_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.erp_chart_accounts(id) ON DELETE CASCADE,
  month date NOT NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, account_id, month)
);
CREATE INDEX idx_budgets_brand_month ON public.erp_budgets(brand_id, month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_budgets TO authenticated;
GRANT ALL ON public.erp_budgets TO service_role;
ALTER TABLE public.erp_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance staff manage budgets" ON public.erp_budgets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));

CREATE TRIGGER trg_budgets_updated BEFORE UPDATE ON public.erp_budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Statement imports & lines (reconciliation) ============
CREATE TABLE public.erp_statement_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.erp_chart_accounts(id),
  source text NOT NULL,
  period_start date,
  period_end date,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  total_lines int NOT NULL DEFAULT 0,
  matched_lines int NOT NULL DEFAULT 0
);
CREATE INDEX idx_statement_imports_brand ON public.erp_statement_imports(brand_id, imported_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_statement_imports TO authenticated;
GRANT ALL ON public.erp_statement_imports TO service_role;
ALTER TABLE public.erp_statement_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance staff manage statement imports" ON public.erp_statement_imports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));

CREATE TABLE public.erp_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.erp_statement_imports(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.erp_chart_accounts(id),
  txn_date date NOT NULL,
  description text,
  reference_no text,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  matched_line_id uuid REFERENCES public.erp_journal_lines(id),
  matched_at timestamptz,
  matched_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_statement_lines_import ON public.erp_statement_lines(import_id);
CREATE INDEX idx_statement_lines_unmatched ON public.erp_statement_lines(brand_id, account_id) WHERE matched_line_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_statement_lines TO authenticated;
GRANT ALL ON public.erp_statement_lines TO service_role;
ALTER TABLE public.erp_statement_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance staff manage statement lines" ON public.erp_statement_lines
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));

-- ============ RPC: advance date by frequency ============
CREATE OR REPLACE FUNCTION public._advance_date(_d date, _freq text, _n int)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _freq
    WHEN 'daily'   THEN _d + (_n || ' days')::interval
    WHEN 'weekly'  THEN _d + (_n * 7 || ' days')::interval
    WHEN 'monthly' THEN _d + (_n || ' months')::interval
    WHEN 'yearly'  THEN _d + (_n || ' years')::interval
  END::date;
$$;

-- ============ RPC: run recurring rules ============
CREATE OR REPLACE FUNCTION public.run_recurring_rules(_brand_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := auth.uid();
  _rule record;
  _today date := CURRENT_DATE;
  _je_id uuid;
  _posted int := 0;
  _failed int := 0;
  _next date;
BEGIN
  IF _user IS NOT NULL AND NOT (public.has_role(_user,'admin'::public.app_role) OR public.has_role(_user,'operations'::public.app_role) OR public.has_role(_user,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR _rule IN
    SELECT * FROM erp_recurring_rules
    WHERE is_active = true AND auto_post = true
      AND next_run_date <= _today
      AND (end_date IS NULL OR next_run_date <= end_date)
      AND (_brand_id IS NULL OR brand_id = _brand_id)
  LOOP
    BEGIN
      _je_id := public.create_journal_entry(
        _rule.brand_id, _rule.next_run_date,
        COALESCE(_rule.description, _rule.name),
        _rule.lines,
        'recurring', _rule.id, 'posted'
      );
      INSERT INTO erp_recurring_runs (rule_id, brand_id, run_date, journal_entry_id, status)
      VALUES (_rule.id, _rule.brand_id, _rule.next_run_date, _je_id, 'posted');

      _next := public._advance_date(_rule.next_run_date, _rule.frequency, _rule.interval_n);
      UPDATE erp_recurring_rules SET next_run_date = _next, last_run_at = now() WHERE id = _rule.id;
      _posted := _posted + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO erp_recurring_runs (rule_id, brand_id, run_date, status, error)
      VALUES (_rule.id, _rule.brand_id, _rule.next_run_date, 'failed', SQLERRM);
      _failed := _failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('posted', _posted, 'failed', _failed, 'date', _today);
END;
$$;

-- ============ RPC: manual match a statement line to a journal line ============
CREATE OR REPLACE FUNCTION public.match_statement_line(_line_id uuid, _journal_line_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := auth.uid();
  _sline record;
  _jline record;
BEGIN
  IF NOT (public.has_role(_user,'admin'::public.app_role) OR public.has_role(_user,'operations'::public.app_role) OR public.has_role(_user,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO _sline FROM erp_statement_lines WHERE id = _line_id;
  IF _sline.id IS NULL THEN RAISE EXCEPTION 'Statement line not found'; END IF;

  SELECT * INTO _jline FROM erp_journal_lines WHERE id = _journal_line_id;
  IF _jline.id IS NULL THEN RAISE EXCEPTION 'Journal line not found'; END IF;
  IF _jline.brand_id <> _sline.brand_id THEN RAISE EXCEPTION 'Brand mismatch'; END IF;
  IF _jline.account_id <> _sline.account_id THEN RAISE EXCEPTION 'Account mismatch'; END IF;

  UPDATE erp_statement_lines
    SET matched_line_id = _journal_line_id, matched_at = now(), matched_by = _user
    WHERE id = _line_id;

  UPDATE erp_statement_imports
    SET matched_lines = (SELECT COUNT(*) FROM erp_statement_lines WHERE import_id = _sline.import_id AND matched_line_id IS NOT NULL)
    WHERE id = _sline.import_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unmatch_statement_line(_line_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := auth.uid();
  _imp uuid;
BEGIN
  IF NOT (public.has_role(_user,'admin'::public.app_role) OR public.has_role(_user,'operations'::public.app_role) OR public.has_role(_user,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE erp_statement_lines
    SET matched_line_id = NULL, matched_at = NULL, matched_by = NULL
    WHERE id = _line_id
    RETURNING import_id INTO _imp;

  IF _imp IS NOT NULL THEN
    UPDATE erp_statement_imports
      SET matched_lines = (SELECT COUNT(*) FROM erp_statement_lines WHERE import_id = _imp AND matched_line_id IS NOT NULL)
      WHERE id = _imp;
  END IF;
END;
$$;
