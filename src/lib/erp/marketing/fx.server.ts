import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Latest USD→BDT rate for a brand from erp_fx_rates.
 * Returns 0 when no rate has been entered — callers should treat that as
 * "no conversion available" rather than substituting a hardcoded value.
 */
export async function getBrandUsdBdt(
  supabase: SupabaseClient<any>,
  brandId: string,
): Promise<number> {
  const { data } = await supabase
    .from("erp_fx_rates")
    .select("rate")
    .eq("brand_id", brandId)
    .eq("from_ccy", "USD")
    .eq("to_ccy", "BDT")
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const r = Number(data?.rate);
  return Number.isFinite(r) && r > 0 ? r : 0;
}