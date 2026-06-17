import { useState, type ReactNode } from "react";
import { useBrand, type Brand } from "@/contexts/brand-context";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe } from "lucide-react";

/**
 * Hook for pages that must operate on a single brand at a time.
 * In All-Brands mode the user picks a target brand inline; nothing
 * else in the page has to change.
 *
 * Usage:
 *   const { effectiveBrand, brandId, gate } = useBrandPicker();
 *   if (gate) return gate;
 *   // ... rest of the page can rely on brandId !== null
 */
export function useBrandPicker(opts?: { label?: string; hint?: string }) {
  const { activeBrand, brands, isAllBrands } = useBrand();
  const [pickedBrandId, setPickedBrandId] = useState<string>("");
  const effectiveBrand: Brand | null =
    activeBrand ?? brands.find((b) => b.id === pickedBrandId) ?? null;
  const brandId = effectiveBrand?.id ?? null;

  let gate: ReactNode = null;
  if (!brandId) {
    if (isAllBrands) {
      gate = (
        <Card>
          <CardContent className="py-8 space-y-3 max-w-sm">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Globe className="h-4 w-4 text-primary" />
              {opts?.label ?? "Pick a brand"}
            </div>
            <p className="text-xs text-muted-foreground">
              {opts?.hint ?? "All-Brands mode — eta brand-specific page, ekta brand select koro."}
            </p>
            <Select value={pickedBrandId} onValueChange={setPickedBrandId}>
              <SelectTrigger><SelectValue placeholder="Choose brand" /></SelectTrigger>
              <SelectContent>
                {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      );
    } else {
      gate = (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Select a brand first.
          </CardContent>
        </Card>
      );
    }
  }

  return { effectiveBrand, brandId, isAllBrands, pickedBrandId, setPickedBrandId, gate };
}