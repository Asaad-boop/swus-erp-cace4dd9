import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReconciliationStats = {
  orderStatus: Record<string, number>;
  paymentStatus: Record<string, number>;
  totals: {
    totalOrders: number;
    shippedNotDelivered: number; // booked/in-transit but not marked delivered
    deliveredNotReconciled: number; // delivered but no invoice row applied
    reconciledOrders: number; // orders with an applied reconciliation row
    paidOrders: number;
    unpaidOrders: number;
    pendingStatusChange: number; // courier marks delivered but order.status != delivered
    noShipmentBooked: number; // confirmed orders without a courier_shipment row
  };
};

export const getReconciliationStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ brandId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ReconciliationStats> => {
    const { supabase } = context;
    const brandId = data.brandId;

    // Pull all orders for brand (lightweight cols)
    const { data: orders, error: ordErr } = await supabase
      .from("orders")
      .select("id, status, payment_status")
      .eq("brand_id", brandId)
      .limit(10000);
    if (ordErr) throw new Error(ordErr.message);
    const all = orders ?? [];

    const orderStatus: Record<string, number> = {};
    const paymentStatus: Record<string, number> = {};
    for (const o of all) {
      const s = (o.status ?? "unknown") as string;
      orderStatus[s] = (orderStatus[s] ?? 0) + 1;
      const p = (o.payment_status ?? "unpaid") as string;
      paymentStatus[p] = (paymentStatus[p] ?? 0) + 1;
    }

    const deliveredOrderIds = all.filter((o) => o.status === "delivered").map((o) => o.id);
    const confirmedOrderIds = all
      .filter((o) => o.status === "confirmed" || o.status === "in_transit")
      .map((o) => o.id);

    // Reconciled orders (rows applied)
    let reconciledOrders = 0;
    let reconciledIds = new Set<string>();
    if (all.length) {
      const { data: appliedRows } = await supabase
        .from("erp_reconciliation_rows")
        .select("matched_order_id, run:run_id(brand_id)")
        .not("applied_income_txn_id", "is", null)
        .not("matched_order_id", "is", null)
        .limit(20000);
      reconciledIds = new Set(
        (appliedRows ?? [])
          .filter((r) => {
            const run = (r as { run?: { brand_id?: string } | null }).run;
            return run?.brand_id === brandId;
          })
          .map((r) => r.matched_order_id as string),
      );
      reconciledOrders = reconciledIds.size;
    }

    const deliveredNotReconciled = deliveredOrderIds.filter((id) => !reconciledIds.has(id)).length;

    // Shipments: courier says delivered but order not delivered yet
    let pendingStatusChange = 0;
    let bookedOrderIds = new Set<string>();
    {
      const { data: ships } = await supabase
        .from("courier_shipments")
        .select("order_id, status")
        .eq("brand_id", brandId)
        .limit(20000);
      const shipsArr = ships ?? [];
      bookedOrderIds = new Set(shipsArr.map((s) => s.order_id));
      const orderStatusById = new Map(all.map((o) => [o.id, o.status as string]));
      for (const s of shipsArr) {
        const sStatus = String(s.status ?? "").toLowerCase();
        const oStatus = orderStatusById.get(s.order_id);
        if (sStatus.includes("deliver") && oStatus && oStatus !== "delivered") {
          pendingStatusChange++;
        }
      }
    }

    const shippedNotDelivered = all.filter(
      (o) => bookedOrderIds.has(o.id) && o.status !== "delivered",
    ).length;
    const noShipmentBooked = confirmedOrderIds.filter((id) => !bookedOrderIds.has(id)).length;

    return {
      orderStatus,
      paymentStatus,
      totals: {
        totalOrders: all.length,
        shippedNotDelivered,
        deliveredNotReconciled,
        reconciledOrders,
        paidOrders: paymentStatus["paid"] ?? 0,
        unpaidOrders: paymentStatus["unpaid"] ?? 0,
        pendingStatusChange,
        noShipmentBooked,
      },
    };
  });