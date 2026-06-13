import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCourierRole(supabase: any, userId: string) {
  const [{ data: admin }, { data: ops }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "operations" }),
  ]);
  if (!admin && !ops) throw new Error("Not authorized");
}

export const pathaoCitiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { pathaoCities } = await import("./pathao.server");
    return { items: await pathaoCities() };
  });

export const pathaoZonesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cityId: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { pathaoZones } = await import("./pathao.server");
    return { items: await pathaoZones(data.cityId) };
  });

export const pathaoAreasFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ zoneId: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { pathaoAreas } = await import("./pathao.server");
    return { items: await pathaoAreas(data.zoneId) };
  });

export const pathaoPriceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        item_weight: z.number().positive(),
        recipient_city: z.number().int().positive(),
        recipient_zone: z.number().int().positive(),
        delivery_type: z.union([z.literal(48), z.literal(12)]).default(48),
        item_type: z.union([z.literal(1), z.literal(2)]).default(2),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { pathaoPrice, defaultStoreId } = await import("./pathao.server");
    return { price: await pathaoPrice({ store_id: defaultStoreId(), ...data }) };
  });

export const pathaoBookOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        recipient_city: z.number().int().positive(),
        recipient_zone: z.number().int().positive(),
        recipient_area: z.number().int().positive().optional(),
        item_weight: z.number().positive(),
        item_quantity: z.number().int().positive().default(1),
        amount_to_collect: z.number().nonnegative(),
        item_description: z.string().max(500).optional(),
        special_instruction: z.string().max(500).optional(),
        delivery_type: z.union([z.literal(48), z.literal(12)]).default(48),
        item_type: z.union([z.literal(1), z.literal(2)]).default(2),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { supabase, userId } = context;

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, brand_id, shipping_name, shipping_phone, guest_name, guest_phone, shipping_address, shipping_thana, shipping_city, total")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order) throw new Error("Order not found");

    const name = order.shipping_name || order.guest_name || "Customer";
    const phone = order.shipping_phone || order.guest_phone || "";
    const address = [order.shipping_address, order.shipping_thana, order.shipping_city].filter(Boolean).join(", ");

    const { pathaoCreateOrder, defaultStoreId } = await import("./pathao.server");
    const merchantId = order.id.slice(0, 8).toUpperCase();
    const result: any = await pathaoCreateOrder({
      store_id: defaultStoreId(),
      merchant_order_id: merchantId,
      recipient_name: name,
      recipient_phone: phone,
      recipient_address: address,
      recipient_city: data.recipient_city,
      recipient_zone: data.recipient_zone,
      recipient_area: data.recipient_area,
      delivery_type: data.delivery_type,
      item_type: data.item_type,
      special_instruction: data.special_instruction,
      item_quantity: data.item_quantity,
      item_weight: data.item_weight,
      amount_to_collect: data.amount_to_collect,
      item_description: data.item_description,
    });

    const consignment = result?.consignment_id || result?.data?.consignment_id || null;
    const tracking = result?.tracking_code || result?.data?.tracking_code || null;
    const fee = Number(result?.delivery_fee ?? result?.data?.delivery_fee ?? 0);
    const status = result?.order_status || result?.data?.order_status || "Pickup_Requested";

    const { data: shipment, error: sErr } = await supabase
      .from("courier_shipments")
      .insert({
        order_id: order.id,
        brand_id: order.brand_id,
        provider: "pathao",
        consignment_id: consignment,
        merchant_order_id: merchantId,
        tracking_code: tracking,
        delivery_fee: fee || null,
        status,
        request_payload: data as never,
        response_payload: result as never,
        created_by: userId,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    if (fee > 0) {
      await supabase.rpc("record_courier_expense", { _shipment_id: shipment.id, _amount: fee, _account_id: null });
    }

    await supabase
      .from("orders")
      .update({ courier_name: "pathao", courier_assigned_at: new Date().toISOString(), tracking_number: consignment })
      .eq("id", order.id);

    return { shipmentId: shipment.id, consignment, tracking, fee, status };
  });

export const pathaoTrackFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ shipmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCourierRole(context.supabase, context.userId);
    const { supabase } = context;
    const { data: ship, error } = await supabase
      .from("courier_shipments")
      .select("id, consignment_id, provider")
      .eq("id", data.shipmentId)
      .maybeSingle();
    if (error) throw error;
    if (!ship?.consignment_id) throw new Error("Shipment has no consignment id");

    const { pathaoTrack } = await import("./pathao.server");
    const info: any = await pathaoTrack(ship.consignment_id);
    const status = info?.order_status || info?.data?.order_status || info?.status || null;

    if (status) {
      await supabase
        .from("courier_shipments")
        .update({ status, response_payload: info as never, updated_at: new Date().toISOString() })
        .eq("id", ship.id);
    }
    return { status, info };
  });