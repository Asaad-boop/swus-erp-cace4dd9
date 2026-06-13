import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/erp/module-placeholder";

export const Route = createFileRoute("/_authenticated/erp/finance")({
  head: () => ({ meta: [{ title: "Finance — ERP" }] }),
  component: () => <ModulePlaceholder title="Finance" description="Accounts, transactions, P&L reports. Phase 3." />,
});