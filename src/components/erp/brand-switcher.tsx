import { Check, ChevronsUpDown, Store, Globe } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function BrandSwitcher() {
  const { brands, activeBrand, setActiveBrandId, isAllBrands } = useBrand();
  const label = isAllBrands ? `All Brands (${brands.length})` : (activeBrand?.name ?? "Select brand");

  return (
    <div className="flex items-center gap-2">
      {isAllBrands && (
        <span className="hidden md:inline text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Showing all brands
        </span>
      )}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 min-w-[180px] justify-between">
          <span className="flex items-center gap-2 truncate">
            {isAllBrands ? <Globe className="h-4 w-4 text-primary" /> : <Store className="h-4 w-4 text-muted-foreground" />}
            <span className="font-medium truncate">{label}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel>Switch brand</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setActiveBrandId("all")} className="flex items-center justify-between">
          <span className="flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> All Brands</span>
          <Check className={cn("h-4 w-4", isAllBrands ? "opacity-100" : "opacity-0")} />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {brands.map((b) => (
          <DropdownMenuItem key={b.id} onSelect={() => setActiveBrandId(b.id)} className="flex items-center justify-between">
            <span>{b.name}</span>
            <Check className={cn("h-4 w-4", activeBrand?.id === b.id ? "opacity-100" : "opacity-0")} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  );
}