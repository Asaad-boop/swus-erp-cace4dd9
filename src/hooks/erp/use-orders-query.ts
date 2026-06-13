import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OrderRow, OrderStatus } from "@/lib/erp/orders";

export type OrdersFilter = {
  brandId: string | null;
  search: string;
  statuses: OrderStatus[];
  source: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  courier: string | null;
  page: number;
  pageSize: number;
};

export function useOrdersQuery(filter: OrdersFilter) {
  return useQuery({
    queryKey: ["orders", filter],
    enabled: !!filter.brandId,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select(
          "id,invoice_no,created_at,status,confirmation_status,total,subtotal,shipping_fee,discount_amount,payment_method,shipping_name,shipping_phone,shipping_address,shipping_city,shipping_district,shipping_thana,guest_name,guest_phone,is_guest_order,user_id,brand_id,source,courier_name,tracking_number,assigned_to,admin_notes,customer_note,call_status,call_attempt_count,delivered_at,shipped_at,confirmed_at",
          { count: "exact" },
        )
        .eq("brand_id", filter.brandId!)
        .order("created_at", { ascending: false });

      if (filter.statuses.length > 0) {
        q = q.in("status", filter.statuses);
        if (filter.statuses.includes("confirmed")) {
          q = q.or("status.neq.confirmed,source.is.null,source.neq.website,web_status.eq.complete");
        }
      } else {
        // Web orders stay in Web Orders until staff confirms them there.
        // In Order List, "Pending" means confirmed operational queue.
        q = q.neq("status", "new");
        q = q.or("status.neq.confirmed,source.is.null,source.neq.website,web_status.eq.complete");
      }
      if (filter.source) q = q.eq("source", filter.source as never);
      if (filter.courier) q = q.eq("courier_name", filter.courier);
      if (filter.dateFrom) q = q.gte("created_at", filter.dateFrom);
      if (filter.dateTo) q = q.lte("created_at", filter.dateTo);
      if (filter.search.trim()) {
        const s = filter.search.trim();
        q = q.or(
          `shipping_name.ilike.%${s}%,shipping_phone.ilike.%${s}%,guest_name.ilike.%${s}%,guest_phone.ilike.%${s}%,tracking_number.ilike.%${s}%`,
        );
      }

      const from = filter.page * filter.pageSize;
      const to = from + filter.pageSize - 1;
      q = q.range(from, to);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as OrderRow[], total: count ?? 0 };
    },
  });
}

export function useOrderDetail(orderId: string | null) {
  return useQuery({
    queryKey: ["order-detail", orderId],
    enabled: !!orderId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const [orderRes, itemsRes, historyRes, notesRes] = await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId!).single(),
        supabase.from("order_items").select("*").eq("order_id", orderId!),
        supabase.from("order_status_history").select("*").eq("order_id", orderId!).order("created_at", { ascending: false }),
        supabase.from("order_notes").select("*").eq("order_id", orderId!).order("created_at", { ascending: false }),
      ]);
      if (orderRes.error) throw orderRes.error;
      return {
        order: orderRes.data,
        items: itemsRes.data ?? [],
        history: historyRes.data ?? [],
        notes: notesRes.data ?? [],
      };
    },
  });
}

export function useStaffList() {
  return useQuery({
    queryKey: ["erp-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,display_name")
        .order("display_name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Counts per status for the status-tabs strip. Scoped to brand + global filters
// (search/date/source/courier) but NOT to the active status filter so all tabs stay accurate.
export function useOrderStatusCounts(filter: OrdersFilter) {
  return useQuery({
    queryKey: ["orders-status-counts", filter.brandId, filter.search, filter.source, filter.courier, filter.dateFrom, filter.dateTo],
    enabled: !!filter.brandId,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("status", { count: "exact" })
        .eq("brand_id", filter.brandId!)
        .neq("status", "new")
        .or("status.neq.confirmed,source.is.null,source.neq.website,web_status.eq.complete")
        .limit(10000);

      if (filter.source) q = q.eq("source", filter.source as never);
      if (filter.courier) q = q.eq("courier_name", filter.courier);
      if (filter.dateFrom) q = q.gte("created_at", filter.dateFrom);
      if (filter.dateTo) q = q.lte("created_at", filter.dateTo);
      if (filter.search.trim()) {
        const s = filter.search.trim();
        q = q.or(
          `shipping_name.ilike.%${s}%,shipping_phone.ilike.%${s}%,guest_name.ilike.%${s}%,guest_phone.ilike.%${s}%,tracking_number.ilike.%${s}%`,
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      const counts: Record<string, number> = {};
      let total = 0;
      for (const row of (data ?? []) as { status: OrderStatus }[]) {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        total++;
      }
      return { counts, total };
    },
  });
}