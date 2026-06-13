import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/erp/module-placeholder";

export const Route = createFileRoute("/_authenticated/erp/orders")({
  head: () => ({ meta: [{ title: "Orders — ERP" }] }),
  component: () => <ModulePlaceholder title="Orders" description="Order list, filters, drawer, manual order creation. Coming in Phase 1." />,
});