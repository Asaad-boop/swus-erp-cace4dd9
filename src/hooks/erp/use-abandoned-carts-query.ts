import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AbandonedCartRow } from "@/lib/erp/abandoned-carts.functions";

export function useAbandonedCartsQuery(args: {
  brandId: string | null;
  search: string;
  page: number;
  pageSize: number;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["abandoned-carts", args.brandId, args.search, args.page, args.pageSize],
    enabled: args.enabled,
    queryFn: async () => {
      const from = args.page * args.pageSize;
      const to = from + args.pageSize - 1;

      let q = supabase
        .from("abandoned_carts")
        .select("*", { count: "exact" })
        .eq("is_converted", false)
        .not("customer_phone", "is", null)
        .gt("subtotal", 0)
        .order("updated_at", { ascending: false });

      if (args.brandId) q = q.eq("brand_id", args.brandId);
      if (args.search.trim()) {
        const s = args.search.trim();
        q = q.or(`customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%,customer_email.ilike.%${s}%`);
      }

      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as AbandonedCartRow[], total: count ?? 0 };
    },
  });
}

export function useAbandonedCartCount(brandId: string | null) {
  return useQuery({
    queryKey: ["abandoned-carts-count", brandId],
    enabled: true,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("abandoned_carts")
        .select("id", { count: "exact", head: true })
        .eq("is_converted", false)
        .not("customer_phone", "is", null)
        .gt("subtotal", 0);
      if (brandId) q = q.eq("brand_id", brandId);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
}