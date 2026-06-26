import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAllowedPages } from "@/lib/erp/permissions/page-perms.functions";

/**
 * Current user's allowed page paths (null = no override, use role defaults).
 * Cached 5 min — invalidate `["my-allowed-pages"]` after admin updates.
 */
export function useMyAllowedPages() {
  const fn = useServerFn(getMyAllowedPages);
  const q = useQuery({
    queryKey: ["my-allowed-pages"],
    queryFn: () => fn(),
    staleTime: 5 * 60 * 1000,
  });
  return {
    allowedPages: q.data?.allowedPages ?? null,
    isLoading: q.isLoading,
  };
}