
-- Internal SECURITY DEFINER functions: revoke anon/public EXECUTE
REVOKE EXECUTE ON FUNCTION public.has_hr_access(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_hr_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hr_next_employee_code() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_crm_customers_mv() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_case_number(text) FROM anon, PUBLIC;

-- Trigger functions (only fired by triggers, never called as RPC)
REVOKE EXECUTE ON FUNCTION public.crm_log_order_activity() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_orders_stock_reservation() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_return_case_number() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_exchange_case_number() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_return_timeline() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_exchange_timeline() FROM anon, PUBLIC;

-- Grant back to authenticated/service_role where needed
GRANT EXECUTE ON FUNCTION public.has_hr_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_hr_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_next_employee_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_case_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_crm_customers_mv() TO service_role;

-- Storefront/guest-facing functions kept executable by anon (intentional):
--   lookup_order_by_phone, lookup_order_by_id, upsert_abandoned_cart,
--   mark_abandoned_cart_converted, is_recent_guest_order
