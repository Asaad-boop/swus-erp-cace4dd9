CREATE OR REPLACE FUNCTION public.imp_delete_po(_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_brand uuid;
  v_mov record;
  v_je_ids uuid[];
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT public.has_role(v_user, 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT brand_id INTO v_brand FROM public.imp_purchase_orders WHERE id = _po_id;
  IF v_brand IS NULL THEN RAISE EXCEPTION 'PO not found'; END IF;

  FOR v_mov IN
    SELECT id, product_id, variant_id, delta
    FROM public.stock_movements
    WHERE reference_id IN (SELECT id FROM public.imp_cartons WHERE po_id = _po_id)
       OR (reference_type = 'imp_po' AND reference_id = _po_id)
  LOOP
    IF v_mov.variant_id IS NOT NULL THEN
      UPDATE public.product_variants
         SET stock = GREATEST(0, COALESCE(stock,0) - v_mov.delta)
       WHERE id = v_mov.variant_id;
    ELSIF v_mov.product_id IS NOT NULL THEN
      UPDATE public.products
         SET stock = GREATEST(0, COALESCE(stock,0) - v_mov.delta)
       WHERE id = v_mov.product_id;
    END IF;
    DELETE FROM public.stock_movements WHERE id = v_mov.id;
  END LOOP;

  SELECT COALESCE(array_agg(journal_entry_id), '{}')
    INTO v_je_ids
    FROM public.imp_payments
   WHERE po_id = _po_id AND journal_entry_id IS NOT NULL;

  UPDATE public.imp_cargo_bills SET po_id = NULL WHERE po_id = _po_id;

  DELETE FROM public.imp_payments WHERE po_id = _po_id;

  IF array_length(v_je_ids, 1) > 0 THEN
    DELETE FROM public.erp_journal_lines    WHERE journal_entry_id = ANY(v_je_ids);
    DELETE FROM public.erp_journal_entries  WHERE id = ANY(v_je_ids);
  END IF;

  DELETE FROM public.erp_journal_lines
   WHERE journal_entry_id IN (
     SELECT id FROM public.erp_journal_entries
      WHERE source_type IN ('imp_payment','imp_po','imp_carton')
        AND (source_id = _po_id
             OR source_id IN (SELECT id FROM public.imp_cartons WHERE po_id = _po_id))
   );
  DELETE FROM public.erp_journal_entries
   WHERE source_type IN ('imp_payment','imp_po','imp_carton')
     AND (source_id = _po_id
          OR source_id IN (SELECT id FROM public.imp_cartons WHERE po_id = _po_id));

  DELETE FROM public.imp_carton_items WHERE carton_id IN (SELECT id FROM public.imp_cartons WHERE po_id = _po_id);
  DELETE FROM public.imp_cartons      WHERE po_id = _po_id;
  DELETE FROM public.imp_po_items     WHERE po_id = _po_id;
  DELETE FROM public.imp_status_history
   WHERE entity_type = 'imp_po' AND entity_id = _po_id
      OR entity_type = 'imp_carton' AND entity_id IN (SELECT id FROM public.imp_cartons WHERE po_id = _po_id);
  DELETE FROM public.imp_purchase_orders WHERE id = _po_id;

  RETURN jsonb_build_object('ok', true, 'po_id', _po_id);
END $$;