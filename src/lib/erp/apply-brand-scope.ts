/**
 * Apply brand scope to a Supabase query builder using `.in()`.
 * When brandIds is empty the query is returned unchanged — callers should
 * gate the query with `enabled: brandIds.length > 0` to avoid empty matches.
 */
export function applyBrandScope<T>(
  query: T,
  brandIds: string[] | null | undefined,
  column: string = "brand_id",
): T {
  if (!brandIds || brandIds.length === 0) return query;
  // @ts-expect-error - Supabase query builder is generic
  return query.in(column, brandIds);
}