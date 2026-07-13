DO $$
DECLARE
  ddl text;
BEGIN
  SELECT pg_get_functiondef('public.imp_post_to_inventory(jsonb)'::regprocedure) INTO ddl;
  ddl := replace(ddl, E'              total_cost_value = COALESCE(vs.cost_sum, 0),\n', '');
  ddl := replace(ddl, E'            total_cost_value = COALESCE(total_cost_value,0) + v_row_total_cost,\n', '');
  EXECUTE ddl;
END $$;