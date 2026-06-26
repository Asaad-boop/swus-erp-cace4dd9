import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { pathaoCitiesFn, pathaoZonesFn, pathaoAreasFn } from "@/lib/erp/pathao.functions";
import { applyBrandScope } from "@/lib/erp/apply-brand-scope";

export type PathaoCity = { city_id: number; city_name: string };
export type PathaoZone = { zone_id: number; zone_name: string };
export type PathaoArea = { area_id: number; area_name: string };

export type Shipment = {
  id: string;
  order_id: string;
  provider: string;
  consignment_id: string | null;
  tracking_code: string | null;
  status: string | null;
  delivery_fee: number | null;
  created_at: string;
  brand_id: string | null;
  orders?: { id: string; shipping_name: string | null; shipping_phone: string | null; total: number } | null;
};

export function useShipments() {
  const { brandIds } = useBrand();
  return useQuery({
    queryKey: ["courier-shipments", brandIds.join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("courier_shipments")
        .select("id, order_id, provider, consignment_id, tracking_code, status, delivery_fee, created_at, brand_id, orders(id, shipping_name, shipping_phone, total)")
        .order("created_at", { ascending: false })
        .limit(200);
      q = applyBrandScope(q, brandIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Shipment[]) ?? [];
    },
  });
}

export function usePathaoCities(brandId?: string | null) {
  const fn = useServerFn(pathaoCitiesFn);
  return useQuery({
    queryKey: ["pathao-cities-raw", brandId ?? null],
    queryFn: async () => ((await fn({ data: brandId ? { brandId } : {} })).items as PathaoCity[]),
    staleTime: 1000 * 60 * 60,
  });
}

export function usePathaoZones(cityId: number | null, brandId?: string | null) {
  const fn = useServerFn(pathaoZonesFn);
  return useQuery({
    queryKey: ["pathao-zones-raw", cityId, brandId ?? null],
    enabled: !!cityId,
    queryFn: async () => ((await fn({ data: { cityId: cityId!, brandId: brandId ?? undefined } })).items as PathaoZone[]),
    staleTime: 1000 * 60 * 60,
  });
}

export function usePathaoAreas(zoneId: number | null, brandId?: string | null) {
  const fn = useServerFn(pathaoAreasFn);
  return useQuery({
    queryKey: ["pathao-areas-raw", zoneId, brandId ?? null],
    enabled: !!zoneId,
    queryFn: async () => ((await fn({ data: { zoneId: zoneId!, brandId: brandId ?? undefined } })).items as PathaoArea[]),
    staleTime: 1000 * 60 * 60,
  });
}