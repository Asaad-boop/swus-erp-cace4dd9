import { createFileRoute } from "@tanstack/react-router";
import { BusinessSettings } from "@/components/erp/settings/business-settings";

export const Route = createFileRoute("/_authenticated/erp/settings")({
  head: () => ({ meta: [{ title: "Settings — ERP" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="p-4 md:p-6 bg-muted/20 min-h-screen">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Brand, invoice and business configuration</p>
      </header>
      <BusinessSettings />
    </div>
  );
}