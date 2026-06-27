
CREATE TABLE public.meta_dollar_purchases (
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
CREATE INDEX idx_mdp_ad_account ON public.meta_dollar_purchases(ad_account_id, purchase_date);
CREATE INDEX idx_mdp_brand ON public.meta_dollar_purchases(brand_id);
CREATE INDEX idx_mdp_status ON public.meta_dollar_purchases(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_dollar_purchases TO authenticated;
GRANT ALL ON public.meta_dollar_purchases TO service_role;
ALTER TABLE public.meta_dollar_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mdp_brand_access" ON public.meta_dollar_purchases FOR ALL TO authenticated
USING (brand_id IS NULL OR EXISTS (SELECT 1 FROM public.user_brand_access uba WHERE uba.user_id = auth.uid() AND uba.brand_id = meta_dollar_purchases.brand_id)
       OR public.has_role(auth.uid(),'admin'))
WITH CHECK (brand_id IS NULL OR EXISTS (SELECT 1 FROM public.user_brand_access uba WHERE uba.user_id = auth.uid() AND uba.brand_id = meta_dollar_purchases.brand_id)
       OR public.has_role(auth.uid(),'admin'));


CREATE TABLE public.meta_fifo_lots (
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
CREATE INDEX idx_fifo_consume ON public.meta_fifo_lots(ad_account_id, lot_date, created_at) WHERE is_active AND usd_remaining > 0;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_fifo_lots TO authenticated;
GRANT ALL ON public.meta_fifo_lots TO service_role;
ALTER TABLE public.meta_fifo_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fifo_read" ON public.meta_fifo_lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "fifo_admin_write" ON public.meta_fifo_lots FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));


CREATE TABLE public.meta_ad_wallet_ledger (
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
CREATE INDEX idx_wallet_acc_date ON public.meta_ad_wallet_ledger(ad_account_id, entry_date DESC, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ad_wallet_ledger TO authenticated;
GRANT ALL ON public.meta_ad_wallet_ledger TO service_role;
ALTER TABLE public.meta_ad_wallet_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet_read" ON public.meta_ad_wallet_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY "wallet_admin_write" ON public.meta_ad_wallet_ledger FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));


CREATE TABLE public.meta_spend_consumptions (
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
CREATE INDEX idx_spend_consump_acc ON public.meta_spend_consumptions(ad_account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_spend_consumptions TO authenticated;
GRANT ALL ON public.meta_spend_consumptions TO service_role;
ALTER TABLE public.meta_spend_consumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spend_consump_read" ON public.meta_spend_consumptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "spend_consump_admin_write" ON public.meta_spend_consumptions FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));


CREATE TRIGGER trg_mdp_updated BEFORE UPDATE ON public.meta_dollar_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_spend_consump_updated BEFORE UPDATE ON public.meta_spend_consumptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE OR REPLACE FUNCTION public.confirm_meta_dollar_purchase(_purchase_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.meta_dollar_purchases;
  acc public.erp_accounts;
  allow_negative boolean := false;
  new_balance numeric;
BEGIN
  SELECT * INTO p FROM public.meta_dollar_purchases WHERE id = _purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'Purchase already %', p.status; END IF;

  SELECT * INTO acc FROM public.erp_accounts WHERE id = p.paid_from_account_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paid-from account not found'; END IF;

  SELECT COALESCE((config->>'allow_negative_account')::boolean, false) INTO allow_negative
    FROM public.erp_settings WHERE brand_id = COALESCE(p.brand_id, acc.brand_id) LIMIT 1;

  IF NOT allow_negative AND acc.current_balance < p.total_bdt THEN
    RAISE EXCEPTION 'Insufficient balance in % (have %, need %)', acc.name, acc.current_balance, p.total_bdt;
  END IF;

  UPDATE public.erp_accounts SET current_balance = current_balance - p.total_bdt, updated_at = now() WHERE id = acc.id;
  new_balance := acc.current_balance - p.total_bdt;

  INSERT INTO public.erp_transactions (brand_id, txn_type, account_id, amount, reference_type, reference_id,
                                       description, transaction_date, created_by, attachment_url)
  VALUES (COALESCE(p.brand_id, acc.brand_id), 'expense', acc.id, p.total_bdt,
          'meta_dollar_purchase', p.id,
          'Meta USD funding $' || p.usd_amount || ' @ ' || p.usd_rate,
          p.purchase_date, auth.uid(), p.attachment_url);

  INSERT INTO public.meta_fifo_lots (ad_account_id, purchase_id, lot_date, usd_total, usd_remaining, effective_rate)
  VALUES (p.ad_account_id, p.id, p.purchase_date, p.usd_amount, p.usd_amount, p.effective_rate);

  INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                            rate_used, source_purchase_id, conversion_source, note,
                                            balance_usd_after, created_by)
  VALUES (p.ad_account_id, p.purchase_date, 'purchase', p.usd_amount, p.total_bdt,
          p.effective_rate, p.id, 'fifo', 'Dollar purchase confirmed',
          (SELECT COALESCE(SUM(usd_delta),0) + p.usd_amount FROM public.meta_ad_wallet_ledger WHERE ad_account_id = p.ad_account_id),
          auth.uid());

  UPDATE public.meta_dollar_purchases
     SET status='confirmed', confirmed_at=now(), confirmed_by=auth.uid()
   WHERE id = p.id;

  INSERT INTO public.erp_finance_audit (brand_id, actor_id, action, entity_type, entity_id, after_data)
  VALUES (p.brand_id, auth.uid(), 'confirm', 'meta_dollar_purchase', p.id,
          jsonb_build_object('usd', p.usd_amount, 'rate', p.usd_rate, 'fee', p.fee_bdt, 'total_bdt', p.total_bdt));

  RETURN jsonb_build_object('ok', true, 'new_account_balance', new_balance);
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_meta_dollar_purchase(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.cancel_meta_dollar_purchase(_purchase_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.meta_dollar_purchases;
  lot public.meta_fifo_lots;
  consumed numeric;
BEGIN
  SELECT * INTO p FROM public.meta_dollar_purchases WHERE id=_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF p.status = 'cancelled' THEN RAISE EXCEPTION 'Already cancelled'; END IF;

  IF p.status = 'confirmed' THEN
    SELECT * INTO lot FROM public.meta_fifo_lots WHERE purchase_id = p.id FOR UPDATE;
    consumed := COALESCE(lot.usd_total - lot.usd_remaining, 0);
    IF consumed > 0 THEN
      RAISE EXCEPTION 'Cannot cancel: $% already consumed by Meta spend. Create an adjustment instead.', consumed;
    END IF;

    UPDATE public.erp_accounts SET current_balance = current_balance + p.total_bdt, updated_at = now()
      WHERE id = p.paid_from_account_id;

    INSERT INTO public.erp_transactions (brand_id, txn_type, account_id, amount, reference_type, reference_id,
                                         description, transaction_date, created_by)
    VALUES (p.brand_id, 'income', p.paid_from_account_id, p.total_bdt,
            'meta_dollar_purchase_reversal', p.id, 'Reversal of cancelled dollar purchase', CURRENT_DATE, auth.uid());

    UPDATE public.meta_fifo_lots SET is_active=false, usd_remaining=0 WHERE id = lot.id;

    INSERT INTO public.meta_ad_wallet_ledger (ad_account_id, entry_date, entry_type, usd_delta, bdt_value,
                                              source_purchase_id, conversion_source, note, balance_usd_after, created_by)
    VALUES (p.ad_account_id, CURRENT_DATE, 'adjustment', -p.usd_amount, -p.total_bdt,
            p.id, 'manual', 'Cancellation reversal',
            (SELECT COALESCE(SUM(usd_delta),0) - p.usd_amount FROM public.meta_ad_wallet_ledger WHERE ad_account_id=p.ad_account_id),
            auth.uid());
  END IF;

  UPDATE public.meta_dollar_purchases
     SET status='cancelled', cancelled_at=now(), cancelled_by=auth.uid(), cancel_reason=_reason
   WHERE id = p.id;

  INSERT INTO public.erp_finance_audit (brand_id, actor_id, action, entity_type, entity_id, after_data)
  VALUES (p.brand_id, auth.uid(), 'cancel', 'meta_dollar_purchase', p.id,
          jsonb_build_object('reason', _reason));

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_meta_dollar_purchase(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.consume_meta_spend_fifo(
  _ad_account_id uuid, _spend_ref text, _usd_spend numeric, _spend_date date, _insight_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    SELECT rate INTO fallback_rate FROM public.erp_fx_rates
      WHERE from_currency='USD' AND to_currency='BDT'
      ORDER BY rate_date DESC LIMIT 1;
    fallback_rate := COALESCE(fallback_rate, 120);
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

  RETURN jsonb_build_object('ok', true, 'delta_usd', delta, 'bdt_cost', total_bdt, 'conversion', conversion);
END;
$$;
GRANT EXECUTE ON FUNCTION public.consume_meta_spend_fifo(uuid, text, numeric, date, uuid) TO authenticated;


CREATE OR REPLACE VIEW public.v_meta_ad_wallet_summary AS
SELECT
  a.id AS ad_account_id,
  a.name AS ad_account_name,
  a.brand_id,
  COALESCE(SUM(CASE WHEN l.entry_type='purchase' THEN l.usd_delta END), 0) AS total_usd_purchased,
  COALESCE(SUM(CASE WHEN l.entry_type='purchase' THEN l.bdt_value END), 0) AS total_bdt_paid,
  COALESCE(SUM(CASE WHEN l.entry_type='spend' THEN -l.usd_delta END), 0) AS total_usd_spent,
  COALESCE(SUM(CASE WHEN l.entry_type='spend' THEN -l.bdt_value END), 0) AS total_bdt_spent,
  COALESCE(SUM(l.usd_delta), 0) AS remaining_usd,
  CASE WHEN COALESCE(SUM(CASE WHEN l.entry_type='purchase' THEN l.usd_delta END),0) > 0
       THEN ROUND(SUM(CASE WHEN l.entry_type='purchase' THEN l.bdt_value END)::numeric
                  / SUM(CASE WHEN l.entry_type='purchase' THEN l.usd_delta END)::numeric, 4)
       ELSE NULL END AS avg_effective_rate,
  (SELECT effective_rate FROM public.meta_dollar_purchases
    WHERE ad_account_id = a.id AND status='confirmed'
    ORDER BY purchase_date DESC, created_at DESC LIMIT 1) AS latest_purchase_rate
FROM public.mkt_ad_accounts a
LEFT JOIN public.meta_ad_wallet_ledger l ON l.ad_account_id = a.id
GROUP BY a.id, a.name, a.brand_id;
GRANT SELECT ON public.v_meta_ad_wallet_summary TO authenticated;


INSERT INTO public.erp_expense_categories (brand_id, name, kind, is_active)
SELECT b.id, c.name, 'expense', true
FROM public.brands b
CROSS JOIN (VALUES
  ('Meta Ad Balance / Prepaid Marketing'),
  ('Meta Ads Expense'),
  ('Bank Charge'),
  ('Payment Processing Fee'),
  ('FX Rate Difference'),
  ('Refund / Adjustment')
) AS c(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.erp_expense_categories e WHERE e.brand_id = b.id AND e.name = c.name
);


ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_dollar_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_ad_wallet_ledger;
