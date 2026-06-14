import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mergeInvoiceConfig, type InvoiceConfig } from "@/lib/erp/invoice-config";

export function useInvoiceConfig(brandId: string | null | undefined) {
  return useQuery({
    queryKey: ["invoice-config", brandId],
    enabled: !!brandId,
    queryFn: async (): Promise<InvoiceConfig> => {
      const { data, error } = await supabase
        .from("erp_settings")
        .select("config")
        .eq("brand_id", brandId!)
        .maybeSingle();
      if (error) throw error;
      const raw = (data?.config as { invoice?: unknown } | null)?.invoice;
      return mergeInvoiceConfig(raw);
    },
    staleTime: 60 * 1000,
  });
}