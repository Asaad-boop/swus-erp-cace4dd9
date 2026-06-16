REVOKE EXECUTE ON FUNCTION public.imp_get_or_create_account(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.imp_get_or_create_account(uuid, text, text, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.imp_next_po_number(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.imp_next_po_number(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.brand_create_default_warehouse() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.brand_create_default_warehouse() TO service_role;