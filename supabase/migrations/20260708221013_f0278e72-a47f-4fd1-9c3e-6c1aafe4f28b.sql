CREATE TABLE IF NOT EXISTS public.meta_dollar_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ad_account_id uuid NOT NULL REFERENCES public.mkt_ad_accounts(id) ON DELETE RESTRICT,
  paid_from_account_id uuid NOT NULL REFERENCES public.erp_accounts(id) ON DELETE RESTRICT,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  usd_amount numeric(14,2) NOT NULL CHECK (usd_amount > 0),
  usd_rate numeric(12,4) NOT NULL CHECK (usd_rate > 0),
  fee_bdt numeric(14,2) NOT NULL DEFAULT 0 CHECK (fee_bdt >= 0),
  bdt_amount numeric(16,2) GENERATED ALWAYS AS (ROUND(usd_amount * usd_rate, 2)) STORED,
  total_bdt numeric(16,2) GENERATED ALWAYS AS (ROUND(usd_amount * usd_rate, 2) + fee_bdt) STORED,
  effective_rate numeric(12,6) GENERATED ALWAYS AS (((usd_amount * usd_rate) + fee_bdt) / usd_amount) STORED,
  payment_method text,
  reference text,
  supplier_name text,
  note text,
  attachment_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','cancelled')),
  confirmed_at timestamptz,
  confirmed_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_dollar_purchases TO authenticated;
GRANT ALL ON public.meta_dollar_purchases TO service_role;
ALTER TABLE public.meta_dollar_purchases ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_mdp_ad_account ON public.meta_dollar_purchases(ad_account_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_mdp_brand ON public.meta_dollar_purchases(brand_id);
CREATE INDEX IF NOT EXISTS idx_mdp_status ON public.meta_dollar_purchases(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_transactions_meta_dollar_purchase
  ON public.erp_transactions (reference_id)
  WHERE reference_type = 'meta_dollar_purchase';

DROP POLICY IF EXISTS "mdp_brand_access" ON public.meta_dollar_purchases;
CREATE POLICY "mdp_brand_access" ON public.meta_dollar_purchases FOR ALL TO authenticated
USING (
  brand_id IS NULL
  OR EXISTS (SELECT 1 FROM public.user_brand_access uba WHERE uba.user_id = auth.uid() AND uba.brand_id = meta_dollar_purchases.brand_id)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  brand_id IS NULL
  OR EXISTS (SELECT 1 FROM public.user_brand_access uba WHERE uba.user_id = auth.uid() AND uba.brand_id = meta_dollar_purchases.brand_id)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE TABLE IF NOT EXISTS public.meta_fifo_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.mkt_ad_accounts(id) ON DELETE CASCADE,
  purchase_id uuid REFERENCES public.meta_dollar_purchases(id) ON DELETE CASCADE,
  lot_date date NOT NULL,
  usd_total numeric(14,2) NOT NULL CHECK (usd_total > 0),
  usd_remaining numeric(14,4) NOT NULL CHECK (usd_remaining >= 0),
  effective_rate numeric(12,6) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_fifo_lots TO authenticated;
GRANT ALL ON public.meta_fifo_lots TO service_role;
ALTER TABLE public.meta_fifo_lots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fifo_consume ON public.meta_fifo_lots(ad_account_id, lot_date, created_at) WHERE is_active AND usd_remaining > 0;
CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_fifo_lots_purchase_id
  ON public.meta_fifo_lots (purchase_id)
  WHERE purchase_id IS NOT NULL;

DROP POLICY IF EXISTS "fifo_read" ON public.meta_fifo_lots;
DROP POLICY IF EXISTS "fifo_admin_write" ON public.meta_fifo_lots;
CREATE POLICY "fifo_read" ON public.meta_fifo_lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "fifo_admin_write" ON public.meta_fifo_lots FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.meta_ad_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.mkt_ad_accounts(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  entry_type text NOT NULL CHECK (entry_type IN ('purchase','spend','refund','adjustment','opening')),
  usd_delta numeric(14,4) NOT NULL,
  bdt_value numeric(16,4) NOT NULL DEFAULT 0,
  rate_used numeric(12,6),
  source_purchase_id uuid REFERENCES public.meta_dollar_purchases(id) ON DELETE SET NULL,
  source_spend_ref text,
  balance_usd_after numeric(14,4),
  conversion_source text DEFAULT 'fifo' CHECK (conversion_source IN ('fifo','fx_fallback','manual')),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ad_wallet_ledger TO authenticated;
GRANT ALL ON public.meta_ad_wallet_ledger TO service_role;
ALTER TABLE public.meta_ad_wallet_ledger ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_wallet_acc_date ON public.meta_ad_wallet_ledger(ad_account_id, entry_date DESC, created_at DESC);

DROP POLICY IF EXISTS "wallet_read" ON public.meta_ad_wallet_ledger;
DROP POLICY IF EXISTS "wallet_admin_write" ON public.meta_ad_wallet_ledger;
CREATE POLICY "wallet_read" ON public.meta_ad_wallet_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY "wallet_admin_write" ON public.meta_ad_wallet_ledger FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.meta_spend_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.mkt_ad_accounts(id) ON DELETE CASCADE,
  insight_id uuid REFERENCES public.mkt_insights_daily(id) ON DELETE CASCADE,
  spend_ref text NOT NULL,
  usd_spend_recorded numeric(14,4) NOT NULL DEFAULT 0,
  usd_consumed numeric(14,4) NOT NULL DEFAULT 0,
  bdt_cost numeric(16,4) NOT NULL DEFAULT 0,
  conversion_source text NOT NULL DEFAULT 'fifo',
  lots_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, spend_ref)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_spend_consumptions TO authenticated;
GRANT ALL ON public.meta_spend_consumptions TO service_role;
ALTER TABLE public.meta_spend_consumptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_spend_consump_acc ON public.meta_spend_consumptions(ad_account_id);

DROP POLICY IF EXISTS "spend_consump_read" ON public.meta_spend_consumptions;
DROP POLICY IF EXISTS "spend_consump_admin_write" ON public.meta_spend_consumptions;
CREATE POLICY "spend_consump_read" ON public.meta_spend_consumptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "spend_consump_admin_write" ON public.meta_spend_consumptions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_mdp_updated ON public.meta_dollar_purchases;
CREATE TRIGGER trg_mdp_updated BEFORE UPDATE ON public.meta_dollar_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_spend_consump_updated ON public.meta_spend_consumptions;
CREATE TRIGGER trg_spend_consump_updated BEFORE UPDATE ON public.meta_spend_consumptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.v_meta_ad_wallet_summary AS
SELECT
  a.id AS ad_account_id,
  a.name AS ad_account_name,
  a.external_id,
  a.brand_id,
  b.name AS brand_name,
  COALESCE(SUM(CASE WHEN l.entry_type = 'purchase' THEN l.usd_delta ELSE 0 END), 0) AS total_usd_purchased,
  COALESCE(ABS(SUM(CASE WHEN l.entry_type = 'spend' THEN l.usd_delta ELSE 0 END)), 0) AS total_usd_spent,
  COALESCE(SUM(l.usd_delta), 0) AS remaining_usd,
  COALESCE(SUM(CASE WHEN l.entry_type = 'purchase' THEN l.bdt_value ELSE 0 END), 0) AS total_bdt_paid,
  COALESCE(ABS(SUM(CASE WHEN l.entry_type = 'spend' THEN l.bdt_value ELSE 0 END)), 0) AS total_bdt_spent,
  CASE
    WHEN COALESCE(SUM(CASE WHEN l.entry_type = 'purchase' THEN l.usd_delta ELSE 0 END), 0) > 0
    THEN COALESCE(SUM(CASE WHEN l.entry_type = 'purchase' THEN l.bdt_value ELSE 0 END), 0)
      / NULLIF(SUM(CASE WHEN l.entry_type = 'purchase' THEN l.usd_delta ELSE 0 END), 0)
  END AS avg_effective_rate,
  (
    SELECT p.effective_rate
    FROM public.meta_dollar_purchases p
    WHERE p.ad_account_id = a.id AND p.status = 'confirmed'
    ORDER BY p.purchase_date DESC, p.created_at DESC
    LIMIT 1
  ) AS latest_purchase_rate
FROM public.mkt_ad_accounts a
LEFT JOIN public.brands b ON b.id = a.brand_id
LEFT JOIN public.meta_ad_wallet_ledger l ON l.ad_account_id = a.id
GROUP BY a.id, a.name, a.external_id, a.brand_id, b.name;
GRANT SELECT ON public.v_meta_ad_wallet_summary TO authenticated;
GRANT ALL ON public.v_meta_ad_wallet_summary TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_meta_dollar_purchase(_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p public.meta_dollar_purchases;
  acc public.erp_accounts;
  ad_brand uuid;
  resolved_brand uuid;
  allow_negative boolean := false;
  new_balance numeric;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF NOT (
    public.has_role(v_user, 'admin'::public.app_role)
    OR public.has_role(v_user, 'accountant'::public.app_role)
    OR public.has_role(v_user, 'operations'::public.app_role)
    OR public.has_role(v_user, 'marketing_manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO p FROM public.meta_dollar_purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'Purchase already %', p.status; END IF;

  SELECT * INTO acc FROM public.erp_accounts WHERE id = p.paid_from_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paid-from account not found'; END IF;

  SELECT brand_id INTO ad_brand FROM public.mkt_ad_accounts WHERE id = p.ad_account_id;
  resolved_brand := COALESCE(p.brand_id, acc.brand_id, ad_brand, (SELECT id FROM public.brands WHERE is_active = true ORDER BY name LIMIT 1));
  IF resolved_brand IS NULL THEN RAISE EXCEPTION 'Brand not found for this purchase'; END IF;

  SELECT COALESCE((config->>'allow_negative_account')::boolean, false) INTO allow_negative
    FROM public.erp_settings WHERE brand_id = resolved_brand LIMIT 1;

  IF NOT allow_negative AND acc.current_balance < p.total_bdt THEN
    RAISE EXCEPTION 'Insufficient balance in % (have %, need %)', acc.name, acc.current_balance, p.total_bdt;
  END IF;

  INSERT INTO public.erp_transactions (brand_id, txn_type, account_id, amount, reference_type, reference_id,
                                       description, transaction_date, created_by, attachment_url)
  VALUES (resolved_brand, 'expense', acc.id, p.total_bdt,
          'meta_dollar_purchase', p.id,
          'Meta USD funding $' || p.usd_amount || ' @ ' || p.usd_rate,
          p.purchase_date, v_user, p.attachment_url);

  INSERT INTO public.meta_fifo_lots (ad_account_id, purchase_id, lot_date, usd_total, usd_remaining, effective_rate)
  VALUES (p.ad_account_id, p.id, p.purchase_date, p.usd_amount, p.usd_amount, p.effective_rate);

  INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                            rate_used, source_purchase_id, conversion_source, note,
                                            balance_usd_after, created_by)
  VALUES (p.ad_account_id, p.purchase_date, 'purchase', p.usd_amount, p.total_bdt,
          p.effective_rate, p.id, 'fifo', 'Dollar purchase confirmed',
          (SELECT COALESCE(SUM(usd_delta),0) + p.usd_amount FROM public.meta_ad_wallet_ledger WHERE ad_account_id = p.ad_account_id),
          v_user);

  UPDATE public.meta_dollar_purchases
     SET status='confirmed', confirmed_at=now(), confirmed_by=v_user
   WHERE id = p.id;

  SELECT current_balance INTO new_balance FROM public.erp_accounts WHERE id = acc.id;

  INSERT INTO public.erp_finance_audit (brand_id, actor_id, action, entity_type, entity_id, after_data)
  VALUES (resolved_brand, v_user, 'confirm', 'meta_dollar_purchase', p.id,
          jsonb_build_object('usd', p.usd_amount, 'rate', p.usd_rate, 'fee', p.fee_bdt, 'total_bdt', p.total_bdt));

  RETURN jsonb_build_object('ok', true, 'new_account_balance', new_balance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_meta_dollar_purchase(_purchase_id uuid, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p public.meta_dollar_purchases;
  lot public.meta_fifo_lots;
  consumed numeric := 0;
  v_deleted integer := 0;
  v_user uuid := auth.uid();
  ad_brand uuid;
  acc_brand uuid;
  resolved_brand uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF NOT (
    public.has_role(v_user, 'admin'::public.app_role)
    OR public.has_role(v_user, 'accountant'::public.app_role)
    OR public.has_role(v_user, 'operations'::public.app_role)
    OR public.has_role(v_user, 'marketing_manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO p FROM public.meta_dollar_purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF p.status = 'cancelled' THEN RAISE EXCEPTION 'Already cancelled'; END IF;

  SELECT brand_id INTO ad_brand FROM public.mkt_ad_accounts WHERE id = p.ad_account_id;
  SELECT brand_id INTO acc_brand FROM public.erp_accounts WHERE id = p.paid_from_account_id;
  resolved_brand := COALESCE(p.brand_id, acc_brand, ad_brand, (SELECT id FROM public.brands WHERE is_active = true ORDER BY name LIMIT 1));

  IF p.status = 'confirmed' THEN
    SELECT * INTO lot FROM public.meta_fifo_lots WHERE purchase_id = p.id FOR UPDATE;
    consumed := COALESCE(lot.usd_total - lot.usd_remaining, 0);
    IF consumed > 0 THEN
      RAISE EXCEPTION 'Cannot cancel: $% already consumed by Meta spend. Create an adjustment instead.', consumed;
    END IF;

    DELETE FROM public.erp_transactions
     WHERE reference_type = 'meta_dollar_purchase'
       AND reference_id = p.id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted = 0 THEN
      UPDATE public.erp_accounts
         SET current_balance = current_balance + p.total_bdt,
             updated_at = now()
       WHERE id = p.paid_from_account_id;
    END IF;

    UPDATE public.meta_fifo_lots
       SET is_active=false, usd_remaining=0
     WHERE purchase_id = p.id;

    INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                              source_purchase_id, conversion_source, note, balance_usd_after, created_by)
    VALUES (p.ad_account_id, CURRENT_DATE, 'adjustment', -p.usd_amount, -p.total_bdt,
            p.id, 'manual', 'Cancellation reversal',
            (SELECT COALESCE(SUM(usd_delta),0) - p.usd_amount FROM public.meta_ad_wallet_ledger WHERE ad_account_id=p.ad_account_id),
            v_user);
  END IF;

  UPDATE public.meta_dollar_purchases
     SET status='cancelled', cancelled_at=now(), cancelled_by=v_user, cancel_reason=_reason
   WHERE id = p.id;

  INSERT INTO public.erp_finance_audit (brand_id, actor_id, action, entity_type, entity_id, after_data)
  VALUES (resolved_brand, v_user, 'cancel', 'meta_dollar_purchase', p.id,
          jsonb_build_object('reason', _reason));

  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.adjust_meta_dollar_purchase(_purchase_id uuid, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p public.meta_dollar_purchases;
  lot public.meta_fifo_lots;
  remaining_usd numeric := 0;
  refund_bdt numeric := 0;
  eff_rate numeric := 0;
  resolved_brand uuid;
  ad_brand uuid;
  acc_brand uuid;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF NOT (
    public.has_role(v_user, 'admin'::public.app_role)
    OR public.has_role(v_user, 'accountant'::public.app_role)
    OR public.has_role(v_user, 'operations'::public.app_role)
    OR public.has_role(v_user, 'marketing_manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO p FROM public.meta_dollar_purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF p.status <> 'confirmed' THEN RAISE EXCEPTION 'Only confirmed purchases can be adjusted'; END IF;

  SELECT brand_id INTO ad_brand FROM public.mkt_ad_accounts WHERE id = p.ad_account_id;
  SELECT brand_id INTO acc_brand FROM public.erp_accounts WHERE id = p.paid_from_account_id;
  resolved_brand := COALESCE(p.brand_id, acc_brand, ad_brand, (SELECT id FROM public.brands WHERE is_active = true ORDER BY name LIMIT 1));

  SELECT * INTO lot FROM public.meta_fifo_lots WHERE purchase_id = p.id FOR UPDATE;
  IF FOUND THEN
    remaining_usd := COALESCE(lot.usd_remaining, 0);
    eff_rate := COALESCE(lot.effective_rate, p.effective_rate, p.usd_rate);
  END IF;

  refund_bdt := ROUND(remaining_usd * eff_rate, 2);

  IF refund_bdt > 0 THEN
    INSERT INTO public.erp_transactions (brand_id, txn_type, account_id, amount, reference_type, reference_id,
                                         description, transaction_date, created_by)
    VALUES (resolved_brand, 'income', p.paid_from_account_id, refund_bdt,
            'meta_dollar_purchase_adjust', p.id,
            'Adjust Meta USD funding — refund unspent $' || remaining_usd || ' @ ' || eff_rate || COALESCE(' · ' || _reason, ''),
            CURRENT_DATE, v_user);
  END IF;

  IF lot.id IS NOT NULL THEN
    UPDATE public.meta_fifo_lots
       SET usd_remaining = 0, is_active = false
     WHERE id = lot.id;
  END IF;

  IF remaining_usd > 0 THEN
    INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                              rate_used, source_purchase_id, conversion_source, note,
                                              balance_usd_after, created_by)
    VALUES (p.ad_account_id, CURRENT_DATE, 'adjustment', -remaining_usd, -refund_bdt,
            eff_rate, p.id, 'manual',
            'Adjustment write-off' || COALESCE(' · ' || _reason, ''),
            (SELECT COALESCE(SUM(usd_delta),0) - remaining_usd FROM public.meta_ad_wallet_ledger WHERE ad_account_id = p.ad_account_id),
            v_user);
  END IF;

  UPDATE public.meta_dollar_purchases
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_user,
         cancel_reason = COALESCE(_reason, 'Adjusted / written off')
   WHERE id = p.id;

  INSERT INTO public.erp_finance_audit (brand_id, actor_id, action, entity_type, entity_id, after_data)
  VALUES (resolved_brand, v_user, 'adjust', 'meta_dollar_purchase', p.id,
          jsonb_build_object('remaining_usd', remaining_usd, 'refund_bdt', refund_bdt, 'reason', _reason));

  RETURN jsonb_build_object('ok', true, 'remaining_usd', remaining_usd, 'refund_bdt', refund_bdt);
END;
$function$;

CREATE OR REPLACE FUNCTION public.consume_meta_spend_fifo(
  _ad_account_id uuid, _spend_ref text, _usd_spend numeric, _spend_date date, _insight_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  existing public.meta_spend_consumptions;
  delta numeric;
  remaining_to_consume numeric;
  lot RECORD;
  take numeric;
  total_bdt numeric := 0;
  lots_used jsonb := '[]'::jsonb;
  fallback_rate numeric;
  conversion text := 'fifo';
  bal numeric;
BEGIN
  IF _usd_spend IS NULL OR _usd_spend < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid spend');
  END IF;

  SELECT * INTO existing FROM public.meta_spend_consumptions
    WHERE ad_account_id=_ad_account_id AND spend_ref=_spend_ref FOR UPDATE;

  delta := _usd_spend - COALESCE(existing.usd_spend_recorded, 0);
  IF delta = 0 THEN RETURN jsonb_build_object('ok', true, 'noop', true); END IF;

  IF delta < 0 THEN
    INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                              source_spend_ref, conversion_source, note, balance_usd_after)
    VALUES (_ad_account_id, _spend_date, 'adjustment', -delta, 0,
            _spend_ref, 'manual', 'Spend decreased — manual review',
            (SELECT COALESCE(SUM(usd_delta),0) + (-delta) FROM public.meta_ad_wallet_ledger WHERE ad_account_id=_ad_account_id));
    UPDATE public.meta_spend_consumptions SET usd_spend_recorded=_usd_spend, updated_at=now() WHERE id = existing.id;
    RETURN jsonb_build_object('ok', true, 'decreased', true, 'delta', delta);
  END IF;

  remaining_to_consume := delta;
  FOR lot IN
    SELECT * FROM public.meta_fifo_lots
     WHERE ad_account_id=_ad_account_id AND is_active AND usd_remaining > 0
     ORDER BY lot_date ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN remaining_to_consume <= 0;
    take := LEAST(lot.usd_remaining, remaining_to_consume);
    UPDATE public.meta_fifo_lots SET usd_remaining = usd_remaining - take WHERE id = lot.id;
    total_bdt := total_bdt + (take * lot.effective_rate);
    lots_used := lots_used || jsonb_build_array(jsonb_build_object('lot_id', lot.id, 'usd', take, 'rate', lot.effective_rate));
    remaining_to_consume := remaining_to_consume - take;
  END LOOP;

  IF remaining_to_consume > 0 THEN
    SELECT CASE WHEN SUM(usd_amount) > 0 THEN SUM(total_bdt)/SUM(usd_amount) END
      INTO fallback_rate
      FROM public.meta_dollar_purchases
     WHERE ad_account_id = _ad_account_id AND status = 'confirmed';

    IF fallback_rate IS NULL OR fallback_rate <= 0 THEN
      SELECT rate INTO fallback_rate FROM public.erp_fx_rates
        WHERE from_ccy='USD' AND to_ccy='BDT'
        ORDER BY rate_date DESC LIMIT 1;
    END IF;

    fallback_rate := COALESCE(fallback_rate, 0);
    IF fallback_rate <= 0 THEN
      RAISE EXCEPTION 'No USD->BDT rate available for ad account %. Add a Dollar Purchase or FX rate first.', _ad_account_id;
    END IF;

    total_bdt := total_bdt + (remaining_to_consume * fallback_rate);
    lots_used := lots_used || jsonb_build_array(jsonb_build_object('fallback_usd', remaining_to_consume, 'rate', fallback_rate));
    conversion := 'fx_fallback';
    remaining_to_consume := 0;
  END IF;

  SELECT COALESCE(SUM(usd_delta),0) - delta INTO bal FROM public.meta_ad_wallet_ledger WHERE ad_account_id=_ad_account_id;
  INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                            source_spend_ref, conversion_source, note, balance_usd_after)
  VALUES (_ad_account_id, _spend_date, 'spend', -delta, -total_bdt,
          _spend_ref, conversion,
          CASE WHEN conversion='fx_fallback' THEN 'FIFO + FX fallback' ELSE 'FIFO consumed' END,
          bal);

  IF existing.id IS NULL THEN
    INSERT INTO public.meta_spend_consumptions (ad_account_id, insight_id, spend_ref, usd_spend_recorded,
                                                usd_consumed, bdt_cost, conversion_source, lots_used)
    VALUES (_ad_account_id, _insight_id, _spend_ref, _usd_spend, delta, total_bdt, conversion, lots_used);
  ELSE
    UPDATE public.meta_spend_consumptions
       SET usd_spend_recorded=_usd_spend,
           usd_consumed = usd_consumed + delta,
           bdt_cost = bdt_cost + total_bdt,
           conversion_source = conversion,
           lots_used = lots_used || existing.lots_used,
           updated_at = now()
     WHERE id = existing.id;
  END IF;

  UPDATE public.mkt_insights_daily
     SET spend_bdt_fifo = total_bdt,
         estimated_bdt_cost = (conversion <> 'fifo')
   WHERE id = _insight_id;

  RETURN jsonb_build_object('ok', true, 'delta_usd', delta, 'bdt_cost', total_bdt, 'conversion', conversion);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.confirm_meta_dollar_purchase(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_meta_dollar_purchase(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.adjust_meta_dollar_purchase(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consume_meta_spend_fifo(uuid, text, numeric, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_meta_dollar_purchase(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_meta_dollar_purchase(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_meta_dollar_purchase(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_meta_spend_fifo(uuid, text, numeric, date, uuid) TO authenticated, service_role;