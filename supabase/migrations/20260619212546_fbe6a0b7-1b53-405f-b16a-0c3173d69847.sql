
ALTER TABLE public.erp_accounts ADD COLUMN IF NOT EXISTS account_subtype text;

UPDATE public.erp_accounts SET account_subtype = account_type
WHERE account_subtype IS NULL AND account_type IN ('bkash','nagad','rocket','bank','cash');

INSERT INTO public.erp_accounts (brand_id, name, account_type, account_subtype, wallet_type, opening_balance, current_balance, is_active)
SELECT b.id, v.name, v.atype, v.subtype, v.wtype, 0, 0, true
FROM public.brands b
CROSS JOIN (VALUES
  ('bKash','bkash','bkash','mfs'),
  ('Nagad','nagad','nagad','mfs'),
  ('Cash in Hand','cash','cash','cash')
) AS v(name, atype, subtype, wtype)
WHERE NOT EXISTS (SELECT 1 FROM public.erp_accounts a WHERE a.brand_id = b.id AND a.account_subtype = v.subtype);

INSERT INTO public.erp_chart_accounts (brand_id, code, name, account_type, normal_balance, currency, is_active)
SELECT b.id, '1210', 'COD Receivable', 'asset', 'debit', 'BDT', true
FROM public.brands b
WHERE NOT EXISTS (SELECT 1 FROM public.erp_chart_accounts c WHERE c.brand_id = b.id AND (c.code = '1210' OR c.name ILIKE 'cod receivable%'));

CREATE TABLE IF NOT EXISTS public.erp_cod_remittances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  courier text NOT NULL,
  remittance_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  reference_no text,
  status text NOT NULL DEFAULT 'pending',
  received_date date,
  received_to uuid REFERENCES public.erp_accounts(id) ON DELETE SET NULL,
  notes text,
  expected_amount numeric,
  journal_entry_id uuid REFERENCES public.erp_journal_entries(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_cod_remittances TO authenticated;
GRANT ALL ON public.erp_cod_remittances TO service_role;
ALTER TABLE public.erp_cod_remittances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Brand members can manage cod remittances" ON public.erp_cod_remittances;
CREATE POLICY "Brand members can manage cod remittances"
ON public.erp_cod_remittances FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.user_brand_access uba WHERE uba.user_id = auth.uid() AND uba.brand_id = erp_cod_remittances.brand_id))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR EXISTS (SELECT 1 FROM public.user_brand_access uba WHERE uba.user_id = auth.uid() AND uba.brand_id = erp_cod_remittances.brand_id));

CREATE INDEX IF NOT EXISTS idx_cod_remit_brand_date ON public.erp_cod_remittances (brand_id, remittance_date DESC);
CREATE INDEX IF NOT EXISTS idx_cod_remit_status ON public.erp_cod_remittances (brand_id, status);

DROP TRIGGER IF EXISTS trg_cod_remit_updated ON public.erp_cod_remittances;
CREATE TRIGGER trg_cod_remit_updated BEFORE UPDATE ON public.erp_cod_remittances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.erp_tax_rates (brand_id, code, name, rate, kind, is_active)
SELECT b.id, v.code, v.name, v.rate, v.kind, true
FROM public.brands b
CROSS JOIN (VALUES
  ('VAT15','VAT 15% (BD Standard)',15.0,'vat'),
  ('VAT5','VAT 5% (BD Reduced)',5.0,'vat'),
  ('AIT5','AIT 5% (Source Tax)',5.0,'tds'),
  ('TDS10','TDS 10% (Service)',10.0,'tds')
) AS v(code, name, rate, kind)
WHERE NOT EXISTS (SELECT 1 FROM public.erp_tax_rates t WHERE t.brand_id = b.id AND t.code = v.code);
