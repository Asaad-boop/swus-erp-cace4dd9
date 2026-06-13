import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/erp/module-placeholder";

export const Route = createFileRoute("/_authenticated/erp/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — ERP" }] }),
  component: () => <ModulePlaceholder title="Suppliers" description="Supplier directory, due tracking, payment history. Phase 2/3." />,
});