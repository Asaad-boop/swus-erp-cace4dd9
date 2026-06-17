import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BusinessSettings } from "@/components/erp/settings/business-settings";
import { InvoiceSettings } from "@/components/erp/settings/invoice-settings";
import { CourierMappingSettings } from "@/components/erp/settings/courier-mapping-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBrand } from "@/contexts/brand-context";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/erp/settings")({
  head: () => ({ meta: [{ title: "Settings — ERP" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { brands, activeBrand, isAllBrands } = useBrand();
  // Page-local brand selection — default to active brand, otherwise first.
  const [selected, setSelected] = useState<string>(() => activeBrand?.id ?? brands[0]?.id ?? "");

  useEffect(() => {
    if (!selected && brands.length > 0) setSelected(activeBrand?.id ?? brands[0].id);
    if (selected && !brands.some((b) => b.id === selected) && brands.length > 0) {
      setSelected(brands[0].id);
    }
  }, [brands, activeBrand?.id, selected]);

  return (
    <div className="p-4 md:p-6 bg-muted/20 min-h-screen">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Per-brand business, invoice and courier configuration
          </p>
        </div>
      </header>

      {brands.length > 1 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap rounded-xl border bg-card p-2 shadow-sm">
          <Building2 className="h-4 w-4 text-muted-foreground ml-1.5" />
          <span className="text-xs font-medium text-muted-foreground mr-1">Editing brand:</span>
          <div className="flex flex-wrap gap-1">
            {brands.map((b) => {
              const active = b.id === selected;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelected(b.id)}
                  className={
                    "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-background border hover:bg-accent")
                  }
                >
                  {b.name}
                </button>
              );
            })}
          </div>
          {isAllBrands && (
            <span className="ml-auto text-[10px] text-muted-foreground italic pr-2">
              All-Brands mode — change above to edit per brand
            </span>
          )}
        </div>
      )}

      {!selected ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          No brand available.
        </div>
      ) : (
        <Tabs defaultValue="business" className="space-y-4">
          <TabsList>
            <TabsTrigger value="business">Business</TabsTrigger>
            <TabsTrigger value="invoice">Invoice</TabsTrigger>
            <TabsTrigger value="courier">Courier Mapping</TabsTrigger>
          </TabsList>
          {/* key={selected} forces a clean remount when switching brands so
             cached form state from the previous brand doesn't leak in. */}
          <TabsContent value="business">
            <BusinessSettings key={selected} brandIdOverride={selected} />
          </TabsContent>
          <TabsContent value="invoice">
            <InvoiceSettings key={selected} brandIdOverride={selected} />
          </TabsContent>
          <TabsContent value="courier">
            <CourierMappingSettings key={selected} brandIdOverride={selected} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}