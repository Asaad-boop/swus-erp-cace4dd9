import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BrandListing = {
  id: string;
  product_id: string;
  brand_id: string;
  price: number | null;
  compare_at_price: number | null;
  slug: string;
  title_override: string | null;
  image_override: string | null;
  description_override: string | null;
  is_active: boolean;
  display_order: number;
};

export function useProductListings(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["product-listings", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_brand_listings")
        .select("*")
        .eq("product_id", productId!)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as BrandListing[];
    },
  });
}

export type ListingDraft = {
  brand_id: string;
  price: number | null;
  compare_at_price: number | null;
  slug: string;
  title_override: string | null;
  image_override: string | null;
  description_override: string | null;
  is_active: boolean;
};

export function useSaveProductListings(productId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (drafts: ListingDraft[]) => {
      if (!productId) throw new Error("No product id");
      // Fetch existing to compute deletes
      const { data: existing, error: exErr } = await supabase
        .from("product_brand_listings")
        .select("id,brand_id")
        .eq("product_id", productId);
      if (exErr) throw exErr;
      const wantedBrands = new Set(drafts.map((d) => d.brand_id));
      const toDelete = (existing ?? []).filter((e) => !wantedBrands.has(e.brand_id)).map((e) => e.id);
      if (toDelete.length > 0) {
        const { error } = await supabase.from("product_brand_listings").delete().in("id", toDelete);
        if (error) throw error;
      }
      if (drafts.length > 0) {
        const rows = drafts.map((d) => ({ ...d, product_id: productId }));
        const { error } = await supabase
          .from("product_brand_listings")
          .upsert(rows, { onConflict: "product_id,brand_id" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product-listings", productId] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}