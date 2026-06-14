import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAbandonedCartsFn,
  countAbandonedCartsFn,
} from "@/lib/erp/abandoned-carts.functions";

export function useAbandonedCartsQuery(args: {
  brandId: string | null;
  search: string;
  page: number;
  pageSize: number;
  enabled: boolean;
}) {
  const fn = useServerFn(listAbandonedCartsFn);
  return useQuery({
    queryKey: ["abandoned-carts", args.brandId, args.search, args.page, args.pageSize],
    enabled: args.enabled,
    queryFn: () =>
      fn({
        data: {
          brandId: args.brandId,
          search: args.search,
          page: args.page,
          pageSize: args.pageSize,
        },
      }),
  });
}

export function useAbandonedCartCount(brandId: string | null) {
  const fn = useServerFn(countAbandonedCartsFn);
  return useQuery({
    queryKey: ["abandoned-carts-count", brandId],
    enabled: true,
    staleTime: 30_000,
    queryFn: async () => {
      const r = await fn({ data: { brandId } });
      return r.count;
    },
  });
}