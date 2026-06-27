import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsPage } from "@/components/erp/finance/pages/settings";
import { AuditPage } from "@/components/erp/finance/pages/audit";

type Search = { tab?: "general" | "audit" };

export const Route = createFileRoute("/_authenticated/erp/finance/settings")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const t = s.tab;
    return { tab: t === "audit" ? t : "general" };
  },
  head: () => ({ meta: [{ title: "Settings — Finance" }] }),
  component: SettingsLayout,
});

function SettingsLayout() {
  const { tab = "general" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as Search["tab"] } })} className="w-full">
      <div className="px-4 sm:px-6 pt-4">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="general" className="mt-0"><SettingsPage /></TabsContent>
      <TabsContent value="audit" className="mt-0"><AuditPage /></TabsContent>
    </Tabs>
  );
}
