-- Cargo Agents (simplified, additive)
CREATE TABLE IF NOT EXISTS public.imp_cargo_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  phone text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS imp_cargo_agents_brand_idx ON public.imp_cargo_agents(brand_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imp_cargo_agents TO authenticated;
GRANT ALL ON public.imp_cargo_agents TO service_role;

ALTER TABLE public.imp_cargo_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view cargo agents" ON public.imp_cargo_agents;
CREATE POLICY "Staff view cargo agents" ON public.imp_cargo_agents
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'accountant'::public.app_role)
    OR public.has_role(auth.uid(),'operations'::public.app_role)
    OR public.has_role(auth.uid(),'warehouse_staff'::public.app_role)
    OR public.has_role(auth.uid(),'customer_service'::public.app_role)
  );

DROP POLICY IF EXISTS "Admin/ops manage cargo agents" ON public.imp_cargo_agents;
CREATE POLICY "Admin/ops manage cargo agents" ON public.imp_cargo_agents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'operations'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role)
      OR public.has_role(auth.uid(),'operations'::public.app_role));

DROP TRIGGER IF EXISTS imp_cargo_agents_updated_at ON public.imp_cargo_agents;
CREATE TRIGGER imp_cargo_agents_updated_at BEFORE UPDATE ON public.imp_cargo_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add cargo_agent_id to imp_purchase_orders (optional FK)
ALTER TABLE public.imp_purchase_orders
  ADD COLUMN IF NOT EXISTS cargo_agent_id uuid REFERENCES public.imp_cargo_agents(id);
CREATE INDEX IF NOT EXISTS imp_po_cargo_agent_idx ON public.imp_purchase_orders(cargo_agent_id);
