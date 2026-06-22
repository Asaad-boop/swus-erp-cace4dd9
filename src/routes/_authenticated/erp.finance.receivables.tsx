import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReceivablesPage } from "@/components/erp/finance/pages/receivables";
import { PayablesPage } from "@/components/erp/finance/pages/payables";
import { CodRemittancePage } from "@/components/erp/finance/pages/cod-remittance";

type Search = { tab?: "receivables" | "payables" | "cod" };

export const Route = createFileRoute("/_authenticated/erp/finance/receivables")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const t = s.tab;
    return { tab: t === "payables" || t === "cod" ? t : "receivables" };
  },
  head: () => ({ meta: [{ title: "AR / AP — Finance" }] }),
  component: ArApLayout,
});

function ArApLayout() {
  const { tab = "receivables" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as Search["tab"] } })} className="w-full">
      <div className="px-4 sm:px-6 pt-4">
        <TabsList>
          <TabsTrigger value="receivables">Receivables</TabsTrigger>
          <TabsTrigger value="payables">Payables</TabsTrigger>
          <TabsTrigger value="cod">COD Remittance</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="receivables" className="mt-0"><ReceivablesPage /></TabsContent>
      <TabsContent value="payables" className="mt-0"><PayablesPage /></TabsContent>
      <TabsContent value="cod" className="mt-0"><CodRemittancePage /></TabsContent>
    </Tabs>
  );
}
