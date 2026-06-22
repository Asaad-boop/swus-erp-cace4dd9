import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductProfitabilityPage } from "@/components/erp/finance/pages/product-profitability";
import { BrandProfitabilityPage } from "@/components/erp/finance/pages/brand-profitability";

type Search = { tab?: "product" | "brand" };

export const Route = createFileRoute("/_authenticated/erp/finance/product-profitability")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: s.tab === "brand" ? "brand" : "product",
  }),
  head: () => ({ meta: [{ title: "Profitability — Finance" }] }),
  component: ProfitabilityLayout,
});

function ProfitabilityLayout() {
  const { tab = "product" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as Search["tab"] } })} className="w-full">
      <div className="px-4 sm:px-6 pt-4">
        <TabsList>
          <TabsTrigger value="product">Product P&L</TabsTrigger>
          <TabsTrigger value="brand">Brand P&L</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="product" className="mt-0"><ProductProfitabilityPage /></TabsContent>
      <TabsContent value="brand" className="mt-0"><BrandProfitabilityPage /></TabsContent>
    </Tabs>
  );
}
