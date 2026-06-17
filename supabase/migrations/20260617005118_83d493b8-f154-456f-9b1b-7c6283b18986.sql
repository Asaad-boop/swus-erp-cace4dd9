
-- Direction enum
DO $$ BEGIN
  CREATE TYPE public.imp_agent_ledger_dir AS ENUM ('credit', 'debit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.imp_agent_ledger_kind AS ENUM ('deposit', 'payment', 'adjustment', 'refund', 'opening_balance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.imp_cargo_agent_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.imp_cargo_agents(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  direction public.imp_agent_ledger_dir NOT NULL,
  entry_type public.imp_agent_ledger_kind NOT NULL DEFAULT 'deposit',
  amount_bdt numeric(14,2) NOT NULL CHECK (amount_bdt > 0),
  po_id uuid REFERENCES public.imp_purchase_orders(id) ON DELETE SET NULL,
  carton_id uuid REFERENCES public.imp_cartons(id) ON DELETE SET NULL,
  reference text,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imp_cag_ledger_agent_date
  ON public.imp_cargo_agent_ledger (agent_id, entry_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imp_cargo_agent_ledger TO authenticated;
GRANT ALL ON public.imp_cargo_agent_ledger TO service_role;

ALTER TABLE public.imp_cargo_agent_ledger ENABLE ROW LEVEL SECURITY;

-- Finance staff: full access
CREATE POLICY "agent_ledger_finance_all"
  ON public.imp_cargo_agent_ledger FOR ALL TO authenticated
  USING (public.is_finance_staff(auth.uid()))
  WITH CHECK (public.is_finance_staff(auth.uid()));

-- Cargo agent: read own only
CREATE POLICY "agent_ledger_self_read"
  ON public.imp_cargo_agent_ledger FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'cargo_agent'::app_role)
    AND agent_id = public.current_cargo_agent_id()
  );

-- updated_at trigger
CREATE TRIGGER trg_imp_cag_ledger_updated_at
  BEFORE UPDATE ON public.imp_cargo_agent_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Balance helper
CREATE OR REPLACE FUNCTION public.get_cargo_agent_balance(_agent_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(
    CASE WHEN direction = 'credit' THEN amount_bdt ELSE -amount_bdt END
  ), 0)::numeric
  FROM public.imp_cargo_agent_ledger
  WHERE agent_id = _agent_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cargo_agent_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cargo_agent_balance(uuid) TO authenticated;
