import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/erp/module-placeholder";

export const Route = createFileRoute("/_authenticated/erp/inventory")({
  head: () => ({ meta: [{ title: "Inventory — ERP" }] }),
  component: () => <ModulePlaceholder title="Inventory" description="Stock management, variants, low stock alerts. Phase 2." />,
});