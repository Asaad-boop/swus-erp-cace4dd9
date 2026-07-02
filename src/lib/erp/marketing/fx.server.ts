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

/**
 * Latest USD→BDT rate for each of the given brands.
 * Missing brands are set to 0 (no conversion available).
 */
export async function getBrandUsdBdtMap(
  supabase: SupabaseClient<any>,
  brandIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!brandIds.length) return out;
  const { data } = await supabase
    .from("erp_fx_rates")
    .select("brand_id, rate, rate_date")
    .in("brand_id", brandIds)
    .eq("from_ccy", "USD")
    .eq("to_ccy", "BDT")
    .order("rate_date", { ascending: false });
  for (const row of (data ?? []) as any[]) {
    if (out.has(row.brand_id)) continue; // first (latest) wins
    const r = Number(row.rate);
    if (Number.isFinite(r) && r > 0) out.set(row.brand_id, r);
  }
  for (const id of brandIds) if (!out.has(id)) out.set(id, 0);
  return out;
}