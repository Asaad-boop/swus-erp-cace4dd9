/**
 * Apply brand scope to a Supabase query builder using `.in()`.
 * When brandIds is empty the query is returned unchanged — callers should
 * gate the query with `enabled: brandIds.length > 0` to avoid empty matches.
 */
export function applyBrandScope<T>(
  query: T,
  brandIds: string[] | null | undefined,
  column: string = "brand_id",
  options: { includeNull?: boolean } = {},
): T {
  if (!brandIds || brandIds.length === 0) {
    if (options.includeNull) {
      // @ts-expect-error - Supabase query builder is generic
      return query.is(column, null);
    }
    // @ts-expect-error - Supabase query builder is generic
    return query.in(column, ['__none__']);
  }
  if (options.includeNull) {
    const list = brandIds.map((id) => `"${id}"`).join(",");
    // @ts-expect-error - Supabase query builder is generic
    return query.or(`${column}.in.(${list}),${column}.is.null`);
  }
  // @ts-expect-error - Supabase query builder is generic
  return query.in(column, brandIds);
}