import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/erp/finance/payables")({
  beforeLoad: () => {
    throw redirect({ to: "/erp/finance/receivables", search: { tab: "payables" } });
  },
});
