import { useEffect, useState, type ReactNode } from "react";
import { useBrand, type Brand } from "@/contexts/brand-context";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe } from "lucide-react";

/**
 * Hook for pages that operate on a single brand at a time.
 *
 * New behavior (Phase 1 brand-model refactor):
 *  - Never blocks the page. In All-Brands mode it auto-selects the first
 *    available brand so the page renders immediately.
 *  - Returns an inline `picker` node (compact brand switcher) that pages
 *    can mount in their toolbar — page-local override of the global brand.
 *  - `gate` is kept for backward compatibility and is always `null`, so
 *    legacy `if (gate) return gate;` calls become no-ops.
 *
 * Usage:
 *   const { brandId, effectiveBrand, picker } = useBrandPicker();
 *   // render {picker} in your toolbar
 */
export function useBrandPicker(_opts?: { label?: string; hint?: string }) {
  const { activeBrand, brands, isAllBrands } = useBrand();
  const [pickedBrandId, setPickedBrandId] = useState<string>("");

  // Auto-pick the first brand when in All-Brands mode and nothing chosen yet.
  useEffect(() => {
    if (!isAllBrands) return;
    if (pickedBrandId) {
      // make sure it still exists
      if (!brands.some((b) => b.id === pickedBrandId)) setPickedBrandId("");
      return;
    }
    if (brands.length > 0) setPickedBrandId(brands[0].id);
  }, [isAllBrands, brands, pickedBrandId]);

  const effectiveBrand: Brand | null =
    activeBrand ?? brands.find((b) => b.id === pickedBrandId) ?? null;
  const brandId = (effectiveBrand?.id ?? "") as string;

  // Inline picker — shown only in All-Brands mode (otherwise the top
  // BrandSwitcher already shows the single active brand).
  const picker: ReactNode = isAllBrands && brands.length > 1 ? (
    <div className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-xs">
      <Globe className="h-3.5 w-3.5 text-primary" />
      <span className="text-muted-foreground">Brand:</span>
      <Select value={pickedBrandId} onValueChange={setPickedBrandId}>
        <SelectTrigger className="h-7 border-0 bg-transparent px-1.5 text-xs font-medium focus:ring-0">
          <SelectValue placeholder="Pick brand" />
        </SelectTrigger>
        <SelectContent>
          {brands.map((b) => (
            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : null;

  // Back-compat: `gate` is now always null so existing
  // `if (gate) return gate;` short-circuits become no-ops.
  const gate: ReactNode = null;

  return { effectiveBrand, brandId, isAllBrands, pickedBrandId, setPickedBrandId, gate, picker };
}