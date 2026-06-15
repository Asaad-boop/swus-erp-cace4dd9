import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Brand = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
};

type BrandContextValue = {
  brands: Brand[];
  activeBrand: Brand | null;
  setActiveBrandId: (id: string) => void;
  isLoading: boolean;
};

const BrandContext = createContext<BrandContextValue | null>(null);
const STORAGE_KEY = "erp.activeBrandId";

export function BrandProvider({ children }: { children: ReactNode }) {
  const { data: brands = [], isLoading } = useQuery({
    queryKey: ["brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id,name,slug,logo_url,is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Brand[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const [activeBrandId, setActiveBrandIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    if (brands.length === 0) return;

    const savedBrandExists = activeBrandId
      ? brands.some((b) => b.id === activeBrandId)
      : false;

    if (!activeBrandId || !savedBrandExists) {
      const defaultId = brands.find((b) => b.slug === "hobby-shop")?.id ?? brands[0].id;
      setActiveBrandIdState(defaultId);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, defaultId);
    }
  }, [brands, activeBrandId]);

  const setActiveBrandId = (id: string) => {
    setActiveBrandIdState(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  };

  const value = useMemo<BrandContextValue>(() => ({
    brands,
    activeBrand: brands.find((b) => b.id === activeBrandId) ?? null,
    setActiveBrandId,
    isLoading,
  }), [brands, activeBrandId, isLoading]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used inside BrandProvider");
  return ctx;
}