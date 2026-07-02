
-- Follow-up tracking columns
ALTER TABLE public.abandoned_carts
  ADD COLUMN IF NOT EXISTS followup_status TEXT NOT NULL DEFAULT 'pending' CHECK (followup_status IN ('pending','contacted','responded','ignored')),
  ADD COLUMN IF NOT EXISTS followup_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_followup_channel TEXT;

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_followup ON public.abandoned_carts (followup_status, is_converted, updated_at DESC) WHERE is_converted = false;

-- Message history table
CREATE TABLE IF NOT EXISTS public.abandoned_cart_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES public.abandoned_carts(id) ON DELETE CASCADE,
  brand_id UUID,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','sms','manual','call')),
  message_body TEXT,
  sent_by UUID REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivery_status TEXT NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('sent','failed','delivered')),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_abandoned_cart_messages_cart ON public.abandoned_cart_messages (cart_id, sent_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.abandoned_cart_messages TO authenticated;
GRANT ALL ON public.abandoned_cart_messages TO service_role;

ALTER TABLE public.abandoned_cart_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view cart messages"
  ON public.abandoned_cart_messages FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'customer_service')
    OR public.has_role(auth.uid(), 'operations')
  );

CREATE POLICY "Staff can insert cart messages"
  ON public.abandoned_cart_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'customer_service')
    OR public.has_role(auth.uid(), 'operations')
  );

CREATE POLICY "Admins can delete cart messages"
  ON public.abandoned_cart_messages FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
