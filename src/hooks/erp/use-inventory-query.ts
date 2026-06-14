import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProductRow, StockMovementRow } from "@/lib/erp/inventory";

export type InventoryFilter = {
  brandId: string | null;
  search: string;
  stockState: "all" | "in" | "low" | "out";
  page: number;
  pageSize: number;
};

export function useInventoryQuery(filter: InventoryFilter) {
  return useQuery({
    queryKey: ["inventory", filter],
    enabled: !!filter.brandId,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select(
          "id,title,slug,image,price,stock,low_stock_threshold,is_active,brand_id,category_id,updated_at,cost_price,sku,barcode,reorder_point",
          { count: "exact" },
        )
        .order("updated_at", { ascending: false });
      if (filter.brandId) q = q.eq("brand_id", filter.brandId);
      if (filter.search.trim()) {
        const s = filter.search.trim();
        q = q.or(`title.ilike.%${s}%,sku.ilike.%${s}%,barcode.ilike.%${s}%,slug.ilike.%${s}%`);
      }
      if (filter.stockState === "out") q = q.lte("stock", 0);
      if (filter.stockState === "in") q = q.gt("stock", 0);
      // "low" is handled client-side because it compares two columns
      const from = filter.page * filter.pageSize;
      const to = from + filter.pageSize - 1;
      q = q.range(from, to);
      const { data, error, count } = await q;
      if (error) throw error;
      let rows = (data ?? []) as ProductRow[];
      if (filter.stockState === "low") {
        rows = rows.filter((r) => r.stock > 0 && r.stock <= (r.low_stock_threshold ?? 5));
      }
      return { rows, total: count ?? rows.length };
    },
  });
}

export function useLowStockAlerts(brandId: string | null) {
  return useQuery({
    queryKey: ["low-stock", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("low_stock_alerts")
        .select("id,product_id,current_stock,threshold,created_at,is_resolved,products!inner(id,title,slug,image,brand_id,stock,low_stock_threshold)")
        .eq("is_resolved", false)
        .eq("products.brand_id", brandId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStockMovements(brandId: string | null, productId?: string | null) {
  return useQuery({
    queryKey: ["stock-movements", brandId, productId ?? null],
    enabled: !!brandId,
    queryFn: async () => {
      let q = supabase
        .from("stock_movements")
        .select("id,created_at,product_id,user_id,delta,stock_before,stock_after,reason,note,brand_id")
        .order("created_at", { ascending: false })
        .limit(500);
      if (brandId) q = q.eq("brand_id", brandId);
      if (productId) q = q.eq("product_id", productId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StockMovementRow[];
    },
  });
}

export function useProductTitles(ids: string[]) {
  return useQuery({
    queryKey: ["product-titles", ids.sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,title,slug,image")
        .in("id", ids);
      if (error) throw error;
      const map = new Map<string, { title: string; slug: string; image: string | null }>();
      for (const p of data ?? []) map.set(p.id, { title: p.title, slug: p.slug, image: p.image });
      return map;
    },
  });
}