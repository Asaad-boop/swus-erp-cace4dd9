import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AbandonedCartItem = {
  product_id?: string;
  id?: string;
  variant_id?: string | null;
  variant_label?: string | null;
  name?: string;
  image?: string | null;
  price?: number;
  unit_price?: number;
  qty?: number;
  quantity?: number;
};

export type AbandonedCartRow = {
  id: string;
  brand_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_district: string | null;
  shipping_thana: string | null;
  cart_items: AbandonedCartItem[];
  subtotal: number;
  last_step: string | null;
  is_converted: boolean;
  converted_order_id: string | null;
  created_at: string;
  updated_at: string;
};

export const listAbandonedCartsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      brandId: z.string().uuid().nullable().optional(),
      brandIds: z.array(z.string().uuid()).optional(),
      search: z.string().optional(),
      page: z.number().int().min(0).default(0),
      pageSize: z.number().int().min(1).max(200).default(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [admin, customerService, operations] = await Promise.all([
      supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: context.userId, _role: "customer_service" }),
      supabase.rpc("has_role", { _user_id: context.userId, _role: "operations" }),
    ]);
    const roleError = admin.error ?? customerService.error ?? operations.error;
    if (roleError) throw new Error(roleError.message);
    if (!admin.data && !customerService.data && !operations.data) {
      throw new Error("Not authorized to view incomplete checkouts");
    }

    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = supabase
      .from("abandoned_carts")
      .select("*", { count: "exact" })
      .eq("is_converted", false)
      .not("customer_phone", "is", null)
      .gt("subtotal", 0)
      .order("updated_at", { ascending: false });

    if (data.brandIds && data.brandIds.length > 0) {
      q = q.in("brand_id", data.brandIds);
    } else if (data.brandId) {
      q = q.eq("brand_id", data.brandId);
    }

    if (data.search?.trim()) {
      const s = data.search.trim();
      q = q.or(
        `customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%,customer_email.ilike.%${s}%`,
      );
    }

    q = q.range(from, to);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as AbandonedCartRow[], total: count ?? 0 };
  });

export const countAbandonedCartsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      brandId: z.string().uuid().nullable().optional(),
      brandIds: z.array(z.string().uuid()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [admin, customerService, operations] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "customer_service" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operations" }),
    ]);
    const roleError = admin.error ?? customerService.error ?? operations.error;
    if (roleError) throw new Error(roleError.message);
    if (!admin.data && !customerService.data && !operations.data) {
      throw new Error("Not authorized to view incomplete checkouts");
    }

    let q = context.supabase
      .from("abandoned_carts")
      .select("id", { count: "exact", head: true })
      .eq("is_converted", false)
      .not("customer_phone", "is", null)
      .gt("subtotal", 0);
    if (data.brandIds && data.brandIds.length > 0) {
      q = q.in("brand_id", data.brandIds);
    } else if (data.brandId) {
      q = q.eq("brand_id", data.brandId);
    }
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const deleteAbandonedCartFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [admin, customerService, operations] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "customer_service" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operations" }),
    ]);
    const roleError = admin.error ?? customerService.error ?? operations.error;
    if (roleError) throw new Error(roleError.message);
    if (!admin.data && !customerService.data && !operations.data) {
      throw new Error("Not authorized to delete incomplete checkouts");
    }

    const { error } = await context.supabase
      .from("abandoned_carts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const convertAbandonedCartFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      brandId: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [admin, customerService, operations] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "customer_service" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operations" }),
    ]);
    const roleError = admin.error ?? customerService.error ?? operations.error;
    if (roleError) throw new Error(roleError.message);
    if (!admin.data && !customerService.data && !operations.data) {
      throw new Error("Not authorized to confirm incomplete checkouts");
    }

    const supabaseAdmin = context.supabase;

    const { data: cart, error: cartErr } = await supabaseAdmin
      .from("abandoned_carts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (cartErr) throw new Error(cartErr.message);
    if (!cart) throw new Error("Cart not found");
    if (cart.is_converted) throw new Error("Already converted");

    const items = (cart.cart_items as unknown as AbandonedCartItem[]) ?? [];
    if (!items.length) throw new Error("Cart has no items");

    const subtotal = items.reduce((s, it) => {
      const price = Number(it.unit_price ?? it.price ?? 0);
      const qty = Number(it.quantity ?? it.qty ?? 1);
      return s + price * qty;
    }, 0);
    const total = subtotal; // shipping/discount = 0 by default; staff can adjust later

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        brand_id: data.brandId,
        source: "website" as never,
          status: "confirmed" as never,
        confirmation_status: "pending" as never,
        subtotal,
        total,
        shipping_fee: 0,
        discount_amount: 0,
        is_guest_order: true,
        shipping_name: cart.customer_name,
        shipping_phone: cart.customer_phone,
        shipping_address: cart.shipping_address,
        shipping_city: cart.shipping_city,
        shipping_district: cart.shipping_district,
        shipping_thana: cart.shipping_thana,
        guest_name: cart.customer_name,
        guest_phone: cart.customer_phone,
        payment_method: "cod",
          customer_note: `Recovered from incomplete checkout (last step: ${cart.last_step ?? "unknown"})`,
          confirmed_by: context.userId,
      })
      .select("id, invoice_no")
      .single();
    if (oErr) throw new Error(oErr.message);

    const itemRows = items
      .filter((it) => it.product_id || it.id)
      .map((it) => {
        const price = Number(it.unit_price ?? it.price ?? 0);
          const qty = Number(it.quantity ?? it.qty ?? 1);
        return {
          order_id: order.id,
          product_id: (it.product_id ?? it.id)!,
          variant_id: it.variant_id ?? null,
          variant_label: it.variant_label ?? null,
          name: it.name ?? "Item",
          image: it.image ?? null,
          price,
          unit_price: price,
          quantity: qty,
          line_total: price * qty,
        };
      });

    if (itemRows.length) {
      const { error: iErr } = await supabaseAdmin.from("order_items").insert(itemRows);
      if (iErr) throw new Error(iErr.message);
    }

    await supabaseAdmin.rpc("mark_abandoned_cart_converted", {
      _id: data.id,
      _order_id: order.id,
    });

    return { orderId: order.id, invoiceNo: order.invoice_no };
  });