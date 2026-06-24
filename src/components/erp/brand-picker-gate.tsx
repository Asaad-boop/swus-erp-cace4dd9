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
  const { activeBrand, brands } = useBrand();
  const [pickedBrandId, setPickedBrandId] = useState<string>("");

  // Seed the page-local picker from the global active brand on first render,
  // but after that the picker is fully independent of the header switcher.
  useEffect(() => {
    if (pickedBrandId) {
      // drop stale selection if the brand was deleted
      if (!brands.some((b) => b.id === pickedBrandId)) setPickedBrandId("");
      return;
    }
    if (activeBrand) setPickedBrandId(activeBrand.id);
  }, [activeBrand, brands, pickedBrandId]);

  const effectiveBrand: Brand | null =
    brands.find((b) => b.id === pickedBrandId) ?? null;
  const brandId = (effectiveBrand?.id ?? "") as string;

  // Inline picker — always visible. Page-local override of the header brand.
  // Empty selection means "no brand", and the page hides its data.
  const picker: ReactNode = (
    <div className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1 text-xs">
      <Globe className="h-3.5 w-3.5 text-primary" />
      <span className="text-muted-foreground">Brand:</span>
      <Select value={pickedBrandId || undefined} onValueChange={setPickedBrandId}>
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
  );

  // Back-compat: `gate` is now always null so existing
  // `if (gate) return gate;` short-circuits become no-ops.
  const gate: ReactNode = null;

  return { effectiveBrand, brandId, isAllBrands: !effectiveBrand, pickedBrandId, setPickedBrandId, gate, picker };
}