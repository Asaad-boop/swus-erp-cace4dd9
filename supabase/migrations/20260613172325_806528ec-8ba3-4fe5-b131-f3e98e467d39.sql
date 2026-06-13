
CREATE TABLE IF NOT EXISTS public.erp_courier_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'pathao',
  base_url text,
  client_id text,
  client_secret text,
  username text,
  password text,
  store_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_courier_settings TO authenticated;
GRANT ALL ON public.erp_courier_settings TO service_role;

ALTER TABLE public.erp_courier_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manages courier settings"
  ON public.erp_courier_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Operations can read courier settings"
  ON public.erp_courier_settings FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'operations'::public.app_role)
  );

CREATE TRIGGER trg_erp_courier_settings_updated
  BEFORE UPDATE ON public.erp_courier_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
