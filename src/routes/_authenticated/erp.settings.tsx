import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/erp/module-placeholder";

export const Route = createFileRoute("/_authenticated/erp/settings")({
  head: () => ({ meta: [{ title: "Settings — ERP" }] }),
  component: () => <ModulePlaceholder title="Settings" description="Brand settings, ERP config, user roles & permissions." />,
});