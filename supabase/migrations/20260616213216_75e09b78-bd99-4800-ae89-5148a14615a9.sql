CREATE OR REPLACE FUNCTION public._imp_post_journal(
  _brand_id uuid,
  _entry_date date,
  _description text,
  _source_type text,
  _source_id uuid,
  _lines jsonb,
  _user uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry_id uuid;
  v_entry_no text;
  v_seq int;
  v_total_debit numeric(18,4) := 0;
  v_total_credit numeric(18,4) := 0;
  v_line jsonb;
  v_acc_brand uuid;
  v_attempts int := 0;
  v_month text := to_char(_entry_date,'YYYYMM');
BEGIN
  IF _lines IS NULL OR jsonb_array_length(_lines) < 2 THEN
    RAISE EXCEPTION 'Journal must have at least 2 lines';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_total_debit  := v_total_debit  + COALESCE((v_line->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + COALESCE((v_line->>'credit')::numeric, 0);
    SELECT brand_id INTO v_acc_brand FROM erp_chart_accounts WHERE id = (v_line->>'account_id')::uuid;
    IF v_acc_brand IS NULL OR v_acc_brand <> _brand_id THEN
      RAISE EXCEPTION 'Account brand mismatch';
    END IF;
  END LOOP;

  IF round(v_total_debit,4) <> round(v_total_credit,4) THEN
    RAISE EXCEPTION 'Journal not balanced: debit %, credit %', v_total_debit, v_total_credit;
  END IF;
  IF v_total_debit <= 0 THEN
    RAISE EXCEPTION 'Journal totals must be positive';
  END IF;

  -- Per (brand, month) numbering with retry on unique violation
  LOOP
    v_attempts := v_attempts + 1;
    SELECT COALESCE(MAX(
      NULLIF(regexp_replace(entry_no, '^JE-' || v_month || '-', ''), '')::int
    ), 0) + 1
    INTO v_seq
    FROM erp_journal_entries
    WHERE brand_id = _brand_id
      AND entry_no LIKE 'JE-' || v_month || '-%';

    v_entry_no := 'JE-' || v_month || '-' || lpad(v_seq::text, 5, '0');

    BEGIN
      INSERT INTO erp_journal_entries (brand_id, entry_no, entry_date, description, source_type, source_id, status, created_by)
      VALUES (_brand_id, v_entry_no, _entry_date, _description, _source_type, _source_id, 'posted', _user)
      RETURNING id INTO v_entry_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempts >= 10 THEN
        RAISE EXCEPTION 'Could not allocate journal entry number after % attempts', v_attempts;
      END IF;
    END;
  END LOOP;

  INSERT INTO erp_journal_lines (brand_id, journal_entry_id, account_id, debit, credit, description, line_order)
  SELECT _brand_id, v_entry_id, (l->>'account_id')::uuid,
         COALESCE((l->>'debit')::numeric, 0),
         COALESCE((l->>'credit')::numeric, 0),
         l->>'description',
         (ord - 1)::int
  FROM jsonb_array_elements(_lines) WITH ORDINALITY AS t(l, ord);

  RETURN v_entry_id;
END $$;

REVOKE EXECUTE ON FUNCTION public._imp_post_journal(uuid,date,text,text,uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;