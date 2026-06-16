
CREATE TABLE public.erp_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.erp_suppliers(id) ON DELETE RESTRICT,
  bill_no text NOT NULL,
  bill_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  amount numeric NOT NULL CHECK (amount > 0),
  paid_amount numeric NOT NULL DEFAULT 0,
  expense_account_id uuid REFERENCES public.erp_chart_accounts(id),
  ap_account_id uuid REFERENCES public.erp_chart_accounts(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','paid','void')),
  description text,
  source_type text,
  source_id uuid,
  journal_entry_id uuid REFERENCES public.erp_journal_entries(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_erp_bills_brand_supplier ON public.erp_bills(brand_id, supplier_id);
CREATE INDEX idx_erp_bills_status ON public.erp_bills(brand_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_bills TO authenticated;
GRANT ALL ON public.erp_bills TO service_role;
ALTER TABLE public.erp_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance staff manage bills" ON public.erp_bills
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));

CREATE TRIGGER trg_erp_bills_updated BEFORE UPDATE ON public.erp_bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.erp_bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  bill_id uuid NOT NULL REFERENCES public.erp_bills(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL CHECK (amount > 0),
  cash_account_id uuid NOT NULL REFERENCES public.erp_chart_accounts(id),
  reference_no text,
  notes text,
  journal_entry_id uuid REFERENCES public.erp_journal_entries(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bill_payments_bill ON public.erp_bill_payments(bill_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_bill_payments TO authenticated;
GRANT ALL ON public.erp_bill_payments TO service_role;
ALTER TABLE public.erp_bill_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance staff manage bill payments" ON public.erp_bill_payments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));

CREATE TABLE public.erp_ar_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL CHECK (amount > 0),
  cash_account_id uuid NOT NULL REFERENCES public.erp_chart_accounts(id),
  ar_account_id uuid REFERENCES public.erp_chart_accounts(id),
  reference_no text,
  notes text,
  journal_entry_id uuid REFERENCES public.erp_journal_entries(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ar_payments_order ON public.erp_ar_payments(order_id);
CREATE INDEX idx_ar_payments_brand_date ON public.erp_ar_payments(brand_id, payment_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_ar_payments TO authenticated;
GRANT ALL ON public.erp_ar_payments TO service_role;
ALTER TABLE public.erp_ar_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance staff manage ar payments" ON public.erp_ar_payments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'operations'::public.app_role) OR public.has_role(auth.uid(),'accountant'::public.app_role));

CREATE OR REPLACE FUNCTION public.create_bill(
  _brand_id uuid, _supplier_id uuid, _bill_no text, _bill_date date, _due_date date,
  _amount numeric, _expense_account_id uuid, _ap_account_id uuid, _description text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := auth.uid();
  _bill_id uuid;
  _je_id uuid;
BEGIN
  IF NOT (public.has_role(_user,'admin'::public.app_role) OR public.has_role(_user,'operations'::public.app_role) OR public.has_role(_user,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

  INSERT INTO erp_bills (brand_id, supplier_id, bill_no, bill_date, due_date, amount, expense_account_id, ap_account_id, description, created_by)
  VALUES (_brand_id, _supplier_id, _bill_no, _bill_date, _due_date, _amount, _expense_account_id, _ap_account_id, _description, _user)
  RETURNING id INTO _bill_id;

  _je_id := public.create_journal_entry(
    _brand_id, _bill_date, COALESCE(_description, 'Bill ' || _bill_no),
    jsonb_build_array(
      jsonb_build_object('account_id', _expense_account_id, 'debit', _amount, 'credit', 0, 'description', 'Bill ' || _bill_no),
      jsonb_build_object('account_id', _ap_account_id, 'debit', 0, 'credit', _amount, 'description', 'Bill ' || _bill_no)
    ),
    'bill', _bill_id, 'posted'
  );

  UPDATE erp_bills SET journal_entry_id = _je_id WHERE id = _bill_id;
  RETURN _bill_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_bill_payment(
  _bill_id uuid, _amount numeric, _cash_account_id uuid,
  _payment_date date DEFAULT CURRENT_DATE, _reference_no text DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := auth.uid();
  _bill record;
  _pay_id uuid;
  _je_id uuid;
  _new_paid numeric;
  _new_status text;
BEGIN
  IF NOT (public.has_role(_user,'admin'::public.app_role) OR public.has_role(_user,'operations'::public.app_role) OR public.has_role(_user,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO _bill FROM erp_bills WHERE id = _bill_id FOR UPDATE;
  IF _bill.id IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF _bill.status = 'void' THEN RAISE EXCEPTION 'Bill is void'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;
  IF _bill.paid_amount + _amount > _bill.amount + 0.01 THEN
    RAISE EXCEPTION 'Payment exceeds outstanding (% remaining)', _bill.amount - _bill.paid_amount;
  END IF;
  IF _bill.ap_account_id IS NULL THEN RAISE EXCEPTION 'Bill has no A/P account set'; END IF;

  INSERT INTO erp_bill_payments (brand_id, bill_id, payment_date, amount, cash_account_id, reference_no, notes, created_by)
  VALUES (_bill.brand_id, _bill_id, _payment_date, _amount, _cash_account_id, _reference_no, _notes, _user)
  RETURNING id INTO _pay_id;

  _je_id := public.create_journal_entry(
    _bill.brand_id, _payment_date, 'Payment for bill ' || _bill.bill_no,
    jsonb_build_array(
      jsonb_build_object('account_id', _bill.ap_account_id, 'debit', _amount, 'credit', 0, 'description', 'Bill payment'),
      jsonb_build_object('account_id', _cash_account_id, 'debit', 0, 'credit', _amount, 'description', 'Bill payment')
    ),
    'bill_payment', _pay_id, 'posted'
  );

  UPDATE erp_bill_payments SET journal_entry_id = _je_id WHERE id = _pay_id;
  _new_paid := _bill.paid_amount + _amount;
  _new_status := CASE WHEN _new_paid >= _bill.amount - 0.01 THEN 'paid' ELSE 'partial' END;
  UPDATE erp_bills SET paid_amount = _new_paid, status = _new_status WHERE id = _bill_id;

  RETURN _pay_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ar_payment(
  _order_id uuid, _amount numeric, _cash_account_id uuid, _ar_account_id uuid,
  _payment_date date DEFAULT CURRENT_DATE, _reference_no text DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := auth.uid();
  _ord record;
  _pay_id uuid;
  _je_id uuid;
BEGIN
  IF NOT (public.has_role(_user,'admin'::public.app_role) OR public.has_role(_user,'operations'::public.app_role) OR public.has_role(_user,'accountant'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id, brand_id, total INTO _ord FROM orders WHERE id = _order_id;
  IF _ord.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

  INSERT INTO erp_ar_payments (brand_id, order_id, payment_date, amount, cash_account_id, ar_account_id, reference_no, notes, created_by)
  VALUES (_ord.brand_id, _order_id, _payment_date, _amount, _cash_account_id, _ar_account_id, _reference_no, _notes, _user)
  RETURNING id INTO _pay_id;

  _je_id := public.create_journal_entry(
    _ord.brand_id, _payment_date, 'Customer payment for order ' || _order_id::text,
    jsonb_build_array(
      jsonb_build_object('account_id', _cash_account_id, 'debit', _amount, 'credit', 0, 'description', 'AR collection'),
      jsonb_build_object('account_id', _ar_account_id, 'debit', 0, 'credit', _amount, 'description', 'AR collection')
    ),
    'ar_payment', _pay_id, 'posted'
  );

  UPDATE erp_ar_payments SET journal_entry_id = _je_id WHERE id = _pay_id;
  RETURN _pay_id;
END;
$$;

CREATE OR REPLACE VIEW public.v_ar_outstanding
WITH (security_invoker = true) AS
SELECT
  o.id AS order_id,
  o.brand_id,
  COALESCE(o.guest_name, o.shipping_name, 'Customer') AS customer_name,
  COALESCE(o.guest_phone, o.shipping_phone) AS customer_phone,
  o.created_at::date AS invoice_date,
  o.total AS invoice_amount,
  COALESCE(o.advance_amount, 0) + COALESCE(o.partial_amount, 0) AS prepaid,
  COALESCE((SELECT SUM(amount) FROM erp_ar_payments p WHERE p.order_id = o.id), 0) AS paid,
  (o.total - COALESCE(o.advance_amount,0) - COALESCE(o.partial_amount,0)
    - COALESCE((SELECT SUM(amount) FROM erp_ar_payments p WHERE p.order_id = o.id), 0)) AS outstanding,
  GREATEST(0, EXTRACT(DAY FROM (now() - o.created_at))::int) AS age_days,
  o.status::text AS order_status,
  o.payment_status,
  o.payment_method
FROM orders o
WHERE o.status::text NOT IN ('cancelled','returned')
  AND (o.total - COALESCE(o.advance_amount,0) - COALESCE(o.partial_amount,0)
       - COALESCE((SELECT SUM(amount) FROM erp_ar_payments p WHERE p.order_id = o.id), 0)) > 0.01;

GRANT SELECT ON public.v_ar_outstanding TO authenticated;

CREATE OR REPLACE VIEW public.v_ap_outstanding
WITH (security_invoker = true) AS
SELECT
  b.id AS bill_id, b.brand_id, b.supplier_id, s.name AS supplier_name,
  b.bill_no, b.bill_date, b.due_date, b.amount, b.paid_amount,
  (b.amount - b.paid_amount) AS outstanding, b.status,
  CASE WHEN b.due_date IS NULL THEN GREATEST(0, EXTRACT(DAY FROM (now() - b.bill_date::timestamptz))::int)
       ELSE GREATEST(0, EXTRACT(DAY FROM (now() - b.due_date::timestamptz))::int) END AS age_days
FROM erp_bills b
JOIN erp_suppliers s ON s.id = b.supplier_id
WHERE b.status IN ('open','partial');

GRANT SELECT ON public.v_ap_outstanding TO authenticated;
