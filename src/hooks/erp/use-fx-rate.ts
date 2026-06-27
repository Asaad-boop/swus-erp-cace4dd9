import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Latest USD→BDT rate from erp_fx_rates (brand-scoped, falls back to global latest).
 * Returns `null` while loading or when no rate has been entered — callers should
 * skip BDT-side conversions until a real rate exists (no hardcoded fallback).
 */
export function useUsdBdtRate(brandIds: string[] = []) {
  return useQuery({
    queryKey: ["fx_usd_bdt", brandIds.join(",")],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number | null> => {
      let q = supabase
        .from("erp_fx_rates")
        .select("rate, rate_date")
        .eq("from_ccy", "USD")
        .eq("to_ccy", "BDT")
        .order("rate_date", { ascending: false })
        .limit(1);
      if (brandIds.length) q = q.in("brand_id", brandIds);
      const { data } = await q;
      const r = Number(data?.[0]?.rate);
      return Number.isFinite(r) && r > 0 ? r : null;
    },
  });
}