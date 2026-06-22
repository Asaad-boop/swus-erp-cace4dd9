import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JournalPage } from "@/components/erp/finance/pages/journal";
import { RecurringPage } from "@/components/erp/finance/pages/recurring";
import { FinancePage as QuickEntryPage } from "@/components/erp/finance/pages/simple";

type Search = { tab?: "entries" | "recurring" | "quick" };

export const Route = createFileRoute("/_authenticated/erp/finance/journal")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const t = s.tab;
    return { tab: t === "recurring" || t === "quick" ? t : "entries" };
  },
  head: () => ({ meta: [{ title: "Journal — Finance" }] }),
  component: JournalLayout,
});

function JournalLayout() {
  const { tab = "entries" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as Search["tab"] } })} className="w-full">
      <div className="px-4 sm:px-6 pt-4">
        <TabsList>
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="recurring">Recurring</TabsTrigger>
          <TabsTrigger value="quick">Quick Entry</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="entries" className="mt-0"><JournalPage /></TabsContent>
      <TabsContent value="recurring" className="mt-0"><RecurringPage /></TabsContent>
      <TabsContent value="quick" className="mt-0"><QuickEntryPage /></TabsContent>
    </Tabs>
  );
}
