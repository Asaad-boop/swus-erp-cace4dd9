
-- ============ EXTEND crm_customer_meta ============
ALTER TABLE public.crm_customer_meta
  ADD COLUMN IF NOT EXISTS rfm_score numeric,
  ADD COLUMN IF NOT EXISTS rfm_recency int,
  ADD COLUMN IF NOT EXISTS rfm_frequency int,
  ADD COLUMN IF NOT EXISTS rfm_monetary numeric,
  ADD COLUMN IF NOT EXISTS rfm_recency_score int,
  ADD COLUMN IF NOT EXISTS rfm_frequency_score int,
  ADD COLUMN IF NOT EXISTS rfm_monetary_score int,
  ADD COLUMN IF NOT EXISTS rfm_segment text,
  ADD COLUMN IF NOT EXISTS churn_risk text,
  ADD COLUMN IF NOT EXISTS churn_score numeric,
  ADD COLUMN IF NOT EXISTS last_rfm_calculated_at timestamptz,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS merged_into text,
  ADD COLUMN IF NOT EXISTS is_merged boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_crm_meta_rfm_segment ON public.crm_customer_meta(rfm_segment);
CREATE INDEX IF NOT EXISTS idx_crm_meta_churn_risk ON public.crm_customer_meta(churn_risk);
CREATE INDEX IF NOT EXISTS idx_crm_meta_is_merged ON public.crm_customer_meta(is_merged);

-- ============ crm_activities ============
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_key text NOT NULL,
  brand_id uuid,
  type text NOT NULL CHECK (type IN ('note','call','whatsapp','email','order','tag','status_change','task_complete','sms')),
  title text,
  body text,
  direction text CHECK (direction IN ('inbound','outbound') OR direction IS NULL),
  duration_seconds int,
  whatsapp_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_customer ON public.crm_activities(customer_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_brand ON public.crm_activities(brand_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON public.crm_activities(type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_activities TO service_role;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage crm_activities" ON public.crm_activities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ crm_tasks ============
CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_key text NOT NULL,
  brand_id uuid,
  title text NOT NULL,
  description text,
  due_date timestamptz,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','snoozed','cancelled')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_customer ON public.crm_tasks(customer_key);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status_due ON public.crm_tasks(status, due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned ON public.crm_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_brand ON public.crm_tasks(brand_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tasks TO authenticated;
GRANT ALL ON public.crm_tasks TO service_role;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage crm_tasks" ON public.crm_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ crm_saved_filters ============
CREATE TABLE IF NOT EXISTS public.crm_saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_saved_filters_brand ON public.crm_saved_filters(brand_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_saved_filters TO authenticated;
GRANT ALL ON public.crm_saved_filters TO service_role;
ALTER TABLE public.crm_saved_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage crm_saved_filters" ON public.crm_saved_filters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ crm_custom_field_definitions ============
CREATE TABLE IF NOT EXISTS public.crm_custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid,
  label text NOT NULL,
  field_key text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','date','boolean','select')),
  options jsonb,
  is_required boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, field_key)
);
CREATE INDEX IF NOT EXISTS idx_crm_cfd_brand ON public.crm_custom_field_definitions(brand_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_custom_field_definitions TO authenticated;
GRANT ALL ON public.crm_custom_field_definitions TO service_role;
ALTER TABLE public.crm_custom_field_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage crm_custom_field_definitions" ON public.crm_custom_field_definitions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.crm_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_crm_activities_touch ON public.crm_activities;
CREATE TRIGGER trg_crm_activities_touch BEFORE UPDATE ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

DROP TRIGGER IF EXISTS trg_crm_tasks_touch ON public.crm_tasks;
CREATE TRIGGER trg_crm_tasks_touch BEFORE UPDATE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

DROP TRIGGER IF EXISTS trg_crm_saved_filters_touch ON public.crm_saved_filters;
CREATE TRIGGER trg_crm_saved_filters_touch BEFORE UPDATE ON public.crm_saved_filters
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

DROP TRIGGER IF EXISTS trg_crm_cfd_touch ON public.crm_custom_field_definitions;
CREATE TRIGGER trg_crm_cfd_touch BEFORE UPDATE ON public.crm_custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ============ RFM calculation function ============
CREATE OR REPLACE FUNCTION public.calculate_rfm_all_brands()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  WITH base AS (
    SELECT
      customer_key,
      COALESCE(orders_count, 0)::int AS freq,
      COALESCE(lifetime_value, 0)::numeric AS mon,
      CASE WHEN last_order_at IS NOT NULL
           THEN GREATEST(0, EXTRACT(DAY FROM v_now - last_order_at)::int)
           ELSE 9999 END AS rec_days
    FROM public.crm_customers_v
    WHERE customer_key IS NOT NULL
  ),
  scored AS (
    SELECT
      customer_key, freq, mon, rec_days,
      CASE WHEN rec_days <= 7 THEN 5
           WHEN rec_days <= 30 THEN 4
           WHEN rec_days <= 60 THEN 3
           WHEN rec_days <= 120 THEN 2
           ELSE 1 END AS r_score,
      CASE WHEN freq >= 10 THEN 5
           WHEN freq >= 5 THEN 4
           WHEN freq >= 3 THEN 3
           WHEN freq >= 2 THEN 2
           ELSE 1 END AS f_score,
      NTILE(5) OVER (ORDER BY mon) AS m_score
    FROM base
  ),
  enriched AS (
    SELECT
      customer_key, freq, mon, rec_days, r_score, f_score, m_score,
      ROUND(((r_score + f_score + m_score)::numeric / 3.0), 2) AS rfm_avg,
      CASE
        WHEN r_score >= 4 AND f_score >= 4 THEN 'champion'
        WHEN r_score >= 3 AND f_score >= 3 THEN 'loyal'
        WHEN r_score <= 2 AND f_score >= 3 THEN 'at_risk'
        WHEN r_score = 1 AND f_score >= 2 THEN 'lost'
        WHEN f_score = 1 AND r_score >= 4 THEN 'new'
        ELSE 'potential'
      END AS segment,
      LEAST(100, GREATEST(0,
        (LEAST(rec_days, 180)::numeric / 180.0) * 60
        + (CASE WHEN freq > 0 THEN (1.0 / freq) ELSE 1 END) * 30
        + (CASE WHEN m_score = 1 THEN 10 WHEN m_score = 2 THEN 5 ELSE 0 END)
      ))::numeric AS churn_sc
    FROM scored
  )
  INSERT INTO public.crm_customer_meta AS m
    (customer_key, status, rfm_score, rfm_recency, rfm_frequency, rfm_monetary,
     rfm_recency_score, rfm_frequency_score, rfm_monetary_score,
     rfm_segment, churn_score, churn_risk, last_rfm_calculated_at, updated_at)
  SELECT
    customer_key, 'active', rfm_avg, rec_days, freq, mon,
    r_score, f_score, m_score, segment, churn_sc,
    CASE WHEN churn_sc > 65 THEN 'high' WHEN churn_sc > 35 THEN 'medium' ELSE 'low' END,
    v_now, v_now
  FROM enriched
  ON CONFLICT (customer_key) DO UPDATE SET
    rfm_score = EXCLUDED.rfm_score,
    rfm_recency = EXCLUDED.rfm_recency,
    rfm_frequency = EXCLUDED.rfm_frequency,
    rfm_monetary = EXCLUDED.rfm_monetary,
    rfm_recency_score = EXCLUDED.rfm_recency_score,
    rfm_frequency_score = EXCLUDED.rfm_frequency_score,
    rfm_monetary_score = EXCLUDED.rfm_monetary_score,
    rfm_segment = EXCLUDED.rfm_segment,
    churn_score = EXCLUDED.churn_score,
    churn_risk = EXCLUDED.churn_risk,
    last_rfm_calculated_at = EXCLUDED.last_rfm_calculated_at,
    updated_at = EXCLUDED.updated_at;
END $$;

GRANT EXECUTE ON FUNCTION public.calculate_rfm_all_brands() TO authenticated, service_role;

-- ============ Cron jobs ============
-- nightly RFM at 2 AM
SELECT cron.unschedule('rfm-calculate') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rfm-calculate');
SELECT cron.schedule('rfm-calculate', '0 2 * * *', $$SELECT public.calculate_rfm_all_brands();$$);

-- MV refresh every 6 hours
SELECT cron.unschedule('refresh-crm-mv') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-crm-mv');
SELECT cron.schedule('refresh-crm-mv', '0 */6 * * *', $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.crm_customers_mv;$$);
