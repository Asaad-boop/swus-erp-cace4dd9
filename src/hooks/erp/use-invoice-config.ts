import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mergeInvoiceConfig, type InvoiceConfig } from "@/lib/erp/invoice-config";

export function useInvoiceConfig(brandId: string | null | undefined) {
  return useQuery({
    queryKey: ["invoice-config", brandId],
    enabled: !!brandId,
    queryFn: async (): Promise<InvoiceConfig> => {
      const [settingsRes, brandRes] = await Promise.all([
        supabase.from("erp_settings").select("config").eq("brand_id", brandId!).maybeSingle(),
        supabase.from("brands").select("settings").eq("id", brandId!).maybeSingle(),
      ]);
      if (settingsRes.error) throw settingsRes.error;
      const raw = (settingsRes.data?.config as { invoice?: unknown } | null)?.invoice;
      const cfg = mergeInvoiceConfig(raw);
      // Fall back to brand.settings for empty business fields
      const bs = (brandRes.data?.settings ?? {}) as Record<string, any>;
      const pick = (k: string, fb: string) => (cfg.business as any)[k] || (bs[k] ?? "") || fb;
      cfg.business = {
        address: pick("address", ""),
        hotline: pick("hotline", bs.business_mobile ?? ""),
        whatsapp: pick("whatsapp", ""),
        email: pick("email", ""),
        website: pick("website", ""),
        facebook: pick("facebook", ""),
        instagram: pick("instagram", ""),
        bin: pick("bin", ""),
        trade_license: pick("trade_license", ""),
      };
      // Address fallback
      if (!cfg.business.address && bs.business_address) cfg.business.address = bs.business_address;
      return cfg;
    },
    staleTime: 60 * 1000,
  });
}