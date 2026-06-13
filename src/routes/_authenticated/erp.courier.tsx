import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/erp/module-placeholder";

export const Route = createFileRoute("/_authenticated/erp/courier")({
  head: () => ({ meta: [{ title: "Courier — ERP" }] }),
  component: () => <ModulePlaceholder title="Courier" description="Pathao / Steadfast / RedX integration. Phase 4." />,
});