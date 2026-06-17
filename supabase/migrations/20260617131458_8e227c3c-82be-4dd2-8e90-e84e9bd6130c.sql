
ALTER TABLE public.imp_purchase_orders
  ADD COLUMN IF NOT EXISTS shipping_rate_per_kg_bdt numeric;

ALTER TABLE public.imp_payments
  ADD COLUMN IF NOT EXISTS agent_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS agent_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS agent_proof_url text,
  ADD COLUMN IF NOT EXISTS agent_proof_note text;

-- RLS: allow cargo agent to update payments of their PO (confirm + proof)
DROP POLICY IF EXISTS "Cargo agent can confirm own PO payments" ON public.imp_payments;
CREATE POLICY "Cargo agent can confirm own PO payments"
ON public.imp_payments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.imp_purchase_orders po
    JOIN public.imp_cargo_agents a ON a.id = po.cargo_agent_id
    WHERE po.id = imp_payments.po_id AND a.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.imp_purchase_orders po
    JOIN public.imp_cargo_agents a ON a.id = po.cargo_agent_id
    WHERE po.id = imp_payments.po_id AND a.user_id = auth.uid()
  )
);
