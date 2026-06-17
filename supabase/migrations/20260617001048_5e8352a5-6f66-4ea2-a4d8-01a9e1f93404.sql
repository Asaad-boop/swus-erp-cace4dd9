CREATE TABLE IF NOT EXISTS public.imp_cargo_agent_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.imp_cargo_agents(id) ON DELETE CASCADE,
  rate_date date NOT NULL DEFAULT CURRENT_DATE,
  shipping_rate_per_kg_bdt numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'CNY',
  fx_rate numeric(12,4) NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_cargo_rates_agent_date ON public.imp_cargo_agent_rates(agent_id, rate_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imp_cargo_agent_rates TO authenticated;
GRANT ALL ON public.imp_cargo_agent_rates TO service_role;

ALTER TABLE public.imp_cargo_agent_rates ENABLE ROW LEVEL SECURITY;

-- Cargo agent: only their own rates
CREATE POLICY "Cargo agent view own rates"
  ON public.imp_cargo_agent_rates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.imp_cargo_agents a
      WHERE a.id = imp_cargo_agent_rates.agent_id
        AND a.user_id = auth.uid()
    )
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'operations')
    OR has_role(auth.uid(), 'accountant')
  );

CREATE POLICY "Cargo agent insert own rates"
  ON public.imp_cargo_agent_rates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.imp_cargo_agents a
      WHERE a.id = imp_cargo_agent_rates.agent_id
        AND a.user_id = auth.uid()
    )
    OR has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Cargo agent update own rates"
  ON public.imp_cargo_agent_rates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.imp_cargo_agents a
      WHERE a.id = imp_cargo_agent_rates.agent_id
        AND a.user_id = auth.uid()
    )
    OR has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admin delete rates"
  ON public.imp_cargo_agent_rates FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_cargo_rates_updated_at
  BEFORE UPDATE ON public.imp_cargo_agent_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();