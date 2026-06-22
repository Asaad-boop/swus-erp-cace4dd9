import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WalletsPage } from "@/components/erp/finance/pages/wallets";
import { ReconPage } from "@/components/erp/finance/pages/reconciliation";

type Search = { tab?: "wallets" | "reconciliation" };

export const Route = createFileRoute("/_authenticated/erp/finance/wallets")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: s.tab === "reconciliation" ? "reconciliation" : "wallets",
  }),
  head: () => ({ meta: [{ title: "Wallets — Finance" }] }),
  component: WalletsLayout,
});

function WalletsLayout() {
  const { tab = "wallets" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as Search["tab"] } })} className="w-full">
      <div className="px-4 sm:px-6 pt-4">
        <TabsList>
          <TabsTrigger value="wallets">Wallets</TabsTrigger>
          <TabsTrigger value="reconciliation">Bank Reconciliation</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="wallets" className="mt-0"><WalletsPage /></TabsContent>
      <TabsContent value="reconciliation" className="mt-0"><ReconPage /></TabsContent>
    </Tabs>
  );
}
