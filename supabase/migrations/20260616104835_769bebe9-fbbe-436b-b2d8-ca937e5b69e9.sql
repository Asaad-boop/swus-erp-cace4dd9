
-- Phase 4: Tax, Multi-currency, Audit

-- Tax rates
CREATE TABLE public.erp_tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  rate numeric(6,3) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('vat','tds','vds','other')),
  is_active boolean NOT NULL DEFAULT true,
  output_account_id uuid REFERENCES public.erp_chart_accounts(id),
  input_account_id uuid REFERENCES public.erp_chart_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_tax_rates TO authenticated;
GRANT ALL ON public.erp_tax_rates TO service_role;
ALTER TABLE public.erp_tax_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_rates_all" ON public.erp_tax_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations') OR public.has_role(auth.uid(),'accountant'));

-- Tax entries (per journal line tax record)
CREATE TABLE public.erp_tax_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  journal_entry_id uuid REFERENCES public.erp_journal_entries(id) ON DELETE CASCADE,
  tax_rate_id uuid NOT NULL REFERENCES public.erp_tax_rates(id),
  direction text NOT NULL CHECK (direction IN ('output','input')),
  taxable_amount numeric(18,2) NOT NULL,
  tax_amount numeric(18,2) NOT NULL,
  entry_date date NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_tax_entries TO authenticated;
GRANT ALL ON public.erp_tax_entries TO service_role;
ALTER TABLE public.erp_tax_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_entries_all" ON public.erp_tax_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations') OR public.has_role(auth.uid(),'accountant'));

CREATE INDEX idx_tax_entries_brand_date ON public.erp_tax_entries(brand_id, entry_date);

-- FX rates
CREATE TABLE public.erp_fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  from_ccy text NOT NULL,
  to_ccy text NOT NULL,
  rate numeric(18,6) NOT NULL,
  rate_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, from_ccy, to_ccy, rate_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_fx_rates TO authenticated;
GRANT ALL ON public.erp_fx_rates TO service_role;
ALTER TABLE public.erp_fx_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fx_rates_all" ON public.erp_fx_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operations') OR public.has_role(auth.uid(),'accountant'));

-- Audit log
CREATE TABLE public.erp_finance_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.erp_finance_audit TO authenticated;
GRANT ALL ON public.erp_finance_audit TO service_role;
ALTER TABLE public.erp_finance_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select" ON public.erp_finance_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant'));
CREATE POLICY "audit_insert" ON public.erp_finance_audit FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_audit_brand_date ON public.erp_finance_audit(brand_id, created_at DESC);

-- Trigger: capture journal entry changes
CREATE OR REPLACE FUNCTION public.log_journal_entry_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO public.erp_finance_audit(brand_id,actor_id,action,entity_type,entity_id,after_data)
    VALUES(NEW.brand_id,auth.uid(),'create','journal_entry',NEW.id,to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP='UPDATE' THEN
    INSERT INTO public.erp_finance_audit(brand_id,actor_id,action,entity_type,entity_id,before_data,after_data)
    VALUES(NEW.brand_id,auth.uid(),
      CASE WHEN NEW.status='void' AND OLD.status<>'void' THEN 'void' ELSE 'update' END,
      'journal_entry',NEW.id,to_jsonb(OLD),to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP='DELETE' THEN
    INSERT INTO public.erp_finance_audit(brand_id,actor_id,action,entity_type,entity_id,before_data)
    VALUES(OLD.brand_id,auth.uid(),'delete','journal_entry',OLD.id,to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_journal_audit ON public.erp_journal_entries;
CREATE TRIGGER trg_journal_audit
AFTER INSERT OR UPDATE OR DELETE ON public.erp_journal_entries
FOR EACH ROW EXECUTE FUNCTION public.log_journal_entry_audit();

-- VAT summary RPC
CREATE OR REPLACE FUNCTION public.get_vat_summary(p_brand uuid, p_from date, p_to date)
RETURNS TABLE(
  tax_code text, tax_name text, rate numeric,
  output_taxable numeric, output_tax numeric,
  input_taxable numeric, input_tax numeric,
  net_payable numeric
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    r.code, r.name, r.rate,
    COALESCE(SUM(CASE WHEN e.direction='output' THEN e.taxable_amount END),0),
    COALESCE(SUM(CASE WHEN e.direction='output' THEN e.tax_amount END),0),
    COALESCE(SUM(CASE WHEN e.direction='input' THEN e.taxable_amount END),0),
    COALESCE(SUM(CASE WHEN e.direction='input' THEN e.tax_amount END),0),
    COALESCE(SUM(CASE WHEN e.direction='output' THEN e.tax_amount ELSE -e.tax_amount END),0)
  FROM public.erp_tax_rates r
  LEFT JOIN public.erp_tax_entries e ON e.tax_rate_id=r.id
    AND e.brand_id=p_brand AND e.entry_date BETWEEN p_from AND p_to
  WHERE r.brand_id=p_brand
  GROUP BY r.code, r.name, r.rate
  ORDER BY r.code;
$$;

-- FX rate lookup
CREATE OR REPLACE FUNCTION public.get_fx_rate(p_brand uuid, p_from text, p_to text, p_date date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT rate FROM public.erp_fx_rates
  WHERE brand_id=p_brand AND from_ccy=p_from AND to_ccy=p_to AND rate_date<=p_date
  ORDER BY rate_date DESC LIMIT 1;
$$;
