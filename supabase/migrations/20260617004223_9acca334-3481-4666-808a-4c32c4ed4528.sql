
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC', r.nspname, r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon', r.nspname, r.proname, r.args);
  END LOOP;
END$$;

-- Re-grant to authenticated for general-purpose helpers used by RLS / app code.
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'has_role(uuid,app_role)',
    'has_brand_access(uuid,uuid)',
    'has_permission(uuid,text)',
    'is_finance_staff(uuid)',
    'is_marketing_staff(uuid)',
    'current_cargo_agent_id()',
    'acquire_order_lock(uuid,boolean)',
    'heartbeat_order_lock(uuid)',
    'add_order_note(uuid,text,boolean)',
    'get_order_courier_cost(uuid)',
    'get_customer_stats(uuid)',
    'get_fx_rate(uuid,text,text,date)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END LOOP;
END$$;
