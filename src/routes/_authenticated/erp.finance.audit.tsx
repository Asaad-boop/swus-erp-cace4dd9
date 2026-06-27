import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/finance/audit")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/finance/dollar-purchase" });
  },
});
