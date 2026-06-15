
-- 1) Reviews: tighten SELECT policy so non-staff can only see their OWN rows (user_id IS NOT NULL AND matches)
DROP POLICY IF EXISTS "reviews staff and owner read" ON public.reviews;
CREATE POLICY "reviews staff and owner read"
ON public.reviews
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'customer_service'::public.app_role)
  OR (user_id IS NOT NULL AND auth.uid() = user_id)
);

-- 2) Revoke EXECUTE from PUBLIC/anon/authenticated on all SECURITY DEFINER functions in public schema
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', r.proname, r.args);
  END LOOP;
END $$;

-- 3) Re-grant EXECUTE to authenticated only for functions intentionally callable by signed-in users
--    (RLS helpers + RPCs invoked from client/server code)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_guest_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_recent_guest_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_order_lock(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_order_lock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_lock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_order_note(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, public.order_status, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_account_balance(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_stock(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_inventory_fields(uuid, integer, integer, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(uuid, numeric, uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_courier_expense(uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_courier_expense(uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_profit_loss(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_no(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reapply_invoice_prefix(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_order_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rls_audit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_abandoned_cart_converted(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text) TO authenticated;

-- 4) upsert_abandoned_cart is called by guests too (anonymous checkout)
GRANT EXECUTE ON FUNCTION public.upsert_abandoned_cart(uuid, text, text, text, text, text, text, text, text, numeric, jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text) TO anon;
