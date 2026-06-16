
-- Add cargo_agent role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cargo_agent';

-- Add pending_review status for agent-submitted POs awaiting importer approval
ALTER TYPE public.imp_po_status ADD VALUE IF NOT EXISTS 'pending_review' BEFORE 'ordered';

-- Link cargo agent record to an auth user (portal login)
ALTER TABLE public.imp_cargo_agents
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS imp_cargo_agents_user_id_uq
  ON public.imp_cargo_agents(user_id)
  WHERE user_id IS NOT NULL;

-- Carton: release request tracking (agent requests, importer approves)
ALTER TABLE public.imp_cartons
  ADD COLUMN IF NOT EXISTS release_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS release_requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS release_request_note text;

-- PO: track who submitted (for audit when agent submits)
ALTER TABLE public.imp_purchase_orders
  ADD COLUMN IF NOT EXISTS submitted_by_agent_id uuid REFERENCES public.imp_cargo_agents(id) ON DELETE SET NULL;
