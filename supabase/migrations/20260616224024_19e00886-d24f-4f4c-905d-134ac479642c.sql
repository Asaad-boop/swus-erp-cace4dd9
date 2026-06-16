
-- Helper: return current user's linked cargo_agent id (NULL if not a cargo agent or not linked)
CREATE OR REPLACE FUNCTION public.current_cargo_agent_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.imp_cargo_agents
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.current_cargo_agent_id() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_cargo_agent_id() TO authenticated;

-- ============= imp_cargo_agents: agent can view own row =============
DROP POLICY IF EXISTS "Cargo agent views own profile" ON public.imp_cargo_agents;
CREATE POLICY "Cargo agent views own profile"
ON public.imp_cargo_agents FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'cargo_agent'::app_role)
  AND id = public.current_cargo_agent_id()
);

DROP POLICY IF EXISTS "Cargo agent updates own profile" ON public.imp_cargo_agents;
CREATE POLICY "Cargo agent updates own profile"
ON public.imp_cargo_agents FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'cargo_agent'::app_role)
  AND id = public.current_cargo_agent_id()
)
WITH CHECK (
  has_role(auth.uid(), 'cargo_agent'::app_role)
  AND id = public.current_cargo_agent_id()
);

-- ============= imp_purchase_orders =============
DROP POLICY IF EXISTS "Cargo agent reads own POs" ON public.imp_purchase_orders;
CREATE POLICY "Cargo agent reads own POs"
ON public.imp_purchase_orders FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'cargo_agent'::app_role)
  AND cargo_agent_id = public.current_cargo_agent_id()
);

DROP POLICY IF EXISTS "Cargo agent inserts own POs" ON public.imp_purchase_orders;
CREATE POLICY "Cargo agent inserts own POs"
ON public.imp_purchase_orders FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'cargo_agent'::app_role)
  AND cargo_agent_id = public.current_cargo_agent_id()
  AND status = 'pending_review'::imp_po_status
  AND paid_bdt = 0
);

DROP POLICY IF EXISTS "Cargo agent updates own POs" ON public.imp_purchase_orders;
CREATE POLICY "Cargo agent updates own POs"
ON public.imp_purchase_orders FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'cargo_agent'::app_role)
  AND cargo_agent_id = public.current_cargo_agent_id()
  AND status IN ('pending_review'::imp_po_status, 'ordered'::imp_po_status, 'at_china_warehouse'::imp_po_status, 'in_transit'::imp_po_status)
)
WITH CHECK (
  cargo_agent_id = public.current_cargo_agent_id()
);

-- ============= imp_cartons =============
DROP POLICY IF EXISTS "Cargo agent reads own cartons" ON public.imp_cartons;
CREATE POLICY "Cargo agent reads own cartons"
ON public.imp_cartons FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'cargo_agent'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.imp_purchase_orders po
    WHERE po.id = imp_cartons.po_id
      AND po.cargo_agent_id = public.current_cargo_agent_id()
  )
);

DROP POLICY IF EXISTS "Cargo agent inserts own cartons" ON public.imp_cartons;
CREATE POLICY "Cargo agent inserts own cartons"
ON public.imp_cartons FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'cargo_agent'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.imp_purchase_orders po
    WHERE po.id = imp_cartons.po_id
      AND po.cargo_agent_id = public.current_cargo_agent_id()
  )
);

DROP POLICY IF EXISTS "Cargo agent updates own cartons" ON public.imp_cartons;
CREATE POLICY "Cargo agent updates own cartons"
ON public.imp_cartons FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'cargo_agent'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.imp_purchase_orders po
    WHERE po.id = imp_cartons.po_id
      AND po.cargo_agent_id = public.current_cargo_agent_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.imp_purchase_orders po
    WHERE po.id = imp_cartons.po_id
      AND po.cargo_agent_id = public.current_cargo_agent_id()
  )
);

-- ============= imp_po_items =============
DROP POLICY IF EXISTS "Cargo agent reads own po items" ON public.imp_po_items;
CREATE POLICY "Cargo agent reads own po items"
ON public.imp_po_items FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'cargo_agent'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.imp_purchase_orders po
    WHERE po.id = imp_po_items.po_id
      AND po.cargo_agent_id = public.current_cargo_agent_id()
  )
);

DROP POLICY IF EXISTS "Cargo agent writes own po items" ON public.imp_po_items;
CREATE POLICY "Cargo agent writes own po items"
ON public.imp_po_items FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'cargo_agent'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.imp_purchase_orders po
    WHERE po.id = imp_po_items.po_id
      AND po.cargo_agent_id = public.current_cargo_agent_id()
      AND po.status = 'pending_review'::imp_po_status
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.imp_purchase_orders po
    WHERE po.id = imp_po_items.po_id
      AND po.cargo_agent_id = public.current_cargo_agent_id()
      AND po.status = 'pending_review'::imp_po_status
  )
);

-- ============= imp_payments: read-only for agent =============
DROP POLICY IF EXISTS "Cargo agent reads own payments" ON public.imp_payments;
CREATE POLICY "Cargo agent reads own payments"
ON public.imp_payments FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'cargo_agent'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.imp_purchase_orders po
    WHERE po.id = imp_payments.po_id
      AND po.cargo_agent_id = public.current_cargo_agent_id()
  )
);
