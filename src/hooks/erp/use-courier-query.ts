import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/brand-context";
import { pathaoCitiesFn, pathaoZonesFn, pathaoAreasFn } from "@/lib/erp/pathao.functions";

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
  const { activeBrand } = useBrand();
  const activeBrandId = activeBrand?.id ?? null;
  return useQuery({
    queryKey: ["courier-shipments", activeBrandId],
    queryFn: async () => {
      let q = supabase
        .from("courier_shipments")
        .select("id, order_id, provider, consignment_id, tracking_code, status, delivery_fee, created_at, brand_id, orders(id, shipping_name, shipping_phone, total)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (activeBrandId) q = q.eq("brand_id", activeBrandId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Shipment[]) ?? [];
    },
  });
}

export function usePathaoCities() {
  const fn = useServerFn(pathaoCitiesFn);
  return useQuery({
    queryKey: ["pathao-cities"],
    queryFn: async () => ((await fn({ data: {} })).items as PathaoCity[]),
    staleTime: 1000 * 60 * 60,
  });
}

export function usePathaoZones(cityId: number | null) {
  const fn = useServerFn(pathaoZonesFn);
  return useQuery({
    queryKey: ["pathao-zones", cityId],
    enabled: !!cityId,
    queryFn: async () => ((await fn({ data: { cityId: cityId! } })).items as PathaoZone[]),
    staleTime: 1000 * 60 * 60,
  });
}

export function usePathaoAreas(zoneId: number | null) {
  const fn = useServerFn(pathaoAreasFn);
  return useQuery({
    queryKey: ["pathao-areas", zoneId],
    enabled: !!zoneId,
    queryFn: async () => ((await fn({ data: { zoneId: zoneId! } })).items as PathaoArea[]),
    staleTime: 1000 * 60 * 60,
  });
}