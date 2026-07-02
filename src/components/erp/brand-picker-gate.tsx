import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useBrand, type Brand } from "@/contexts/brand-context";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

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

/**
 * Multi-brand picker — allows selecting one or more brands at once.
 * Returns `brandIds: string[]` and a `picker` node. Selection is stored
 * per-page (component state) and defaults to the header active brand,
 * or all brands when the header is in "All Brands" mode.
 */
export function useMultiBrandPicker() {
  const { activeBrand, brands, isAllBrands } = useBrand();
  const [selected, setSelected] = useState<string[]>([]);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || brands.length === 0) return;
    if (isAllBrands) {
      setSelected(brands.map((b) => b.id));
    } else if (activeBrand) {
      setSelected([activeBrand.id]);
    }
    setSeeded(true);
  }, [activeBrand, brands, isAllBrands, seeded]);

  // Drop stale ids if brands change
  useEffect(() => {
    if (!seeded) return;
    const valid = new Set(brands.map((b) => b.id));
    setSelected((cur) => cur.filter((id) => valid.has(id)));
  }, [brands, seeded]);

  const brandIds = selected;
  const selectedBrands = useMemo(
    () => brands.filter((b) => selected.includes(b.id)),
    [brands, selected],
  );

  const label =
    selected.length === 0
      ? "Pick brands"
      : selected.length === brands.length
        ? `All Brands (${brands.length})`
        : selected.length === 1
          ? (selectedBrands[0]?.name ?? "1 brand")
          : `${selected.length} brands`;

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const selectAll = () => setSelected(brands.map((b) => b.id));
  const clearAll = () => setSelected([]);

  const picker: ReactNode = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-8 min-w-[180px] justify-between">
          <span className="flex items-center gap-2 truncate">
            <Globe className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium truncate">{label}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
            Brands
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={selectAll}
              className="text-[11px] text-primary hover:underline"
            >
              All
            </button>
            <span className="text-muted-foreground/50">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] text-muted-foreground hover:underline"
            >
              None
            </button>
          </div>
        </div>
        <div className="max-h-64 overflow-auto space-y-0.5">
          {brands.map((b) => {
            const checked = selected.includes(b.id);
            return (
              <label
                key={b.id}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted",
                  checked && "bg-primary/5",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(b.id)}
                />
                <span className="flex-1 truncate">{b.name}</span>
                {checked && <Check className="h-3.5 w-3.5 text-primary" />}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );

  return { brandIds, selectedBrands, setSelected, picker };
}