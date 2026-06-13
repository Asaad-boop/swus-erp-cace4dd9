import { Check, ChevronsUpDown, Store } from "lucide-react";
import { useBrand } from "@/contexts/brand-context";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function BrandSwitcher() {
  const { brands, activeBrand, setActiveBrandId } = useBrand();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2 min-w-[180px] justify-between">
          <span className="flex items-center gap-2 truncate">
            <Store className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium truncate">{activeBrand?.name ?? "Select brand"}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel>Switch brand</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {brands.map((b) => (
          <DropdownMenuItem key={b.id} onSelect={() => setActiveBrandId(b.id)} className="flex items-center justify-between">
            <span>{b.name}</span>
            <Check className={cn("h-4 w-4", activeBrand?.id === b.id ? "opacity-100" : "opacity-0")} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}